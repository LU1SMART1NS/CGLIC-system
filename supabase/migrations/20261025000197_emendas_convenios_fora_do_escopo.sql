-- ==============================================================================
-- MIGRATION 197: NOTAS DE CONVÊNIO FORA DAS EMENDAS DA CGLIC
-- Versão: 20261025000197_emendas_convenios_fora_do_escopo.sql
--
-- A porta de entrada da migration 188 traz do Tesouro toda nota da UG 200330 cujo plano interno é de uma emenda que
-- tem pedido. A mesma emenda parlamentar paga compras (atas da CGLIC) e convênios com estados e municípios; os
-- convênios vieram junto. Medição de 25/10/2026: 12 notas TESOURO, R$ 10,34 mi, natureza 3.3.30.41, 4.4.30.41 ou
-- 4.4.40.41 (contribuições a estados e municípios), todas do "PORTAL DOS CONVENIOS" no STA (ex.: 2026NE000203, convênio
-- 998935/2026 com o Município de São Carlos). Nenhuma ligada a linha de pedido, contrato, distribuição ou leitura do
-- Portal; uma tem 1 evento no histórico. Convênio não é escopo deste sistema.
--
-- O que muda
-- 1) emenda_notas_tesouro_tentativas aceita a situação FORA_DO_ESCOPO.
-- 2) gravar_notas_do_tesouro (versão da 188) recusa a nota cuja modalidade de aplicação (3ª e 4ª posição da natureza
--    de despesa) não é 90 ou 91 (aplicação direta): situação FORA_DO_ESCOPO, com a natureza e o credor no detalhe.
--    Sem natureza na resposta do STA, segue como antes.
-- 3) notas_das_emendas_a_trazer (versão da 188) não pergunta de novo a nota FORA_DO_ESCOPO. A busca pelo Portal
--    (migration 192) já só olha SEM_PLANO_DA_EMENDA e TESOURO_SEM_A_NOTA.
-- 4) Limpeza: apaga as notas TESOURO/PORTAL de transferência que não estão ligadas a nada (as 12) e os eventos delas
--    (a trava de imutabilidade do histórico sai só durante essa exclusão e volta em seguida), e marca a tentativa
--    como FORA_DO_ESCOPO. Para sem apagar nada se alguma estiver ligada a linha, contrato,
--    distribuição, descarte ou leitura do Portal.
-- Fora desta migration: 3 notas SINCRONIZADO da Caixa (contribuições, valor 0) vêm do Contratos.gov.br no contrato
-- 00059/2024; continuam como a fonte manda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Situação nova
-- ------------------------------------------------------------------------------
ALTER TABLE public.emenda_notas_tesouro_tentativas DROP CONSTRAINT IF EXISTS emenda_notas_tesouro_tentativas_situacao;
ALTER TABLE public.emenda_notas_tesouro_tentativas ADD CONSTRAINT emenda_notas_tesouro_tentativas_situacao
  CHECK (situacao IN ('GRAVADA', 'JA_EXISTIA', 'TESOURO_SEM_A_NOTA', 'SEM_PLANO_DA_EMENDA', 'AS_DUAS_UGS',
                      'SEM_SALDO_CONTABIL', 'FORA_DO_ESCOPO'));

