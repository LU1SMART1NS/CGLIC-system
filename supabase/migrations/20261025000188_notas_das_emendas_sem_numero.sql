-- ==============================================================================
-- MIGRATION 188: NOTAS DAS EMENDAS ACHADAS SEM NÚMERO DIGITADO (M2 da revisão de 25/10/2026)
-- Versão: 20261025000188_notas_das_emendas_sem_numero.sql
--
-- O servidor já traz do Tesouro as notas citadas no SEI (migrations 184 e 185), mas o número da nota só existia nos
-- pedidos cujo SEI foi lido; num pedido novo ninguém digita a nota. E as regras de ligação (CONTRATO, ITEM, AUTOR) só
-- enxergam notas que estão num contrato, e a nota da emenda (UG 200330) quase nunca está.
--
-- 1) Porta de entrada nova: notas_das_emendas_a_trazer passa a listar também as notas da UG 200330 que o saldo contábil
--    do Tesouro tem (migration 128, lido 4 vezes por dia) e o sistema não, do ano atual e do anterior. O servidor
--    pergunta o plano interno ao STA, como já faz, e gravar_notas_do_tesouro grava a que for de uma emenda dos pedidos.
--    Medição de 25/10/2026: 148 notas de 2026 e 131 de 2025 nessa situação (nem todas de emenda).
-- 2) emenda_notas_tesouro_tentativas.plano_interno: o plano interno que a 200330 devolveu. A nota que não é de emenda de
--    nenhum pedido não é perguntada de novo, a não ser que um pedido passe a ter a emenda dela.
-- 3) emendas_ligar_notas ganha a regra FORNECEDOR (depois de CONTRATO e ITEM, antes de AUTOR): a nota com o número exato
--    da emenda no plano interno (e o ano, quando o pedido sabe; migration 186) cujo credor é o fornecedor da ata do item
--    (raiz do CNPJ). Medição de 25/10/2026: nas 1.623 linhas com nota, o credor é o fornecedor da ata em 1.537.
-- Sem mudança no servidor: o recurso 'notas_emendas_tesouro' (migration 185) só pergunta e grava o que a função lista.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 2) Plano interno guardado na tentativa
-- ------------------------------------------------------------------------------
ALTER TABLE public.emenda_notas_tesouro_tentativas ADD COLUMN IF NOT EXISTS plano_interno TEXT;
COMMENT ON COLUMN public.emenda_notas_tesouro_tentativas.plano_interno IS
  'Plano interno que o Tesouro devolveu para a nota na UG 200330 (migration 188).';

ALTER TABLE public.emenda_linha_notas DROP CONSTRAINT IF EXISTS emenda_linha_notas_regra;
ALTER TABLE public.emenda_linha_notas ADD CONSTRAINT emenda_linha_notas_regra
  CHECK (regra IS NULL OR regra IN ('SEI', 'CONTRATO', 'ITEM', 'FORNECEDOR', 'AUTOR'));

-- ------------------------------------------------------------------------------
-- 1) O que falta trazer: as citadas no SEI (como antes) e as da 200330 que só o Tesouro tem
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notas_das_emendas_a_trazer(p_reconsulta INTERVAL DEFAULT INTERVAL '1 day')
RETURNS TABLE (numero_oficial VARCHAR, emendas TEXT[], tentativa_em TIMESTAMPTZ, situacao VARCHAR)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
     -- A achada no saldo contábil que o Tesouro já disse não ser de emenda nenhuma dos pedidos só volta quando algum
     -- pedido passa a ter a emenda do plano interno dela.
     AND (c.citada OR t.situacao IS NULL OR t.situacao <> 'SEM_PLANO_DA_EMENDA'
          OR EXISTS (SELECT 1 FROM unnest(c.emendas) em WHERE public.nota_casa_com_emenda(t.plano_interno, em)))
   ORDER BY c.citada DESC, t.tentativa_em NULLS FIRST, c.numero DESC;
$$;

