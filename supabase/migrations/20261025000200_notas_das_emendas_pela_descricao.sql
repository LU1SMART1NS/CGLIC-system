-- ==============================================================================
-- MIGRATION 200: NOTA DA EMENDA PELA DESCRIÇÃO NO SIAFI
-- Versão: 20261025000200_notas_das_emendas_pela_descricao.sql
--
-- Conferência no SEI de 25/10/2026 (PDF das notas): as notas 2026NE000380 e 2026NE000384 da UG 200330 são do pedido
-- 495 (35 carabinas e 6 miras, emenda 43670006, Dep. Eriberto Medeiros). A descrição da nota no SIAFI diz "despesas da
-- emenda parlamentar 43670006", mas o plano interno cadastrado é o de outra emenda (SP999S94316, "202643670016"). A
-- gravação pelo Tesouro (migrations 184, 188, 197) só olha o plano interno e as recusou (SEM_PLANO_DA_EMENDA); as 4
-- linhas do pedido ficaram sem nota. O STA devolve a descrição no campo `observacao` da nota.
--
-- 1) nota_descreve_emenda(observacao, emenda): a descrição cita "emenda (parlamentar) <nº>" (com ou sem o ano à frente).
-- 2) gravar_notas_do_tesouro (versão da 197): sem nota com o plano interno da emenda, vale a única UG cuja descrição
--    cita a emenda. O plano interno guardado na nota leva a emenda da descrição à frente ("SP999S94316 - Emenda
--    202643670006 (descrição da nota no SIAFI) - plano interno no SIAFI: …"), como a 192 faz com o Portal, para as
--    regras que leem o número da emenda no plano interno; o detalhe da tentativa diz que foi pela descrição.
--    O servidor passa a mandar a descrição (sincronizar-fontes publicada antes desta migration; sem o campo, nada muda).
-- 3) As 58 tentativas SEM_PLANO_DA_EMENDA de notas que nenhum pedido cita (porta de entrada da 188) saem, para o
--    servidor perguntar cada uma de novo, uma vez, com a regra nova. As citadas no SEI já são perguntadas todo dia.
-- 4) emendas_ligar_notas, regra SEI sem contrato (s2, migrations 192 e 194): com várias notas do fornecedor sem
--    contrato, a linha fica com a única cujo valor é a quantidade da própria linha × o preço da ata. Faltava o caso de
--    linhas do mesmo item com quantidades diferentes (só vale para a linha que é a única do pedido com esse item e essa
--    quantidade; linhas iguais seguem a regra da 194): pedido 528, Renault, linha de 1 veículo = 2026NE000235
--    (R$ 191.811,62) e linha de 4 = 2026NE000272 (R$ 767.246,48). A citação do SEI desse pedido dizia 2026NE000273 e
--    foi corrigida para a 272 em 25/10/2026 (conferida no PDF da nota); sem esta regra, as duas linhas ficariam sem
--    nota. Muda só o bloco s2, na definição em produção (mesmo jeito da migration 136), com a marca "(migration 200)".
-- Se a CGOFI corrigir o plano interno no SIAFI, nada muda aqui: a nota já está gravada (e a leitura pelo contrato, se
-- vier, atualiza a mesma linha).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) A descrição da nota cita a emenda?
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nota_descreve_emenda(p_observacao TEXT, p_emenda TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(p_emenda ~ '^[0-9]{8}$'
    AND upper(p_observacao) ~ ('EMENDAS?(\s+PARLAMENTAR(ES)?)?[^0-9]{0,15}(20[0-9]{2})?\s?' || p_emenda || '([^0-9]|$)'), FALSE);
$$;

COMMENT ON FUNCTION public.nota_descreve_emenda(TEXT, TEXT) IS
  'Descrição da nota no SIAFI com "emenda (parlamentar) <nº>" (com ou sem o ano à frente). Migration 200.';

REVOKE ALL ON FUNCTION public.nota_descreve_emenda(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nota_descreve_emenda(TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Gravação (igual à 197, mais a regra pela descrição)
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
  v_pela_descricao TEXT;  -- emenda achada só na descrição da nota (migration 200)
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
    v_situacao := NULL; v_detalhe := NULL; v_ug := NULL; v_pi_330 := NULL; v_pela_descricao := NULL;

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
    -- Migration 200: sem plano interno da emenda, vale a nota cuja descrição no SIAFI diz "emenda parlamentar <nº>" de
    -- um pedido (ex.: 2026NE000380/384, emenda 43670006, com o plano interno de outra emenda cadastrado no SIAFI).
    IF jsonb_array_length(v_casadas) = 0 THEN
      SELECT COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_casadas
        FROM jsonb_array_elements(v_cand) r
       WHERE EXISTS (SELECT 1 FROM unnest(v_n.emendas) em WHERE public.nota_descreve_emenda(r->>'observacao', em));
      IF jsonb_array_length(v_casadas) = 1 THEN
        SELECT em INTO v_pela_descricao FROM unnest(v_n.emendas) em
         WHERE public.nota_descreve_emenda(v_casadas->0->>'observacao', em) ORDER BY em LIMIT 1;
      END IF;
    END IF;

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
      -- Pela descrição (migration 200): a emenda da descrição vai à frente no plano interno guardado, para as regras que
      -- leem o número da emenda no plano interno (nota_casa_com_emenda); o plano do SIAFI fica depois, para conferência.
      IF v_pela_descricao IS NOT NULL THEN
        v_pi := btrim(COALESCE(v_cand->>'picodigo', '')) || ' - Emenda ' || v_ano || v_pela_descricao
                || ' (descrição da nota no SIAFI) - plano interno no SIAFI: ' || COALESCE(NULLIF(btrim(v_cand->>'pidescricao'), ''), '?');
        v_detalhe := left('Emenda ' || v_pela_descricao || ' pela descrição da nota; o plano interno no SIAFI ('
                          || btrim(COALESCE(v_cand->>'picodigo', '') || ' ' || COALESCE(v_cand->>'pidescricao', ''))
                          || ') não é o da emenda.', 300);
      END IF;
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
-- 3) Perguntar de novo, uma vez, as notas não citadas recusadas pelo plano interno
-- ------------------------------------------------------------------------------
DELETE FROM public.emenda_notas_tesouro_tentativas t
 WHERE t.situacao = 'SEM_PLANO_DA_EMENDA'
   AND NOT EXISTS (SELECT 1 FROM public.emenda_pedido_documentos_sei d
                    WHERE d.etapa = 'EMPENHO' AND upper(btrim(d.nota_empenho)) = t.numero_oficial);

-- ------------------------------------------------------------------------------
-- 4) emendas_ligar_notas: nota com o valor da própria linha (bloco s2)
-- ------------------------------------------------------------------------------
DO $migracao$
DECLARE
  v_marca CONSTANT TEXT := '(migration 200)';
  v_def   TEXT := pg_get_functiondef('public.emendas_ligar_notas()'::regprocedure);
  v_novo  TEXT;
  v_ponto TEXT;
BEGIN
  IF position(v_marca IN v_def) > 0 THEN
    RETURN;
  END IF;
  FOREACH v_ponto IN ARRAY ARRAY[
    'abs(e.valor_empenhado - forn.preco * l.quantidade) <= 0.05 AS bate_linha',
    'OR max(par.empenho_id::TEXT) IS NOT NULL THEN 1',
    'ELSE max(par.empenho_id::TEXT)::UUID END AS empenho_id',
    'ELSE max(par.contract_key) END AS contract_key'] LOOP
    IF (length(v_def) - length(replace(v_def, v_ponto, ''))) / length(v_ponto) <> 1 THEN
      RAISE EXCEPTION 'emendas_ligar_notas mudou: o trecho "%" não aparece uma vez só. Nada foi alterado.', v_ponto;
    END IF;
  END LOOP;
  -- a linha é a única do pedido com esse item e essa quantidade, e a nota tem o valor dela
  v_novo := replace(v_def, 'abs(e.valor_empenhado - forn.preco * l.quantidade) <= 0.05 AS bate_linha',
    'abs(e.valor_empenhado - forn.preco * l.quantidade) <= 0.05 AS bate_linha,
                 abs(e.valor_empenhado - forn.preco * l.quantidade) <= 0.05
                   AND (SELECT count(*) FROM l l3 WHERE l3.pedido_id = l.pedido_id AND l3.item_key = l.item_key
                                                    AND l3.quantidade = l.quantidade) = 1 AS bate_linha_unica /* ' || v_marca || ' */');
  v_novo := replace(v_novo, 'OR max(par.empenho_id::TEXT) IS NOT NULL THEN 1',
    'OR max(par.empenho_id::TEXT) IS NOT NULL
                          OR count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_linha_unica) = 1 /* valor da própria linha ' || v_marca || ' */ THEN 1');
  v_novo := replace(v_novo, 'ELSE max(par.empenho_id::TEXT)::UUID END AS empenho_id',
    'WHEN count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_linha_unica) = 1 AND max(par.empenho_id::TEXT) IS NULL
                       THEN (array_agg(s2c.empenho_id) FILTER (WHERE s2c.bate_linha_unica))[1] /* ' || v_marca || ' */
                     ELSE max(par.empenho_id::TEXT)::UUID END AS empenho_id');
  v_novo := replace(v_novo, 'ELSE max(par.contract_key) END AS contract_key',
    'WHEN count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_linha_unica) = 1 AND max(par.empenho_id::TEXT) IS NULL
                       THEN (array_agg(s2c.contract_key) FILTER (WHERE s2c.bate_linha_unica))[1] /* ' || v_marca || ' */
                     ELSE max(par.contract_key) END AS contract_key');
  EXECUTE v_novo;
END;
$migracao$;