-- ------------------------------------------------------------------------------
-- 2) Gravação: transferência fica fora (igual à 188, mais o ramo FORA_DO_ESCOPO)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_notas_do_tesouro(p_consultadas text[], p_notas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_n        RECORD;
  v_cand     JSONB;
  v_casadas  JSONB;
  v_ug       TEXT;
  v_pi       TEXT;
  v_ano      INTEGER;
  v_chave    TEXT;
  v_situacao TEXT;
  v_detalhe  TEXT;
  v_pi_330   TEXT;
  v_empenhado NUMERIC;
  v_liquidado NUMERIC;
  v_pago      NUMERIC;
  v_contagem JSONB := '{}'::JSONB;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava notas pelo Tesouro.' USING ERRCODE = '42501';
  END IF;
  IF p_notas IS NULL OR jsonb_typeof(p_notas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Envie a lista de respostas do Tesouro.' USING ERRCODE = '22023';
  END IF;

  FOR v_n IN
    SELECT a.numero_oficial AS numero, a.emendas
      FROM public.notas_das_emendas_a_trazer(INTERVAL '0 seconds') a
     WHERE a.numero_oficial = ANY (SELECT upper(btrim(x)) FROM unnest(COALESCE(p_consultadas, ARRAY[]::TEXT[])) x)
  LOOP
    v_situacao := NULL; v_detalhe := NULL; v_ug := NULL; v_pi_330 := NULL;

    -- Respostas do Tesouro para o número, nas duas UGs; as que têm o plano interno da emenda
    SELECT COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_cand
      FROM jsonb_array_elements(p_notas) r
     WHERE upper(btrim(r->>'numero')) = v_n.numero AND r->>'ug' IN ('200330', '200331');
    -- Migration 188: o plano interno da UG das emendas fica guardado, para não perguntar de novo a nota que não é de
    -- nenhum pedido (só volta à fila quando um pedido passa a ter essa emenda).
    SELECT NULLIF(btrim(COALESCE(r->>'picodigo', '') || ' - ' || COALESCE(r->>'pidescricao', '')), '-') INTO v_pi_330
      FROM jsonb_array_elements(v_cand) r WHERE r->>'ug' = '200330' LIMIT 1;
    SELECT COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_casadas
      FROM jsonb_array_elements(v_cand) r
     WHERE EXISTS (SELECT 1 FROM unnest(v_n.emendas) em
                    WHERE public.nota_casa_com_emenda(btrim(COALESCE(r->>'picodigo', '') || ' - ' || COALESCE(r->>'pidescricao', '')), em));

    IF jsonb_array_length(v_cand) = 0 THEN
      v_situacao := 'TESOURO_SEM_A_NOTA';
    ELSIF jsonb_array_length(v_casadas) = 0 THEN
      v_situacao := 'SEM_PLANO_DA_EMENDA';
      v_detalhe := (SELECT string_agg((r->>'ug') || ': ' || COALESCE(r->>'picodigo', '?') || ' ' || COALESCE(r->>'nome', ''), ' | ')
                      FROM jsonb_array_elements(v_cand) r);
    ELSIF jsonb_array_length(v_casadas) > 1 THEN
      v_situacao := 'AS_DUAS_UGS';
    -- Migration 197: só compra da própria CGLIC (modalidade de aplicação 90 ou 91, na 3ª e 4ª posição da natureza de
    -- despesa). Transferência a estado, município ou entidade (30, 40, 50…: convênio, contribuição) fica fora; a nota
    -- não é gravada nem perguntada de novo.
    ELSIF substr(btrim(COALESCE(v_casadas->0->>'naturezadespesa', '')), 3, 2) NOT IN ('', '90', '91') THEN
      v_situacao := 'FORA_DO_ESCOPO';
      v_ug := v_casadas->0->>'ug';
      v_detalhe := left('Transferência, não compra da CGLIC (natureza ' || btrim(v_casadas->0->>'naturezadespesa')
                        || COALESCE(' ' || NULLIF(btrim(v_casadas->0->>'naturezadespesadescricao'), ''), '')
                        || COALESCE(', ' || NULLIF(btrim(v_casadas->0->>'nome'), ''), '') || ').', 300);
    ELSE
      v_cand := v_casadas->0;
      v_ug := v_cand->>'ug';
      v_pi := btrim(COALESCE(v_cand->>'picodigo', '') || ' - ' || COALESCE(v_cand->>'pidescricao', ''));
      v_ano := left(v_n.numero, 4)::INTEGER;
      v_chave := v_ug || '-' || v_ano || '-' || v_ano || 'NE' || (substr(v_n.numero, 7))::INTEGER;

      SELECT sum(s.saldo) FILTER (WHERE s.conta IN ('622920101', '622920102', '622920103', '622920104')),
             sum(s.saldo) FILTER (WHERE s.conta IN ('622920103', '622920104')),
             sum(s.saldo) FILTER (WHERE s.conta = '622920104')
        INTO v_empenhado, v_liquidado, v_pago
        FROM public.empenho_saldo_contabil s
       WHERE s.ug = v_ug AND s.numero_empenho = v_n.numero AND s.ano = v_ano;

      IF v_empenhado IS NULL THEN
        v_situacao := 'SEM_SALDO_CONTABIL';
      ELSE
        INSERT INTO public.empenhos (
          canonical_key, numero_oficial, ano_exercicio, uasg_emitente, numero_normalizado, data_emissao,
          valor_empenhado, valor_liquidado, valor_pago, valor_rpinscrito, credor_nome, credor_cnpj_cpf,
          fonte_origem, informado_manualmente_inicialmente, plano_interno, natureza_despesa, natureza_despesa_descricao,
          last_synced_at)
        VALUES (
          v_chave, v_n.numero, v_ano, v_ug, v_ano || 'NE' || (substr(v_n.numero, 7))::INTEGER,
          COALESCE(NULLIF(v_cand->>'emissao', '')::DATE, make_date(v_ano, 1, 1)),
          GREATEST(v_empenhado, 0), GREATEST(COALESCE(v_liquidado, 0), 0), GREATEST(COALESCE(v_pago, 0), 0), 0,
          NULLIF(btrim(v_cand->>'nome'), ''), NULLIF(btrim(v_cand->>'cpfcnpjugidgener'), ''),
          'TESOURO', FALSE, NULLIF(v_pi, '-'), NULLIF(btrim(v_cand->>'naturezadespesa'), ''),
          NULLIF(btrim(v_cand->>'naturezadespesadescricao'), ''), NOW())
        ON CONFLICT (canonical_key) DO NOTHING;
        v_situacao := CASE WHEN FOUND THEN 'GRAVADA' ELSE 'JA_EXISTIA' END;
      END IF;
    END IF;

    INSERT INTO public.emenda_notas_tesouro_tentativas (numero_oficial, situacao, ug, detalhe, plano_interno, tentativa_em)
    VALUES (v_n.numero, v_situacao, v_ug, v_detalhe, v_pi_330, NOW())
    ON CONFLICT (numero_oficial) DO UPDATE
      SET situacao = EXCLUDED.situacao, ug = EXCLUDED.ug, detalhe = EXCLUDED.detalhe, plano_interno = EXCLUDED.plano_interno,
          tentativa_em = EXCLUDED.tentativa_em;
    v_contagem := jsonb_set(v_contagem, ARRAY[v_situacao], to_jsonb(COALESCE((v_contagem->>v_situacao)::INTEGER, 0) + 1));
  END LOOP;

  RETURN v_contagem;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_notas_do_tesouro(TEXT[], JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_notas_do_tesouro(TEXT[], JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 3) Fila: a nota fora do escopo não volta (igual à 188, mais a condição FORA_DO_ESCOPO)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notas_das_emendas_a_trazer(p_reconsulta interval DEFAULT '1 day'::interval)
 RETURNS TABLE(numero_oficial character varying, emendas text[], tentativa_em timestamp with time zone, situacao character varying)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
  WITH citadas AS (
    SELECT upper(btrim(d.nota_empenho)) AS numero, array_agg(DISTINCT p.siop_emenda) AS emendas
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
     WHERE d.etapa = 'EMPENHO'
       AND upper(btrim(d.nota_empenho)) ~ '^[0-9]{4}NE[0-9]{6}$'
       AND p.siop_emenda IS NOT NULL
     GROUP BY 1
  ),
  -- As emendas de todos os pedidos: a nota achada no saldo contábil pode ser de qualquer uma.
  dos_pedidos AS (
    SELECT array_agg(DISTINCT p.siop_emenda) AS emendas
      FROM public.emenda_pedidos p WHERE p.siop_emenda IS NOT NULL AND p.etapa <> 'CANCELADO'
  ),
  descobertas AS (
    SELECT DISTINCT s.numero_empenho AS numero
      FROM public.empenho_saldo_contabil s
     WHERE s.ug = '200330'
       AND s.numero_empenho ~ '^[0-9]{4}NE[0-9]{6}$'
       AND left(s.numero_empenho, 4)::INTEGER >= EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER - 1
       AND NOT EXISTS (SELECT 1 FROM public.empenhos e WHERE e.numero_oficial = s.numero_empenho AND e.uasg_emitente = '200330')
       AND NOT EXISTS (SELECT 1 FROM citadas c WHERE c.numero = s.numero_empenho)
  ),
  todas AS (
    SELECT c.numero, c.emendas, TRUE AS citada FROM citadas c
    UNION ALL
    SELECT d.numero, (SELECT emendas FROM dos_pedidos), FALSE FROM descobertas d
  )
  SELECT c.numero::VARCHAR, c.emendas, t.tentativa_em, t.situacao
    FROM todas c
    LEFT JOIN public.emenda_notas_tesouro_tentativas t ON t.numero_oficial = c.numero
   WHERE NOT EXISTS (
           SELECT 1 FROM public.empenhos e
            WHERE e.numero_oficial = c.numero
              AND e.uasg_emitente IN ('200330', '200331')
              AND EXISTS (SELECT 1 FROM unnest(c.emendas) em WHERE public.nota_casa_com_emenda(e.plano_interno, em)))
     AND (t.tentativa_em IS NULL OR t.tentativa_em < NOW() - COALESCE(p_reconsulta, INTERVAL '1 day'))
     -- Transferência (convênio) não é perguntada de novo (migration 197).
     AND t.situacao IS DISTINCT FROM 'FORA_DO_ESCOPO'
     -- A achada no saldo contábil que o Tesouro já disse não ser de emenda nenhuma dos pedidos só volta quando algum
     -- pedido passa a ter a emenda do plano interno dela.
     AND (c.citada OR t.situacao IS NULL OR t.situacao <> 'SEM_PLANO_DA_EMENDA'
          OR EXISTS (SELECT 1 FROM unnest(c.emendas) em WHERE public.nota_casa_com_emenda(t.plano_interno, em)))
   ORDER BY c.citada DESC, t.tentativa_em NULLS FIRST, c.numero DESC;
$$;

REVOKE ALL ON FUNCTION public.notas_das_emendas_a_trazer(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notas_das_emendas_a_trazer(INTERVAL) TO service_role;

-- ------------------------------------------------------------------------------
-- 4) Limpeza das notas de convênio já gravadas
-- ------------------------------------------------------------------------------
DO $limpeza$
DECLARE
  v_ligadas INTEGER;
  v_notas   INTEGER;
  v_eventos INTEGER;
BEGIN
  CREATE TEMP TABLE notas_fora_do_escopo ON COMMIT DROP AS
  SELECT e.id, upper(split_part(btrim(e.numero_oficial), ' ', 1)) AS numero,
         left('Transferência, não compra da CGLIC (natureza ' || e.natureza_despesa
              || COALESCE(' ' || NULLIF(btrim(e.natureza_despesa_descricao), ''), '')
              || COALESCE(', ' || NULLIF(btrim(e.credor_nome), ''), '') || '). Apagada na migration 197.', 300) AS detalhe
    FROM public.empenhos e
   WHERE e.fonte_origem IN ('TESOURO', 'PORTAL')
     AND substr(btrim(COALESCE(e.natureza_despesa, '')), 3, 2) NOT IN ('', '90', '91');

  SELECT count(*) INTO v_ligadas
    FROM notas_fora_do_escopo n
   WHERE EXISTS (SELECT 1 FROM public.emenda_linha_notas x WHERE x.empenho_id = n.id)
      OR EXISTS (SELECT 1 FROM public.contrato_empenhos x WHERE x.empenho_id = n.id)
      OR EXISTS (SELECT 1 FROM public.contrato_empenho_distribuicoes x WHERE x.empenho_id = n.id)
      OR EXISTS (SELECT 1 FROM public.contrato_empenho_descartes x WHERE x.empenho_id = n.id)
      OR EXISTS (SELECT 1 FROM public.empenho_leituras_siafi x WHERE x.empenho_id = n.id);
  IF v_ligadas > 0 THEN
    RAISE EXCEPTION 'Migration 197: % nota(s) de transferência estão ligadas a pedido, contrato ou leitura; nada foi apagado.', v_ligadas;
  END IF;

  -- O histórico de eventos não aceita exclusão (trava da migration 16), e a nota apagada leva os eventos junto
  -- (ON DELETE CASCADE). A trava sai só para os eventos destas notas e volta em seguida; a exclusão da nota fica na
  -- auditoria de empenhos. Em 25/10/2026: 1 evento, RECONCILIADO da 2026NE000203 gravado pela migration 195.
  ALTER TABLE public.empenho_eventos_historico DISABLE TRIGGER trg_protect_empenho_eventos_immutability;
  DELETE FROM public.empenho_eventos_historico h USING notas_fora_do_escopo n WHERE h.empenho_id = n.id;
  GET DIAGNOSTICS v_eventos = ROW_COUNT;
  ALTER TABLE public.empenho_eventos_historico ENABLE TRIGGER trg_protect_empenho_eventos_immutability;

  UPDATE public.emenda_notas_tesouro_tentativas t
     SET situacao = 'FORA_DO_ESCOPO', detalhe = n.detalhe, tentativa_em = NOW()
    FROM notas_fora_do_escopo n
   WHERE t.numero_oficial = n.numero;

  DELETE FROM public.empenhos e USING notas_fora_do_escopo n WHERE e.id = n.id;
  GET DIAGNOSTICS v_notas = ROW_COUNT;

  RAISE NOTICE 'Migration 197: % nota(s) de transferência apagada(s), % evento(s).', v_notas, v_eventos;
END
$limpeza$;