REVOKE ALL ON FUNCTION public.notas_das_emendas_a_trazer(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notas_das_emendas_a_trazer(INTERVAL) TO service_role;

-- ------------------------------------------------------------------------------
-- Gravação (igual à migration 184, mais o plano interno da 200330 na tentativa)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_notas_do_tesouro(p_consultadas TEXT[], p_notas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
-- 3) Ligação das notas às linhas (igual à migration 183, mais a regra FORNECEDOR)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emendas_ligar_notas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_res  JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador atualizam as notas.' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_emenda_notas (
    linha_id UUID PRIMARY KEY, empenho_id UUID, regra TEXT, motivo TEXT, contract_key TEXT
  ) ON COMMIT DROP;
  TRUNCATE tmp_emenda_notas;

  WITH l AS (
    SELECT l.id, l.pedido_id, l.item_key, l.contrato_numero, p.siop_emenda AS emenda, p.siop_emenda_ano AS emenda_ano,
           EXTRACT(YEAR FROM COALESCE(p.empenhado_em, (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE))::INTEGER AS ano
      FROM public.emenda_pedido_linhas l
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id
     WHERE NOT l.cancelada AND p.etapa IN ('EMPENHADO', 'CONTRATACAO') AND l.item_key IS NOT NULL),
  ne AS (
    SELECT e.id, e.ano_exercicio, ce.contract_key, co.numero AS contrato,
           substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') AS emenda_txt,
           substring(e.plano_interno from '^SP999S?9?([0-9]{4})') AS autor_pi
      FROM public.empenhos e
      JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
      JOIN public.contratos_oficiais co ON co.contract_key = ce.contract_key),
  ic AS (SELECT DISTINCT item_key, contract_key FROM public.arp_item_contract_links),
  -- SEI: notas cujos documentos estão no pedido; uma nota por número (o número se repete nas UGs 200330 e 200331).
  -- Migration 183: só vale a nota cujo plano interno é da emenda (o número da emenda ou o código do autor, SP999S9 + 4
  -- primeiros dígitos). A nota de mesmo número da outra UG é outra despesa e não entra, mesmo quando a certa não chegou.
  ne_sei AS (
    SELECT DISTINCT ON (d.pedido_id, d.nota_empenho) d.pedido_id, e.id AS empenho_id
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
      JOIN public.empenhos e ON e.numero_oficial = d.nota_empenho AND e.uasg_emitente IN ('200330', '200331')
     WHERE d.etapa = 'EMPENHO' AND d.nota_empenho IS NOT NULL
       -- nota do ano do pedido (como nas outras regras) e com o plano interno da emenda
       AND e.ano_exercicio = EXTRACT(YEAR FROM COALESCE(p.empenhado_em, (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE))::INTEGER
       AND (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = p.siop_emenda
            OR (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') IS NULL
                AND substring(e.plano_interno from '^SP999S?9?([0-9]{4})') = substr(p.siop_emenda, 1, 4)))
     ORDER BY d.pedido_id, d.nota_empenho,
              (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = p.siop_emenda) DESC NULLS LAST,
              (e.uasg_emitente = '200330') DESC),
  ne_sei_ctr AS (
    SELECT s.pedido_id, s.empenho_id, ce.contract_key
      FROM ne_sei s LEFT JOIN public.contrato_empenhos ce ON ce.empenho_id = s.empenho_id),
  s1 AS (SELECT l.id, count(DISTINCT x.empenho_id) n, (array_agg(x.empenho_id))[1] empenho_id, (array_agg(x.contract_key))[1] contract_key
           FROM l JOIN ne_sei_ctr x ON x.pedido_id = l.pedido_id
           JOIN ic ON ic.contract_key = x.contract_key AND ic.item_key = l.item_key
          GROUP BY l.id),
  -- Sem o item no contrato da nota: só a nota única do pedido que ainda não tem contrato (migration 183). Nota com
  -- contrato de outros itens não explica a linha.
  s2 AS (SELECT x.pedido_id, count(DISTINCT x.empenho_id) n, (array_agg(x.empenho_id))[1] empenho_id, (array_agg(x.contract_key))[1] contract_key
           FROM ne_sei_ctr x WHERE x.contract_key IS NULL GROUP BY x.pedido_id),
  sei AS (SELECT l.id,
                 CASE WHEN s1.n = 1 THEN s1.empenho_id WHEN COALESCE(s1.n, 0) = 0 AND s2.n = 1 THEN s2.empenho_id END AS empenho_id,
                 CASE WHEN s1.n = 1 THEN s1.contract_key WHEN COALESCE(s1.n, 0) = 0 AND s2.n = 1 THEN s2.contract_key END AS contract_key
            FROM l LEFT JOIN s1 ON s1.id = l.id LEFT JOIN s2 ON s2.pedido_id = l.pedido_id),
  a AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ne ON ne.contrato = l.contrato_numero AND ne.emenda_txt = l.emenda AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  b AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt = l.emenda AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  c AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt IS NULL AND ne.autor_pi = substr(l.emenda, 1, 4) AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  -- Migration 188: a nota da emenda que não está em contrato nenhum (trazida pelo Tesouro). Vale a nota com o número
  -- exato da emenda no plano interno (e o ano, quando o pedido sabe) cujo credor é o fornecedor da ata do item, pela raiz
  -- do CNPJ. Medição de 25/10/2026: nas linhas com nota, o credor é o fornecedor da ata em 95% (1.537 de 1.623).
  forn AS (
    SELECT l.id, regexp_replace(COALESCE(i.fornecedor_cnpj_cpf, ''), '\D', '', 'g') AS cnpj
      FROM l
      JOIN public.atas_registro_preco r ON r.numero_ata = split_part(l.item_key, '-', 1) AND r.codigo_uasg = split_part(l.item_key, '-', 2)
      JOIN public.itens_ata i ON i.ata_id = r.id AND lpad(i.numero_item, 5, '0') = split_part(l.item_key, '-', 3)),
  f AS (SELECT l.id, count(DISTINCT e.id) n, (array_agg(e.id))[1] empenho_id, (array_agg(ce.contract_key))[1] contract_key
          FROM l
          JOIN forn ON forn.id = l.id AND length(forn.cnpj) = 14
          JOIN public.empenhos e ON e.uasg_emitente IN ('200330', '200331') AND e.ano_exercicio = l.ano
                                AND substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = l.emenda
                                AND (l.emenda_ano IS NULL OR substring(e.plano_interno from '(20[0-9]{2})[0-9]{8}')::INTEGER = l.emenda_ano)
                                AND left(regexp_replace(COALESCE(e.credor_cnpj_cpf, ''), '\D', '', 'g'), 8) = left(forn.cnpj, 8)
          LEFT JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
         GROUP BY l.id),
  ctr AS (SELECT DISTINCT co.numero, co.contract_key,
                 EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.contract_key = co.contract_key) AS tem_nota
            FROM public.contratos_oficiais co WHERE co.uasg IN ('200330', '200331')),
  r AS (
    SELECT l.id, l.emenda, l.contrato_numero, sei.empenho_id AS sei_id, sei.contract_key AS sei_ctr,
           a.n AS an, a.empenho_id AS a_id, a.contract_key AS a_ctr,
           b.n AS bn, b.empenho_id AS b_id, b.contract_key AS b_ctr,
           c.n AS cn, c.empenho_id AS c_id, c.contract_key AS c_ctr,
           f.n AS fn, f.empenho_id AS f_id, f.contract_key AS f_ctr
      FROM l LEFT JOIN sei ON sei.id = l.id LEFT JOIN a ON a.id = l.id LEFT JOIN b ON b.id = l.id LEFT JOIN c ON c.id = l.id
      LEFT JOIN f ON f.id = l.id)
  INSERT INTO tmp_emenda_notas (linha_id, empenho_id, regra, motivo, contract_key)
  SELECT r.id,
         CASE WHEN r.sei_id IS NOT NULL THEN r.sei_id
              WHEN r.an = 1 THEN r.a_id WHEN COALESCE(r.an, 0) = 0 AND r.bn = 1 THEN r.b_id
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND r.fn = 1 THEN r.f_id
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND COALESCE(r.fn, 0) = 0 AND r.cn = 1 THEN r.c_id END,
         CASE WHEN r.sei_id IS NOT NULL THEN 'SEI'
              WHEN r.an = 1 THEN 'CONTRATO' WHEN COALESCE(r.an, 0) = 0 AND r.bn = 1 THEN 'ITEM'
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND r.fn = 1 THEN 'FORNECEDOR'
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND COALESCE(r.fn, 0) = 0 AND r.cn = 1 THEN 'AUTOR' END,
         CASE WHEN r.sei_id IS NOT NULL OR r.an = 1 OR (COALESCE(r.an, 0) = 0 AND r.bn = 1)
                   OR (COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND r.fn = 1)
                   OR (COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND COALESCE(r.fn, 0) = 0 AND r.cn = 1) THEN NULL
              WHEN r.an > 1 OR r.bn > 1 OR r.fn > 1 OR r.cn > 1 THEN 'VARIAS'
              WHEN r.emenda IS NULL THEN 'SEM_EMENDA'
              WHEN r.contrato_numero IS NULL THEN 'SEM_CONTRATO'
              WHEN ctr.contract_key IS NULL THEN 'CONTRATO_FORA'
              WHEN NOT ctr.tem_nota THEN 'CONTRATO_SEM_NOTA'
              ELSE 'OUTRAS_EMENDAS' END,
         CASE WHEN r.sei_id IS NOT NULL THEN COALESCE(r.sei_ctr, ctr.contract_key)
              WHEN r.an = 1 THEN r.a_ctr WHEN COALESCE(r.an, 0) = 0 AND r.bn = 1 THEN r.b_ctr
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND r.fn = 1 THEN COALESCE(r.f_ctr, ctr.contract_key)
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND COALESCE(r.fn, 0) = 0 AND r.cn = 1 THEN r.c_ctr ELSE ctr.contract_key END
    FROM r
    LEFT JOIN LATERAL (SELECT x.contract_key, x.tem_nota FROM ctr x WHERE x.numero = r.contrato_numero
                        ORDER BY (x.contract_key LIKE '200331-%') DESC LIMIT 1) ctr ON TRUE;

  DELETE FROM public.emenda_linha_notas n WHERE NOT EXISTS (SELECT 1 FROM tmp_emenda_notas t WHERE t.linha_id = n.linha_id);

  INSERT INTO public.emenda_linha_notas AS d (linha_id, empenho_id, nota, regra, motivo, contract_key, valor_empenhado, valor_liquidado,
                                              valor_pago, entrega_prevista, entrega_prevista_valor, atualizado_em)
  SELECT t.linha_id, t.empenho_id, e.numero_oficial, t.regra, t.motivo, t.contract_key, e.valor_empenhado, e.valor_liquidado, e.valor_pago,
         ep.data_prevista, ep.valor, NOW()
    FROM tmp_emenda_notas t
    LEFT JOIN public.empenhos e ON e.id = t.empenho_id
    LEFT JOIN LATERAL (
      SELECT x.data_prevista, x.valor FROM public.contrato_entregas_previstas x
       WHERE x.contract_key = t.contract_key AND x.situacao = 'PREVISTA' AND x.data_prevista >= v_hoje
         AND (x.empenho_canonical_key IS NULL OR x.empenho_canonical_key = e.canonical_key)
       ORDER BY x.data_prevista LIMIT 1) ep ON TRUE
  ON CONFLICT (linha_id) DO UPDATE SET
    empenho_id = EXCLUDED.empenho_id, nota = EXCLUDED.nota, regra = EXCLUDED.regra, motivo = EXCLUDED.motivo,
    contract_key = EXCLUDED.contract_key, valor_empenhado = EXCLUDED.valor_empenhado, valor_liquidado = EXCLUDED.valor_liquidado,
    valor_pago = EXCLUDED.valor_pago, entrega_prevista = EXCLUDED.entrega_prevista, entrega_prevista_valor = EXCLUDED.entrega_prevista_valor,
    atualizado_em = EXCLUDED.atualizado_em;

  SELECT jsonb_build_object('linhas', count(*), 'com_nota', count(*) FILTER (WHERE empenho_id IS NOT NULL),
                            'por_regra', (SELECT jsonb_object_agg(regra, n) FROM (SELECT regra, count(*) n FROM public.emenda_linha_notas WHERE regra IS NOT NULL GROUP BY 1) s),
                            'por_motivo', (SELECT jsonb_object_agg(motivo, n) FROM (SELECT motivo, count(*) n FROM public.emenda_linha_notas WHERE motivo IS NOT NULL GROUP BY 1) s))
    INTO v_res FROM public.emenda_linha_notas;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_ligar_notas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_ligar_notas() TO authenticated, service_role;

-- Liga de novo já com a regra nova.
SELECT public.emendas_ligar_notas();
