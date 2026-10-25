-- ==============================================================================
-- MIGRATION 192: NOTAS DAS EMENDAS PELO PORTAL QUANDO O TESOURO NÃO DESCREVE A NOTA
-- Versão: 20261025000192_notas_das_emendas_pelo_portal.sql
--
-- Medição de 25/10/2026: 16 notas citadas no SEI dos pedidos (14 pedidos, R$ 2,17 mi) estão no saldo contábil do
-- Tesouro na UG 200330, mas a consulta da nota no STA (/api/empenho), que dá o credor e o plano interno, volta vazia
-- nessa UG. A busca pelo Tesouro (migrations 184, 185, 188) então registrou "não é da emenda", olhando só a nota de
-- mesmo número da UG 200331, que é outra despesa. Ex.: pedido 468 (Coronel Assis), carabinas: 2026NE000309 existe no
-- SIAFI da 200330 (favorecido Marcelo Silveira da Costa, emenda 43260010), conferida no SEI e no Portal.
--
-- O Portal da Transparência liga a nota à emenda: /emendas/documentos/{ano + nº da emenda} lista as notas da emenda
-- (código UG + gestão + número), e /despesas/documentos/{código} dá o favorecido e a data. O plano interno não vem;
-- no lugar dele fica "Emenda 202643260010 (Portal da Transparência) - <autor>", que é o que o Portal publica.
--
-- 1) empenhos.fonte_origem aceita 'PORTAL'. Se a nota chegar depois por um contrato, vira SINCRONIZADO (mesma chave).
-- 2) emenda_notas_tesouro_tentativas.portal_em: última consulta ao Portal (uma por dia, no máximo).
-- 3) notas_das_emendas_pelo_portal(): notas citadas no SEI que o saldo contábil tem na 200330, que não estão em
--    `empenhos` na 200330 e cuja consulta no STA não trouxe a 200330; com a emenda do pedido e os anos a tentar.
-- 4) gravar_notas_pelo_portal(notas): só o servidor. Grava a nota que o Portal liga à emenda do pedido, com o
--    favorecido do Portal e os valores do saldo contábil (como a 184); registra a consulta mesmo sem achar.
-- 5) credor_e_fornecedor_da_ata (migration 191): o Portal mascara o CPF do favorecido pessoa física
--    ("***.379.061-**"); com o documento mascarado, vale o nome igual ao do fornecedor da ata.
-- 6) emendas_ligar_notas, regra SEI sem contrato (s2): com mais de uma nota do mesmo fornecedor sem contrato, vale a
--    única cujo valor é a quantidade do item no pedido × o preço da ata. Sem isso, trazer a 2026NE000310 tiraria a
--    nota da mira do pedido 468 (duas notas da Ceska). Só muda o bloco s2.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Fonte 'PORTAL'
-- ------------------------------------------------------------------------------
ALTER TABLE public.empenhos DROP CONSTRAINT IF EXISTS empenhos_fonte_origem_check;
ALTER TABLE public.empenhos ADD CONSTRAINT empenhos_fonte_origem_check
  CHECK (fonte_origem IN ('COMPRASNET', 'CONTRATOSNET', 'PNCP', 'MANUAL', 'SINCRONIZADO', 'TESOURO', 'PORTAL'));

-- ------------------------------------------------------------------------------
-- 2) Última consulta ao Portal
-- ------------------------------------------------------------------------------
ALTER TABLE public.emenda_notas_tesouro_tentativas ADD COLUMN IF NOT EXISTS portal_em TIMESTAMPTZ;
COMMENT ON COLUMN public.emenda_notas_tesouro_tentativas.portal_em IS
  'Última consulta ao Portal da Transparência da nota que o Tesouro não descreve na UG 200330 (migration 192).';

-- ------------------------------------------------------------------------------
-- 3) O que perguntar ao Portal
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notas_das_emendas_pelo_portal(p_reconsulta INTERVAL DEFAULT INTERVAL '1 day')
RETURNS TABLE (numero_oficial VARCHAR, emenda TEXT, anos INTEGER[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH citadas AS (
    SELECT DISTINCT upper(btrim(d.nota_empenho)) AS numero, p.siop_emenda AS emenda, p.siop_emenda_ano AS ano
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
     WHERE d.etapa = 'EMPENHO'
       AND upper(btrim(d.nota_empenho)) ~ '^[0-9]{4}NE[0-9]{6}$'
       AND p.siop_emenda ~ '^[0-9]{8}$'
       AND p.etapa <> 'CANCELADO'
  )
  SELECT c.numero::VARCHAR, c.emenda,
         -- O ano da emenda, quando o pedido sabe (migration 186); senão o da nota e o anterior (emenda de um ano
         -- empenhada no seguinte).
         array_agg(DISTINCT a ORDER BY a DESC) AS anos
    FROM citadas c
    JOIN public.emenda_notas_tesouro_tentativas t ON t.numero_oficial = c.numero
    CROSS JOIN LATERAL unnest(CASE WHEN c.ano IS NOT NULL THEN ARRAY[c.ano::INTEGER]
                                   ELSE ARRAY[left(c.numero, 4)::INTEGER, left(c.numero, 4)::INTEGER - 1] END) a
   WHERE t.situacao IN ('SEM_PLANO_DA_EMENDA', 'TESOURO_SEM_A_NOTA')
     -- O STA não devolveu a nota na 200330 (sem plano interno guardado e sem resposta da 200330 no detalhe).
     AND t.plano_interno IS NULL
     AND COALESCE(t.detalhe, '') NOT LIKE '%200330:%'
     AND (t.portal_em IS NULL OR t.portal_em < NOW() - COALESCE(p_reconsulta, INTERVAL '1 day'))
     AND EXISTS (SELECT 1 FROM public.empenho_saldo_contabil s WHERE s.ug = '200330' AND s.numero_empenho = c.numero)
     AND NOT EXISTS (SELECT 1 FROM public.empenhos e WHERE e.numero_oficial = c.numero AND e.uasg_emitente = '200330')
   GROUP BY c.numero, c.emenda
   ORDER BY c.numero;
$$;

REVOKE ALL ON FUNCTION public.notas_das_emendas_pelo_portal(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notas_das_emendas_pelo_portal(INTERVAL) TO service_role;

-- ------------------------------------------------------------------------------
-- 4) Gravação pelo Portal
-- p_notas: [{numero, emenda_codigo (ano + 8 dígitos) ou null quando o Portal não liga a nota à emenda, autor,
--            data (AAAA-MM-DD), favorecido_codigo, favorecido_nome}]
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_notas_pelo_portal(p_notas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n         JSONB;
  v_numero    TEXT;
  v_codigo    TEXT;
  v_ano       INTEGER;
  v_chave     TEXT;
  v_pi        TEXT;
  v_situacao  TEXT;
  v_empenhado NUMERIC;
  v_liquidado NUMERIC;
  v_pago      NUMERIC;
  v_contagem  JSONB := '{}'::JSONB;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava notas pelo Portal.' USING ERRCODE = '42501';
  END IF;
  IF p_notas IS NULL OR jsonb_typeof(p_notas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Envie a lista de respostas do Portal.' USING ERRCODE = '22023';
  END IF;

  FOR v_n IN SELECT x FROM jsonb_array_elements(p_notas) x LOOP
    v_numero := upper(btrim(COALESCE(v_n->>'numero', '')));
    v_codigo := NULLIF(regexp_replace(COALESCE(v_n->>'emenda_codigo', ''), '\D', '', 'g'), '');
    -- Só a nota que ainda está na lista e cuja emenda é a do pedido que a cita.
    IF NOT EXISTS (SELECT 1 FROM public.notas_das_emendas_pelo_portal(INTERVAL '0 seconds') a WHERE a.numero_oficial = v_numero) THEN
      CONTINUE;
    END IF;
    IF v_codigo IS NULL OR v_codigo !~ '^20[0-9]{10}$'
       OR NOT EXISTS (SELECT 1 FROM public.notas_das_emendas_pelo_portal(INTERVAL '0 seconds') a
                       WHERE a.numero_oficial = v_numero AND a.emenda = right(v_codigo, 8)) THEN
      v_situacao := 'PORTAL_SEM_A_NOTA';
    ELSE
      v_ano := left(v_numero, 4)::INTEGER;
      v_chave := '200330-' || v_ano || '-' || v_ano || 'NE' || (substr(v_numero, 7))::INTEGER;
      v_pi := left('Emenda ' || v_codigo || ' (Portal da Transparência)' || COALESCE(' - ' || NULLIF(btrim(v_n->>'autor'), ''), ''), 200);
      SELECT sum(s.saldo) FILTER (WHERE s.conta IN ('622920101', '622920102', '622920103', '622920104')),
             sum(s.saldo) FILTER (WHERE s.conta IN ('622920103', '622920104')),
             sum(s.saldo) FILTER (WHERE s.conta = '622920104')
        INTO v_empenhado, v_liquidado, v_pago
        FROM public.empenho_saldo_contabil s
       WHERE s.ug = '200330' AND s.numero_empenho = v_numero AND s.ano = v_ano;
      IF v_empenhado IS NULL THEN
        v_situacao := 'SEM_SALDO_CONTABIL';
      ELSE
        INSERT INTO public.empenhos (
          canonical_key, numero_oficial, ano_exercicio, uasg_emitente, numero_normalizado, data_emissao,
          valor_empenhado, valor_liquidado, valor_pago, valor_rpinscrito, credor_nome, credor_cnpj_cpf,
          fonte_origem, informado_manualmente_inicialmente, plano_interno, last_synced_at)
        VALUES (
          v_chave, v_numero, v_ano, '200330', v_ano || 'NE' || (substr(v_numero, 7))::INTEGER,
          COALESCE(NULLIF(v_n->>'data', '')::DATE, make_date(v_ano, 1, 1)),
          GREATEST(v_empenhado, 0), GREATEST(COALESCE(v_liquidado, 0), 0), GREATEST(COALESCE(v_pago, 0), 0), 0,
          NULLIF(btrim(v_n->>'favorecido_nome'), ''), NULLIF(btrim(v_n->>'favorecido_codigo'), ''),
          'PORTAL', FALSE, v_pi, NOW())
        ON CONFLICT (canonical_key) DO NOTHING;
        v_situacao := CASE WHEN FOUND THEN 'GRAVADA' ELSE 'JA_EXISTIA' END;
      END IF;
    END IF;

    UPDATE public.emenda_notas_tesouro_tentativas
       SET portal_em = NOW(),
           situacao = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA') THEN v_situacao ELSE situacao END,
           ug = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA') THEN '200330' ELSE ug END,
           detalhe = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA') THEN 'pelo Portal da Transparência: ' || v_pi
                          WHEN v_situacao = 'PORTAL_SEM_A_NOTA' THEN 'O Portal não liga a nota à emenda do pedido.'
                          ELSE detalhe END
     WHERE numero_oficial = v_numero;
    v_contagem := jsonb_set(v_contagem, ARRAY[v_situacao], to_jsonb(COALESCE((v_contagem->>v_situacao)::INTEGER, 0) + 1));
  END LOOP;

  RETURN v_contagem;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_notas_pelo_portal(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_notas_pelo_portal(JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 5) Credor × fornecedor da ata com o CPF mascarado (igual à migration 191, mais o ramo do documento mascarado)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credor_e_fornecedor_da_ata(p_credor_doc TEXT, p_credor_nome TEXT, p_forn_doc TEXT, p_forn_nome TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH d AS (
    SELECT regexp_replace(COALESCE(p_credor_doc, ''), '\D', '', 'g') AS c, regexp_replace(COALESCE(p_forn_doc, ''), '\D', '', 'g') AS f,
           upper(translate(COALESCE(p_forn_nome, '') || ' ' || COALESCE(p_forn_doc, ''),
                           'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) AS fnome,
           btrim(regexp_replace(upper(translate(COALESCE(p_credor_nome, ''),
                 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z0-9]+', ' ', 'g')) AS cn,
           btrim(regexp_replace(upper(translate(COALESCE(p_forn_nome, ''),
                 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z0-9]+', ' ', 'g')) AS fn)
  SELECT CASE
           WHEN length(d.c) = 14 AND length(d.f) = 14 THEN left(d.c, 8) = left(d.f, 8)
           WHEN length(d.c) IN (11, 14) AND length(d.f) IN (11, 14) THEN d.c = d.f
           -- Migration 192: o Portal mascara o CPF ("***.379.061-**"); aí vale o nome igual ao do fornecedor.
           WHEN position('*' IN COALESCE(p_credor_doc, '')) > 0 THEN d.cn <> '' AND d.cn = d.fn
           WHEN upper(btrim(COALESCE(p_credor_doc, ''))) LIKE 'EX%' AND upper(btrim(COALESCE(p_forn_doc, ''))) LIKE 'ESTRANGEIRO%' THEN
             EXISTS (SELECT 1
                       FROM regexp_split_to_table(upper(translate(COALESCE(p_credor_nome, ''),
                              'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z]+') w
                      WHERE length(w) >= 4 AND w NOT LIKE 'ESTRANG%'
                        AND w NOT IN ('LTDA', 'CORP', 'GLOBAL', 'CHANNEL', 'SERVICES', 'SERVICOS', 'ENTERPRISE', 'COMPANY', 'GROUP',
                                      'BRASIL', 'BRAZIL', 'INTERNATIONAL', 'LIMITED', 'GMBH', 'INDUSTRIES', 'SYSTEMS', 'TECHNOLOGY')
                        AND position(w IN d.fnome) > 0)
           ELSE FALSE END
    FROM d;
$$;
REVOKE ALL ON FUNCTION public.credor_e_fornecedor_da_ata(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credor_e_fornecedor_da_ata(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6) Ligação das notas às linhas (igual à migration 191, menos o bloco s2)
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
    SELECT l.id, l.pedido_id, l.item_key, l.quantidade, l.contrato_numero, p.siop_emenda AS emenda, p.siop_emenda_ano AS emenda_ano,
           EXTRACT(YEAR FROM COALESCE(p.empenhado_em, (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE))::INTEGER AS ano,
           -- Migration 189: pedido conferido no SIOP e ainda sem o empenho registrado. Só a regra FORNECEDOR vale, e só
           -- com nota emitida a partir do dia em que a solicitação de empenho que cobre a linha foi assinada (a nota de
           -- uma rodada anterior da mesma emenda e do mesmo fornecedor é mais antiga).
           p.etapa NOT IN ('EMPENHADO', 'CONTRATACAO') AS antes,
           (SELECT (d.assinado_em AT TIME ZONE 'America/Sao_Paulo')::DATE
              FROM public.emenda_solicitacao_linhas sl
              JOIN public.emenda_pedido_documentos_sei d ON d.id = sl.documento_id
             WHERE sl.linha_id = l.id AND d.assinado_em IS NOT NULL) AS assinada_em
      FROM public.emenda_pedido_linhas l
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id
     WHERE NOT l.cancelada AND l.item_key IS NOT NULL
       AND (p.etapa IN ('EMPENHADO', 'CONTRATACAO')
            OR (p.etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') AND p.siop_emenda IS NOT NULL))),
  -- Fornecedor da ata do item da linha (CNPJ só com números): usado nas regras SEI (migration 191) e FORNECEDOR (188).
  forn AS (
    SELECT l.id, regexp_replace(COALESCE(i.fornecedor_cnpj_cpf, ''), '\D', '', 'g') AS cnpj,
           i.fornecedor_cnpj_cpf AS doc, i.fornecedor_razao_social AS nome, i.valor_unitario AS preco
      FROM l
      JOIN public.atas_registro_preco r ON r.numero_ata = split_part(l.item_key, '-', 1) AND r.codigo_uasg = split_part(l.item_key, '-', 2)
      JOIN public.itens_ata i ON i.ata_id = r.id AND lpad(i.numero_item, 5, '0') = split_part(l.item_key, '-', 3)),
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
          WHERE NOT l.antes
          GROUP BY l.id),
  -- Sem o item no contrato da nota: a nota do SEI do pedido que ainda não tem contrato (migration 183). Nota com
  -- contrato de outros itens não explica a linha. Migration 191: e só a nota cujo credor é o fornecedor da ata do item
  -- (raiz do CNPJ). Antes, a nota única do pedido ia para todas as linhas, de todas as atas (pedido 520: uma nota da 3M
  -- em 57 linhas de várias atas).
  -- Migration 192: com mais de uma nota desse fornecedor sem contrato no pedido (duas rodadas da mesma emenda), vale a
  -- única cujo valor é a quantidade do item no pedido × o preço da ata (pedido 468: 2026NE000310 = 8 lanternas ×
  -- R$ 544,28; 2026NE000386 = 7 miras × R$ 751,19).
  s2c AS (SELECT l.id, x.empenho_id, x.contract_key,
                 abs(e.valor_empenhado - forn.preco * (SELECT sum(l2.quantidade) FROM l l2 WHERE l2.pedido_id = l.pedido_id AND l2.item_key = l.item_key)) <= 0.05 AS bate_valor
            FROM l
            JOIN forn ON forn.id = l.id
            JOIN ne_sei_ctr x ON x.pedido_id = l.pedido_id AND x.contract_key IS NULL
            JOIN public.empenhos e ON e.id = x.empenho_id
           WHERE NOT l.antes AND public.credor_e_fornecedor_da_ata(e.credor_cnpj_cpf, e.credor_nome, forn.doc, forn.nome)),
  s2 AS (SELECT s2c.id,
                CASE WHEN count(DISTINCT s2c.empenho_id) = 1 OR count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_valor) = 1 THEN 1
                     ELSE count(DISTINCT s2c.empenho_id) END AS n,
                CASE WHEN count(DISTINCT s2c.empenho_id) = 1 THEN (array_agg(s2c.empenho_id))[1]
                     ELSE (array_agg(s2c.empenho_id) FILTER (WHERE s2c.bate_valor))[1] END AS empenho_id,
                CASE WHEN count(DISTINCT s2c.empenho_id) = 1 THEN (array_agg(s2c.contract_key))[1]
                     ELSE (array_agg(s2c.contract_key) FILTER (WHERE s2c.bate_valor))[1] END AS contract_key
           FROM s2c GROUP BY s2c.id),
  sei AS (SELECT l.id,
                 CASE WHEN s1.n = 1 THEN s1.empenho_id WHEN COALESCE(s1.n, 0) = 0 AND s2.n = 1 THEN s2.empenho_id END AS empenho_id,
                 CASE WHEN s1.n = 1 THEN s1.contract_key WHEN COALESCE(s1.n, 0) = 0 AND s2.n = 1 THEN s2.contract_key END AS contract_key
            FROM l LEFT JOIN s1 ON s1.id = l.id LEFT JOIN s2 ON s2.id = l.id
           WHERE NOT l.antes),
  a AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ne ON ne.contrato = l.contrato_numero AND ne.emenda_txt = l.emenda AND ne.ano_exercicio = l.ano
         WHERE NOT l.antes
         GROUP BY l.id),
  b AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt = l.emenda AND ne.ano_exercicio = l.ano AND NOT l.antes
         GROUP BY l.id),
  c AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt IS NULL AND ne.autor_pi = substr(l.emenda, 1, 4) AND ne.ano_exercicio = l.ano AND NOT l.antes
         GROUP BY l.id),
  -- Migration 188: a nota da emenda que não está em contrato nenhum (trazida pelo Tesouro). Vale a nota com o número
  -- exato da emenda no plano interno (e o ano, quando o pedido sabe) cujo credor é o fornecedor da ata do item, pela raiz
  -- do CNPJ. Medição de 25/10/2026: nas linhas com nota, o credor é o fornecedor da ata em 95% (1.537 de 1.623).
  f AS (SELECT l.id, count(DISTINCT e.id) n, (array_agg(e.id))[1] empenho_id, (array_agg(ce.contract_key))[1] contract_key
          FROM l
          JOIN forn ON forn.id = l.id
          JOIN public.empenhos e ON e.uasg_emitente IN ('200330', '200331')
                                AND (CASE WHEN l.antes THEN l.assinada_em IS NOT NULL AND e.data_emissao >= l.assinada_em
                                          ELSE e.ano_exercicio = l.ano END)
                                AND substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = l.emenda
                                AND (l.emenda_ano IS NULL OR substring(e.plano_interno from '(20[0-9]{2})[0-9]{8}')::INTEGER = l.emenda_ano)
                                AND public.credor_e_fornecedor_da_ata(e.credor_cnpj_cpf, e.credor_nome, forn.doc, forn.nome)
          LEFT JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
         GROUP BY l.id),
  ctr AS (SELECT DISTINCT co.numero, co.contract_key,
                 EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.contract_key = co.contract_key) AS tem_nota
            FROM public.contratos_oficiais co WHERE co.uasg IN ('200330', '200331')),
  r AS (
    SELECT l.id, l.antes, l.emenda, l.contrato_numero, sei.empenho_id AS sei_id, sei.contract_key AS sei_ctr,
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
                        ORDER BY (x.contract_key LIKE '200331-%') DESC LIMIT 1) ctr ON TRUE
   -- Antes do empenho registrado, só a linha que já tem a nota (sem motivo de "sem nota").
   WHERE NOT r.antes OR r.fn = 1;

  DELETE FROM public.emenda_linha_notas n WHERE NOT EXISTS (SELECT 1 FROM tmp_emenda_notas t WHERE t.linha_id = n.linha_id);

  INSERT INTO public.emenda_linha_notas AS d (linha_id, empenho_id, nota, regra, motivo, contract_key, valor_empenhado, valor_liquidado,
                                              valor_pago, entrega_prevista, entrega_prevista_valor, emitida_em, atualizado_em)
  SELECT t.linha_id, t.empenho_id, e.numero_oficial, t.regra, t.motivo, t.contract_key, e.valor_empenhado, e.valor_liquidado, e.valor_pago,
         ep.data_prevista, ep.valor, e.data_emissao, NOW()
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
    emitida_em = EXCLUDED.emitida_em,
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
