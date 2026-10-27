-- ==============================================================================
-- MIGRATION 211: VÁRIAS EMENDAS POR PEDIDO (protótipo aprovado em 26/10/2026)
-- Versão: 20261026000211_emendas_varias_emendas_por_pedido.sql
--
-- O pedido guardava uma emenda só (siop_emenda + siop_emenda_ano, a conferida com o ofício). Na prática a CAEP também
-- completa o pedido com a sobra de uma emenda antiga do mesmo parlamentar: pedido 520 (Bancada CE, 2026 7107 0008) com
-- 4 notas da 2024 7107 0011 (Kadoshi R$ 116.556,90, Roal R$ 17.668,91 e RC-Forever R$ 503.003,12 iguais aos itens);
-- pedido 422 (Bancada DF, 7108 0004) com a GM paga pelas duas emendas (9.661.193,92 + 9.963.106,23 + 355.230,00 =
-- 19.979.530,15, o valor das linhas). As notas da segunda emenda caíam em "Notas sem pedido" sem jeito de corrigir.
--
-- 1) emenda_pedido_emendas: as outras emendas do pedido (ano + nº). A conferida continua em emenda_pedidos.
-- 2) v_emenda_pedido_emendas: todas as emendas de cada pedido (a conferida e as outras), para as regras.
-- 3) As regras que acham as notas pela emenda do pedido passam a olhar todas: emendas_ligar_notas, a busca no Tesouro
--    (notas_das_emendas_a_trazer), no SIAFI (notas_para_ler_no_siafi) e no Portal (emendas_a_ler_no_portal,
--    notas_das_emendas_pelo_portal, gravar_notas_pelo_portal), e a conferência v_emendas_empenho_x_pedido.
-- 4) v_emendas_notas_sem_pedido: só notas de material (3.3.90.30 e 4.4.90.52), as compras pelas atas; a tarifa da
--    Caixa nos convênios (4.4.90.35: 2026NE000415 e 2026NE000319) sai. A nota sai quando a emenda dela está em algum
--    pedido, como a conferida ou como outra.
-- 5) v_emendas_notas_sem_pedido_pedidos: pedidos prováveis de cada nota sem pedido (itens do mesmo fornecedor, pelo
--    valor dos itens ainda sem nota). O sistema só sugere; o gestor confirma (decisão de 26/10/2026).
-- 6) RPCs ligar_emenda_ao_pedido (OUTRA: mais uma emenda; TROCA: o nº conferido estava errado) e
--    remover_emenda_do_pedido. Só gestor de emendas e coordenador (emendas.manage). Documento SEI opcional.
-- 7) Anulação total do empenho (o pedido volta à reserva sem a emenda): as outras emendas saem junto.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Outras emendas do pedido
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_pedido_emendas (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID         NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  ano             SMALLINT     NOT NULL CHECK (ano BETWEEN 2015 AND 2100),
  numero          CHAR(8)      NOT NULL CHECK (numero ~ '^[0-9]{8}$'),
  documento_sei   VARCHAR(10)  CHECK (documento_sei IS NULL OR documento_sei ~ '^[0-9]{7,10}$'),
  observacao      TEXT         CHECK (observacao IS NULL OR length(observacao) <= 500),
  criado_por      UUID,
  criado_por_nome VARCHAR(200),
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_pedido_emendas_unica UNIQUE (pedido_id, ano, numero)
);
COMMENT ON TABLE public.emenda_pedido_emendas IS
  'Outras emendas do pedido, além da conferida com o ofício (emenda_pedidos.siop_emenda). Grava só ligar_emenda_ao_pedido e remover_emenda_do_pedido (migration 211).';
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_emendas_numero ON public.emenda_pedido_emendas (numero);

-- Leitura, trava de usuário desativado e auditoria, como nas outras tabelas de Emendas.
DO $$
BEGIN
  ALTER TABLE public.emenda_pedido_emendas ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Leitura das emendas: emenda_pedido_emendas" ON public.emenda_pedido_emendas;
  CREATE POLICY "Leitura das emendas: emenda_pedido_emendas" ON public.emenda_pedido_emendas
    FOR SELECT TO authenticated USING ((SELECT public.has_permission('emendas.view')));
  DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_pedido_emendas;
  CREATE POLICY "Somente usuario ativo" ON public.emenda_pedido_emendas AS RESTRICTIVE FOR ALL TO authenticated
    USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
  REVOKE ALL ON public.emenda_pedido_emendas FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.emenda_pedido_emendas TO authenticated;
  GRANT ALL ON public.emenda_pedido_emendas TO service_role;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_pedido_emendas ON public.emenda_pedido_emendas;
    CREATE TRIGGER trg_audit_emenda_pedido_emendas AFTER INSERT OR UPDATE OR DELETE ON public.emenda_pedido_emendas
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Todas as emendas de cada pedido
-- ------------------------------------------------------------------------------
-- Uso interno das regras (funções SECURITY DEFINER e views): o navegador lê emenda_pedidos e emenda_pedido_emendas.
CREATE OR REPLACE VIEW public.v_emenda_pedido_emendas AS
SELECT p.id AS pedido_id, p.siop_emenda::TEXT AS numero, p.siop_emenda_ano::INTEGER AS ano, TRUE AS principal
  FROM public.emenda_pedidos p
 WHERE p.siop_emenda IS NOT NULL
UNION ALL
SELECT o.pedido_id, o.numero::TEXT, o.ano::INTEGER, FALSE
  FROM public.emenda_pedido_emendas o
  JOIN public.emenda_pedidos p ON p.id = o.pedido_id
 WHERE NOT (o.numero::TEXT IS NOT DISTINCT FROM p.siop_emenda::TEXT AND (p.siop_emenda_ano IS NULL OR p.siop_emenda_ano = o.ano));

COMMENT ON VIEW public.v_emenda_pedido_emendas IS
  'Emendas de cada pedido: a conferida com o ofício (principal) e as outras de emenda_pedido_emendas (migration 211).';
REVOKE ALL ON public.v_emenda_pedido_emendas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emenda_pedido_emendas TO service_role;

-- ------------------------------------------------------------------------------
-- 3) Regras que acham as notas pela emenda do pedido: todas as emendas
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emendas_ligar_notas()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Migration 211: uma linha por emenda do pedido (a conferida e as outras); as regras juntam por ela.
  l_em AS (
    SELECT l.id, pe.numero, pe.ano FROM l JOIN public.v_emenda_pedido_emendas pe ON pe.pedido_id = l.pedido_id),
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
       AND EXISTS (SELECT 1 FROM public.v_emenda_pedido_emendas pe
                    WHERE pe.pedido_id = p.id
                      AND (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = pe.numero
                           OR (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') IS NULL
                               AND substring(e.plano_interno from '^SP999S?9?([0-9]{4})') = substr(pe.numero, 1, 4))))
     ORDER BY d.pedido_id, d.nota_empenho,
              (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') IS NOT NULL) DESC,
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
                 abs(e.valor_empenhado - forn.preco * (SELECT sum(l2.quantidade) FROM l l2 WHERE l2.pedido_id = l.pedido_id AND l2.item_key = l.item_key)) <= 0.05 AS bate_valor,
                 abs(e.valor_empenhado - forn.preco * l.quantidade) <= 0.05 AS bate_linha,
                 abs(e.valor_empenhado - forn.preco * l.quantidade) <= 0.05
                   AND (SELECT count(*) FROM l l3 WHERE l3.pedido_id = l.pedido_id AND l3.item_key = l.item_key
                                                    AND l3.quantidade = l.quantidade) = 1 AS bate_linha_unica /* (migration 200) */
            FROM l
            JOIN forn ON forn.id = l.id
            JOIN ne_sei_ctr x ON x.pedido_id = l.pedido_id AND x.contract_key IS NULL
            JOIN public.empenhos e ON e.id = x.empenho_id
           WHERE NOT l.antes AND public.credor_e_fornecedor_da_ata(e.credor_cnpj_cpf, e.credor_nome, forn.doc, forn.nome)),
  -- Migration 194: várias linhas iguais do mesmo item (mesma quantidade) e o mesmo número de notas desse fornecedor, cada
  -- uma com o valor de uma linha: uma nota para cada linha, pela ordem (pedido 414: dois drones de 1 unidade, notas
  -- 2026NE000320 e 2026NE000323, de R$ 146.438,13 cada).
  igl AS (SELECT DISTINCT s2c.id, l.pedido_id, l.item_key, l.quantidade, l.assinada_em
            FROM s2c JOIN l ON l.id = s2c.id WHERE s2c.bate_linha),
  igl_n AS (SELECT igl.*, row_number() OVER (PARTITION BY igl.pedido_id, igl.item_key, igl.quantidade ORDER BY igl.assinada_em NULLS LAST, igl.id) AS ordem,
                   count(*) OVER (PARTITION BY igl.pedido_id, igl.item_key, igl.quantidade) AS linhas
              FROM igl),
  ign AS (SELECT DISTINCT igl.pedido_id, igl.item_key, igl.quantidade, s2c.empenho_id, s2c.contract_key
            FROM igl JOIN s2c ON s2c.id = igl.id AND s2c.bate_linha),
  ign_n AS (SELECT ign.*, e.data_emissao,
                   row_number() OVER (PARTITION BY ign.pedido_id, ign.item_key, ign.quantidade ORDER BY e.data_emissao NULLS LAST, e.numero_oficial, ign.empenho_id) AS ordem,
                   count(*) OVER (PARTITION BY ign.pedido_id, ign.item_key, ign.quantidade) AS notas
              FROM ign JOIN public.empenhos e ON e.id = ign.empenho_id),
  -- Linhas de rodadas diferentes (pedido 418: celulares autorizados em 17/04 e em 23/09): a autorizada primeiro fica com
  -- a nota emitida primeiro, e nenhuma nota vai para uma linha autorizada depois da emissão dela.
  par AS (SELECT a.id, b.empenho_id, b.contract_key
            FROM igl_n a JOIN ign_n b ON b.pedido_id = a.pedido_id AND b.item_key = a.item_key AND b.quantidade = a.quantidade AND b.ordem = a.ordem
           WHERE a.linhas > 1 AND a.linhas = b.notas
             AND (a.assinada_em IS NULL OR b.data_emissao IS NULL OR b.data_emissao >= a.assinada_em)),
  s2 AS (SELECT s2c.id,
                CASE WHEN count(DISTINCT s2c.empenho_id) = 1 OR count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_valor) = 1
                          OR max(par.empenho_id::TEXT) IS NOT NULL
                          OR count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_linha_unica) = 1 /* valor da própria linha (migration 200) */ THEN 1
                     ELSE count(DISTINCT s2c.empenho_id) END AS n,
                CASE WHEN count(DISTINCT s2c.empenho_id) = 1 THEN (array_agg(s2c.empenho_id))[1]
                     WHEN count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_valor) = 1 THEN (array_agg(s2c.empenho_id) FILTER (WHERE s2c.bate_valor))[1]
                     WHEN count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_linha_unica) = 1 AND max(par.empenho_id::TEXT) IS NULL
                       THEN (array_agg(s2c.empenho_id) FILTER (WHERE s2c.bate_linha_unica))[1] /* (migration 200) */
                     ELSE max(par.empenho_id::TEXT)::UUID END AS empenho_id,
                CASE WHEN count(DISTINCT s2c.empenho_id) = 1 THEN (array_agg(s2c.contract_key))[1]
                     WHEN count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_valor) = 1 THEN (array_agg(s2c.contract_key) FILTER (WHERE s2c.bate_valor))[1]
                     WHEN count(DISTINCT s2c.empenho_id) FILTER (WHERE s2c.bate_linha_unica) = 1 AND max(par.empenho_id::TEXT) IS NULL
                       THEN (array_agg(s2c.contract_key) FILTER (WHERE s2c.bate_linha_unica))[1] /* (migration 200) */
                     ELSE max(par.contract_key) END AS contract_key
           FROM s2c LEFT JOIN par ON par.id = s2c.id GROUP BY s2c.id),
  sei AS (SELECT l.id,
                 CASE WHEN s1.n = 1 THEN s1.empenho_id WHEN COALESCE(s1.n, 0) = 0 AND s2.n = 1 THEN s2.empenho_id END AS empenho_id,
                 CASE WHEN s1.n = 1 THEN s1.contract_key WHEN COALESCE(s1.n, 0) = 0 AND s2.n = 1 THEN s2.contract_key END AS contract_key
            FROM l LEFT JOIN s1 ON s1.id = l.id LEFT JOIN s2 ON s2.id = l.id
           WHERE NOT l.antes),
  a AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN l_em le ON le.id = l.id
          JOIN ne ON ne.contrato = l.contrato_numero AND ne.emenda_txt = le.numero AND ne.ano_exercicio = l.ano
         WHERE NOT l.antes
         GROUP BY l.id),
  b AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN l_em le ON le.id = l.id JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt = le.numero AND ne.ano_exercicio = l.ano AND NOT l.antes
         GROUP BY l.id),
  c AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN l_em le ON le.id = l.id JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt IS NULL AND ne.autor_pi = substr(le.numero, 1, 4) AND ne.ano_exercicio = l.ano AND NOT l.antes
         GROUP BY l.id),
  -- Migration 188: a nota da emenda que não está em contrato nenhum (trazida pelo Tesouro). Vale a nota com o número
  -- exato da emenda no plano interno (e o ano, quando o pedido sabe) cujo credor é o fornecedor da ata do item, pela raiz
  -- do CNPJ. Medição de 25/10/2026: nas linhas com nota, o credor é o fornecedor da ata em 95% (1.537 de 1.623).
  f AS (SELECT l.id, count(DISTINCT e.id) n, (array_agg(e.id))[1] empenho_id, (array_agg(ce.contract_key))[1] contract_key
          FROM l
          JOIN forn ON forn.id = l.id
          JOIN l_em le ON le.id = l.id
          JOIN public.empenhos e ON e.uasg_emitente IN ('200330', '200331')
                                AND (CASE WHEN l.antes THEN l.assinada_em IS NOT NULL AND e.data_emissao >= l.assinada_em
                                          ELSE e.ano_exercicio = l.ano END)
                                AND substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = le.numero
                                AND (le.ano IS NULL OR substring(e.plano_interno from '(20[0-9]{2})[0-9]{8}')::INTEGER = le.ano)
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
$function$;

CREATE OR REPLACE FUNCTION public.notas_das_emendas_a_trazer(p_reconsulta interval DEFAULT '1 day'::interval)
 RETURNS TABLE(numero_oficial character varying, emendas text[], tentativa_em timestamp with time zone, situacao character varying)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH citadas AS (
    SELECT upper(btrim(d.nota_empenho)) AS numero, array_agg(DISTINCT pe.numero) AS emendas
      FROM public.emenda_pedido_documentos_sei d
      -- Migration 211: todas as emendas do pedido.
      JOIN public.v_emenda_pedido_emendas pe ON pe.pedido_id = d.pedido_id
     WHERE d.etapa = 'EMPENHO'
       AND upper(btrim(d.nota_empenho)) ~ '^[0-9]{4}NE[0-9]{6}$'
     GROUP BY 1
  ),
  -- Migration 207: as notas da SENASP que o Portal liga às emendas dos pedidos (emenda_execucao_portal) e que o sistema
  -- ainda não tem entram como as citadas no SEI, com a emenda do Portal.
  do_portal AS (
    SELECT split_part(n, ':', 2) AS numero, array_agg(DISTINCT x.emenda::TEXT) AS emendas
      FROM public.emenda_execucao_portal x, unnest(x.notas_senasp) n
     WHERE NOT EXISTS (SELECT 1 FROM public.empenhos e WHERE e.uasg_emitente = split_part(n, ':', 1) AND e.numero_oficial = split_part(n, ':', 2))
     GROUP BY 1
  ),
  -- As emendas de todos os pedidos: a nota achada no saldo contábil pode ser de qualquer uma.
  dos_pedidos AS (
    SELECT array_agg(DISTINCT pe.numero) AS emendas
      FROM public.v_emenda_pedido_emendas pe JOIN public.emenda_pedidos p ON p.id = pe.pedido_id WHERE p.etapa <> 'CANCELADO'
  ),
  descobertas AS (
    SELECT DISTINCT s.numero_empenho AS numero
      FROM public.empenho_saldo_contabil s
     WHERE s.ug = '200330'
       AND s.numero_empenho ~ '^[0-9]{4}NE[0-9]{6}$'
       AND left(s.numero_empenho, 4)::INTEGER >= EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER - 1
       AND NOT EXISTS (SELECT 1 FROM public.empenhos e WHERE e.numero_oficial = s.numero_empenho AND e.uasg_emitente = '200330')
       AND NOT EXISTS (SELECT 1 FROM citadas c WHERE c.numero = s.numero_empenho)
       AND NOT EXISTS (SELECT 1 FROM do_portal p WHERE p.numero = s.numero_empenho)
  ),
  todas AS (
    SELECT c.numero, c.emendas, TRUE AS citada FROM citadas c
    UNION ALL
    SELECT p.numero, p.emendas, TRUE FROM do_portal p WHERE NOT EXISTS (SELECT 1 FROM citadas c WHERE c.numero = p.numero)
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
$function$;

CREATE OR REPLACE FUNCTION public.notas_para_ler_no_siafi(p_uasg text, p_limite integer DEFAULT 500)
 RETURNS TABLE(empenho_id uuid, numero_oficial character varying, uasg_emitente character varying, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH n AS (
    SELECT ce.empenho_id, max(COALESCE(x.n, 0)) AS max_itens, min(COALESCE(x.n, 0)) AS min_itens
      FROM public.contrato_empenhos ce
      LEFT JOIN (SELECT contract_key, count(*) AS n FROM public.v_contrato_itens_numerados GROUP BY contract_key) x
        ON x.contract_key = ce.contract_key
     GROUP BY ce.empenho_id
  ),
  -- Notas das emendas parlamentares (migration 182): ligadas às linhas dos pedidos ou citadas no SEI; a citada no
  -- SEI só pela UG cujo plano interno é o da emenda (migration 184)
  das_emendas AS (
    SELECT n.empenho_id AS id FROM public.emenda_linha_notas n WHERE n.empenho_id IS NOT NULL
    UNION
    SELECT e.id
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
      JOIN public.empenhos e ON e.numero_oficial = upper(btrim(d.nota_empenho)) AND e.uasg_emitente = p_uasg
     WHERE d.etapa = 'EMPENHO' AND d.nota_empenho IS NOT NULL
       -- Migration 211: qualquer emenda do pedido.
       AND EXISTS (SELECT 1 FROM public.v_emenda_pedido_emendas pe WHERE pe.pedido_id = p.id AND public.nota_casa_com_emenda(e.plano_interno, pe.numero))
  ),
  alvo AS (
    SELECT e.id, e.numero_oficial, e.uasg_emitente, e.data_emissao, l.lido_em, l.valor_no_sistema, e.valor_empenhado
      FROM public.empenhos e
      LEFT JOIN n ON n.empenho_id = e.id
      LEFT JOIN public.empenho_leituras_siafi l ON l.empenho_id = e.id
     WHERE e.uasg_emitente = p_uasg
       AND e.valor_empenhado > 0
       AND ((n.empenho_id IS NOT NULL AND (n.max_itens >= 2 OR n.min_itens = 0))
            OR e.id IN (SELECT id FROM das_emendas))
  )
  SELECT a.id, a.numero_oficial, a.uasg_emitente,
         CASE WHEN a.lido_em IS NULL THEN 'NUNCA_LIDA'
              WHEN a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado THEN 'VALOR_MUDOU'
              ELSE 'RELEITURA' END
    FROM alvo a
   WHERE a.lido_em IS NULL
      OR a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado
      OR (a.lido_em < NOW() - INTERVAL '30 days' AND a.data_emissao > (CURRENT_DATE - INTERVAL '2 years'))
   ORDER BY CASE WHEN a.lido_em IS NULL THEN 1 WHEN a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado THEN 2 ELSE 3 END,
            a.data_emissao DESC NULLS LAST
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 5000));
$function$;

CREATE OR REPLACE FUNCTION public.emendas_a_ler_no_portal()
 RETURNS TABLE(codigo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.codigo
    FROM (SELECT DISTINCT pe.ano::TEXT || pe.numero AS codigo
            FROM public.v_emenda_pedido_emendas pe
            JOIN public.emenda_pedidos p ON p.id = pe.pedido_id
           WHERE pe.numero ~ '^[0-9]{8}$' AND pe.ano IS NOT NULL AND p.etapa <> 'CANCELADO'
             -- Migration 211: a outra emenda do pedido é lida qualquer que seja o ano (sobra de emenda antiga).
             AND (NOT pe.principal OR pe.ano >= EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER - 1)) c
    LEFT JOIN public.emenda_execucao_portal x ON x.codigo = c.codigo
   ORDER BY x.notas_senasp IS NOT NULL, x.lido_em NULLS FIRST, c.codigo;
$function$;

CREATE OR REPLACE FUNCTION public.notas_das_emendas_pelo_portal(p_reconsulta interval DEFAULT '1 day'::interval)
 RETURNS TABLE(numero_oficial character varying, emenda text, anos integer[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH citadas AS (
    SELECT DISTINCT upper(btrim(d.nota_empenho)) AS numero, pe.numero AS emenda, pe.ano AS ano
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
      -- Migration 211: todas as emendas do pedido.
      JOIN public.v_emenda_pedido_emendas pe ON pe.pedido_id = p.id
     WHERE d.etapa = 'EMPENHO'
       AND upper(btrim(d.nota_empenho)) ~ '^[0-9]{4}NE[0-9]{6}$'
       AND pe.numero ~ '^[0-9]{8}$'
       AND p.etapa <> 'CANCELADO'
    -- Migration 207: e as da UG 200330 que o Portal liga à emenda (emenda_execucao_portal), com o ano da emenda.
    UNION
    SELECT split_part(n, ':', 2), x.emenda::TEXT, x.ano
      FROM public.emenda_execucao_portal x, unnest(x.notas_senasp) n
     WHERE split_part(n, ':', 1) = '200330'
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
$function$;

CREATE OR REPLACE FUNCTION public.gravar_notas_pelo_portal(p_notas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- Migration 209: o Portal não diz a natureza da despesa. Só é compra da CGLIC se o favorecido for fornecedor de
    -- alguma ata dos pedidos da emenda; senão é transferência (convênio, contribuição a estado ou município) ou outra
    -- despesa, e fica fora como na migration 197 (ex.: 2026NE000306, Polícia Civil de RO; 2026NE000308, SESP).
    ELSIF NOT EXISTS (
      SELECT 1
        FROM public.emenda_pedidos p
        JOIN public.emenda_pedido_linhas l ON l.pedido_id = p.id AND NOT l.cancelada AND l.item_key IS NOT NULL
        JOIN public.atas_registro_preco r ON r.numero_ata = split_part(l.item_key, '-', 1) AND r.codigo_uasg = split_part(l.item_key, '-', 2)
        JOIN public.itens_ata i ON i.ata_id = r.id AND lpad(i.numero_item, 5, '0') = split_part(l.item_key, '-', 3)
       WHERE EXISTS (SELECT 1 FROM public.v_emenda_pedido_emendas pe WHERE pe.pedido_id = p.id AND pe.numero = right(v_codigo, 8)) /* migration 211 */
         AND p.etapa <> 'CANCELADO'
         AND public.credor_e_fornecedor_da_ata(v_n->>'favorecido_codigo', v_n->>'favorecido_nome', i.fornecedor_cnpj_cpf, i.fornecedor_razao_social)
    ) THEN
      v_situacao := 'FORA_DO_ESCOPO';
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
           situacao = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA', 'FORA_DO_ESCOPO') THEN v_situacao ELSE situacao END,
           ug = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA') THEN '200330' ELSE ug END,
           detalhe = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA') THEN 'pelo Portal da Transparência: ' || v_pi
                          WHEN v_situacao = 'PORTAL_SEM_A_NOTA' THEN 'O Portal não liga a nota à emenda do pedido.'
                          WHEN v_situacao = 'FORA_DO_ESCOPO' THEN left('Favorecido ' || COALESCE(NULLIF(btrim(v_n->>'favorecido_nome'), ''), '?')
                               || ' não é fornecedor das atas dos pedidos da emenda: transferência ou outra despesa, não compra da CGLIC (Portal).', 300)
                          ELSE detalhe END
     WHERE numero_oficial = v_numero;
    v_contagem := jsonb_set(v_contagem, ARRAY[v_situacao], to_jsonb(COALESCE((v_contagem->>v_situacao)::INTEGER, 0) + 1));
  END LOOP;

  RETURN v_contagem;
END;
$function$;

-- Conferência empenhado × pedido (migration 187): as notas das outras emendas do pedido contam na emenda conferida.
CREATE OR REPLACE VIEW public.v_emendas_empenho_x_pedido AS
WITH ped AS (
         SELECT p.id,
            p.numero,
            p.siop_emenda AS emenda
           FROM emenda_pedidos p
          WHERE (p.etapa::text = ANY (ARRAY['EMPENHADO'::character varying, 'CONTRATACAO'::character varying]::text[])) AND p.siop_emenda IS NOT NULL
        ), lin AS (
         SELECT ped.emenda,
            ped.id AS pedido_id,
            ped.numero,
            l.id AS linha_id,
            l.item_key,
            l.quantidade
           FROM ped
             JOIN emenda_pedido_linhas l ON l.pedido_id = ped.id
          WHERE NOT l.cancelada AND l.item_key IS NOT NULL
        ), cand AS (
         SELECT lin.emenda,
            n.empenho_id
           FROM lin
             JOIN emenda_linha_notas n ON n.linha_id = lin.linha_id
          WHERE n.empenho_id IS NOT NULL
        UNION
         SELECT ped.emenda,
            e.id
           FROM ped
             JOIN emenda_pedido_documentos_sei d ON d.pedido_id = ped.id
             JOIN empenhos e ON e.numero_oficial::text = d.nota_empenho::text AND e.uasg_emitente::text = '200330'::text
          WHERE d.etapa::text = 'EMPENHO'::text AND d.nota_empenho IS NOT NULL
        ), ne AS (
         SELECT DISTINCT c_1.emenda,
            e.id,
            e.numero_oficial,
            s.situacao
           FROM cand c_1
             JOIN empenhos e ON e.id = c_1.empenho_id
             LEFT JOIN empenho_leituras_siafi s ON s.empenho_id = e.id
          WHERE e.uasg_emitente::text = '200330'::text AND ("substring"(e.plano_interno, '20[0-9]{2}([0-9]{8})'::text) = c_1.emenda::text OR "substring"(e.plano_interno, '20[0-9]{2}([0-9]{8})'::text) IS NULL AND "substring"(e.plano_interno, '^SP999S?9?([0-9]{4})'::text) = substr(c_1.emenda::text, 1, 4) OR ("substring"(e.plano_interno, '20[0-9]{2}([0-9]{8})'::text) IN ( SELECT o.numero
                   FROM v_emenda_pedido_emendas o
                     JOIN ped p_1 ON p_1.id = o.pedido_id
                  WHERE p_1.emenda::text = c_1.emenda::text AND NOT o.principal)))
        ), fora AS (
         SELECT ped.emenda,
            array_agg(DISTINCT d.nota_empenho ORDER BY d.nota_empenho) AS notas
           FROM ped
             JOIN emenda_pedido_documentos_sei d ON d.pedido_id = ped.id
          WHERE d.etapa::text = 'EMPENHO'::text AND d.nota_empenho IS NOT NULL AND NOT (EXISTS ( SELECT 1
                   FROM ne
                  WHERE ne.emenda::text = ped.emenda::text AND ne.numero_oficial::text = d.nota_empenho::text))
          GROUP BY ped.emenda
        ), ctr AS (
         SELECT DISTINCT ce.empenho_id,
            c_1.item_key
           FROM contrato_empenhos ce
             JOIN arp_item_contract_links c_1 ON c_1.contract_key::text = ce.contract_key::text
          WHERE (ce.empenho_id IN ( SELECT ne.id
                   FROM ne))
        ), it AS (
         SELECT ne.emenda,
            ne.id AS empenho_id,
            ne.numero_oficial,
            i.numero_item,
            i.quantidade,
            i.valor_unitario = 1::numeric OR i.quantidade <> trunc(i.quantidade) AS por_valor
           FROM ne
             JOIN empenho_itens_siafi i ON i.empenho_id = ne.id
          WHERE ne.situacao::text = 'LIDA'::text AND i.quantidade <> 0::numeric
        ), mapa AS (
         SELECT it.emenda,
            it.empenho_id,
            it.numero_oficial,
            it.numero_item,
            it.quantidade,
            it.por_valor,
                CASE
                    WHEN it.numero_item IS NULL THEN NULL::text
                    ELSE COALESCE(( SELECT
                            CASE
                                WHEN count(*) = 1 THEN min(x.item_key::text)
                                ELSE NULL::text
                            END AS "case"
                       FROM ctr x
                      WHERE x.empenho_id = it.empenho_id AND split_part(x.item_key::text, '-'::text, 3) ~ '^[0-9]+$'::text AND split_part(x.item_key::text, '-'::text, 3)::integer = it.numero_item AND (x.item_key::text IN ( SELECT lin.item_key
                               FROM lin
                              WHERE lin.emenda::text = it.emenda::text))), ( SELECT
                            CASE
                                WHEN count(*) = 1 THEN min(x.item_key::text)
                                ELSE NULL::text
                            END AS "case"
                       FROM ctr x
                      WHERE x.empenho_id = it.empenho_id AND split_part(x.item_key::text, '-'::text, 3) ~ '^[0-9]+$'::text AND split_part(x.item_key::text, '-'::text, 3)::integer = it.numero_item), ( SELECT
                            CASE
                                WHEN count(DISTINCT lin.item_key) = 1 THEN min(lin.item_key::text)
                                ELSE NULL::text
                            END AS "case"
                       FROM lin
                      WHERE lin.emenda::text = it.emenda::text AND split_part(lin.item_key::text, '-'::text, 3) ~ '^[0-9]+$'::text AND split_part(lin.item_key::text, '-'::text, 3)::integer = it.numero_item))
                END AS item_key
           FROM it
        ), emp AS (
         SELECT mapa.emenda,
            mapa.item_key,
            sum(mapa.quantidade) AS qtd,
            array_agg(DISTINCT mapa.numero_oficial ORDER BY mapa.numero_oficial) AS notas
           FROM mapa
          WHERE mapa.item_key IS NOT NULL AND NOT mapa.por_valor
          GROUP BY mapa.emenda, mapa.item_key
        ), pd AS (
         SELECT lin.emenda,
            lin.item_key,
            sum(lin.quantidade) AS qtd,
            array_agg(DISTINCT lin.numero ORDER BY lin.numero) AS pedidos,
            array_agg(DISTINCT lin.pedido_id) AS pedido_ids
           FROM lin
          GROUP BY lin.emenda, lin.item_key
        ), comp AS (
         SELECT e.emenda,
            ( SELECT array_agg(p.numero ORDER BY p.numero) AS array_agg
                   FROM ped p
                  WHERE p.emenda::text = e.emenda::text) AS pedidos_da_emenda,
            ( SELECT array_agg(p.id) AS array_agg
                   FROM ped p
                  WHERE p.emenda::text = e.emenda::text) AS pedido_ids_da_emenda,
            (EXISTS ( SELECT 1
                   FROM ne
                  WHERE ne.emenda::text = e.emenda::text)) AS tem_nota,
            COALESCE(( SELECT f.notas
                   FROM fora f
                  WHERE f.emenda::text = e.emenda::text), '{}'::character varying[]) AS notas_fora,
            ARRAY( SELECT ne.numero_oficial
                   FROM ne
                  WHERE ne.emenda::text = e.emenda::text AND ne.situacao::text IS DISTINCT FROM 'LIDA'::text
                  ORDER BY ne.numero_oficial) AS notas_nao_lidas,
            ARRAY( SELECT DISTINCT m.numero_oficial
                   FROM mapa m
                  WHERE m.emenda::text = e.emenda::text AND m.por_valor
                  ORDER BY m.numero_oficial) AS notas_por_valor,
            ARRAY( SELECT DISTINCT m.numero_oficial
                   FROM mapa m
                  WHERE m.emenda::text = e.emenda::text AND m.item_key IS NULL AND NOT m.por_valor
                  ORDER BY m.numero_oficial) AS notas_com_item_sem_ata
           FROM ( SELECT DISTINCT ped.emenda
                   FROM ped) e
        ), junto AS (
         SELECT COALESCE(pd.emenda, emp.emenda) AS emenda,
            COALESCE(pd.item_key, emp.item_key::character varying) AS item_key,
            COALESCE(pd.qtd, 0::bigint) AS qtd_pedido,
            COALESCE(emp.qtd, 0::numeric) AS qtd_nas_notas,
            COALESCE(emp.notas, '{}'::character varying[]) AS notas,
            pd.pedidos,
            pd.pedido_ids
           FROM pd
             FULL JOIN emp ON emp.emenda::text = pd.emenda::text AND emp.item_key = pd.item_key::text
        )
 SELECT j.emenda,
    j.item_key,
    j.qtd_pedido,
    j.qtd_nas_notas,
    j.notas,
    COALESCE(j.pedidos, c.pedidos_da_emenda) AS pedidos,
    COALESCE(j.pedido_ids, c.pedido_ids_da_emenda) AS pedido_ids,
        CASE
            WHEN j.qtd_nas_notas = j.qtd_pedido::numeric THEN 'IGUAL'::text
            WHEN j.qtd_nas_notas > j.qtd_pedido::numeric THEN 'A_MAIS'::text
            WHEN NOT c.tem_nota THEN 'SEM_NOTA'::text
            WHEN cardinality(c.notas_fora) > 0 OR cardinality(c.notas_nao_lidas) > 0 OR cardinality(c.notas_por_valor) > 0 OR cardinality(c.notas_com_item_sem_ata) > 0 THEN 'A_CONFERIR'::text
            ELSE 'A_MENOS'::text
        END AS situacao,
    c.notas_fora,
    c.notas_nao_lidas,
    c.notas_por_valor,
    c.notas_com_item_sem_ata
   FROM junto j
     JOIN comp c ON c.emenda::text = j.emenda::text
  WHERE ( SELECT has_permission('emendas.view'::text) AS has_permission);

-- ------------------------------------------------------------------------------
-- 4) Notas sem pedido: só material, e a emenda pode estar em qualquer pedido
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_emendas_notas_sem_pedido AS
WITH ne AS (
  SELECT e.id AS empenho_id, e.numero_oficial AS nota, e.uasg_emitente AS ug, e.ano_exercicio, e.data_emissao,
         e.valor_empenhado, e.credor_nome, e.plano_interno,
         substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') AS emenda,
         substring(e.plano_interno from '(20[0-9]{2})[0-9]{8}')::INTEGER AS emenda_ano,
         e.natureza_despesa, btrim(e.credor_cnpj_cpf) AS credor_doc
    FROM public.empenhos e
   WHERE e.uasg_emitente = '200330'
     -- Notas do ano (até fevereiro, também as do ano anterior): as emendas de anos fechados não estão no sistema.
     AND e.ano_exercicio >= EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '60 days')::INTEGER
     AND e.plano_interno ~ '20[0-9]{2}[0-9]{8}'
     AND COALESCE(e.valor_empenhado, 0) > 0
     -- Migration 211: só material (as compras pelas atas). A tarifa da Caixa nos convênios (4.4.90.35) não é da CAEP.
     AND e.natureza_despesa IN ('339030', '449052')),
ped AS (
  SELECT p.id, p.numero, p.siop_emenda, p.autor_id
    FROM public.emenda_pedidos p WHERE p.siop_emenda IS NOT NULL AND p.etapa <> 'CANCELADO')
SELECT ne.empenho_id, ne.nota, ne.ug, ne.ano_exercicio, ne.data_emissao, ne.valor_empenhado, ne.credor_nome, ne.plano_interno,
       ne.emenda, ne.emenda_ano,
       -- Pedidos de outras emendas do mesmo autor (os 4 primeiros dígitos): pode ser o número trocado no pedido.
       (SELECT array_agg(DISTINCT a.nome ORDER BY a.nome) FROM ped JOIN public.emenda_autores a ON a.id = ped.autor_id
         WHERE left(ped.siop_emenda, 4) = left(ne.emenda, 4)) AS autores_do_codigo,
       (SELECT array_agg(ped.id ORDER BY ped.numero) FROM ped WHERE left(ped.siop_emenda, 4) = left(ne.emenda, 4)) AS pedidos_do_codigo,
       ne.natureza_despesa, ne.credor_doc
  FROM ne
 -- Migration 211: a emenda pode ser a conferida ou outra emenda de qualquer pedido. Só o número, como antes: há pedidos com o
 -- ano da emenda diferente do plano interno das notas (Bancada SP, pedidos 445 e 511).
 WHERE NOT EXISTS (SELECT 1 FROM public.v_emenda_pedido_emendas pe JOIN public.emenda_pedidos p ON p.id = pe.pedido_id
                    WHERE p.etapa <> 'CANCELADO' AND pe.numero = ne.emenda)
   AND (SELECT public.has_permission('emendas.view'));

COMMENT ON VIEW public.v_emendas_notas_sem_pedido IS
  'Emendas: notas de material (3.3.90.30 e 4.4.90.52) de emenda da UG 200330 do ano cuja emenda nenhum pedido tem, nem como outra emenda (migrations 190 e 211).';

-- ------------------------------------------------------------------------------
-- 5) Pedidos prováveis de cada nota sem pedido
-- ------------------------------------------------------------------------------
-- Pedidos com itens do fornecedor da nota (o credor, pela regra credor_e_fornecedor_da_ata), com o valor desses itens e
-- o valor dos que ainda não têm nota. Entra o pedido do mesmo código de autor ou com os itens sem nota a até 10% do valor
-- da nota. A tela sugere o pedido com mais notas de valor igual (diferença de até R$ 0,05).
CREATE OR REPLACE VIEW public.v_emendas_notas_sem_pedido_pedidos AS
WITH ns AS (
  SELECT v.empenho_id, v.emenda, v.valor_empenhado, v.credor_nome, v.credor_doc FROM public.v_emendas_notas_sem_pedido v),
lin AS (
  SELECT l.pedido_id, l.quantidade * i.valor_unitario AS valor, i.fornecedor_cnpj_cpf AS doc, i.fornecedor_razao_social AS nome,
         EXISTS (SELECT 1 FROM public.emenda_linha_notas n WHERE n.linha_id = l.id AND n.empenho_id IS NOT NULL) AS com_nota
    FROM public.emenda_pedido_linhas l
    JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
    JOIN public.atas_registro_preco r ON r.numero_ata = split_part(l.item_key, '-', 1) AND r.codigo_uasg = split_part(l.item_key, '-', 2)
    JOIN public.itens_ata i ON i.ata_id = r.id AND lpad(i.numero_item, 5, '0') = split_part(l.item_key, '-', 3)
   WHERE NOT l.cancelada AND l.item_key IS NOT NULL),
soma AS (
  SELECT ns.empenho_id, ns.emenda, ns.valor_empenhado, lin.pedido_id,
         round(sum(lin.valor), 2) AS valor_itens,
         round(COALESCE(sum(lin.valor) FILTER (WHERE NOT lin.com_nota), 0), 2) AS valor_sem_nota
    FROM ns
    JOIN lin ON public.credor_e_fornecedor_da_ata(ns.credor_doc, ns.credor_nome, lin.doc, lin.nome)
   GROUP BY ns.empenho_id, ns.emenda, ns.valor_empenhado, lin.pedido_id)
SELECT s.empenho_id, s.pedido_id, p.numero AS pedido_numero, p.autor_id, p.siop_emenda AS pedido_emenda,
       p.siop_emenda_ano AS pedido_emenda_ano, s.valor_itens, s.valor_sem_nota,
       COALESCE(left(p.siop_emenda, 4) = left(s.emenda, 4), FALSE) AS mesmo_codigo
  FROM soma s
  JOIN public.emenda_pedidos p ON p.id = s.pedido_id
 WHERE COALESCE(left(p.siop_emenda, 4) = left(s.emenda, 4), FALSE)
    OR abs(s.valor_sem_nota - s.valor_empenhado) <= greatest(0.10 * s.valor_empenhado, 0.05);

COMMENT ON VIEW public.v_emendas_notas_sem_pedido_pedidos IS
  'Emendas: pedidos prováveis de cada nota sem pedido, pelos itens do mesmo fornecedor (migration 211). Só sugestão.';
REVOKE ALL ON public.v_emendas_notas_sem_pedido_pedidos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emendas_notas_sem_pedido_pedidos TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6) Ligar e tirar emendas do pedido
-- ------------------------------------------------------------------------------
-- p: { numero, ano?, modo: 'OUTRA' | 'TROCA', documento_sei?, observacao? }
-- OUTRA: mais uma emenda no pedido. TROCA: o nº conferido estava errado e passa a ser este (o antigo fica na auditoria).
-- Depois religa as notas na hora, sem esperar a busca diária.
CREATE OR REPLACE FUNCTION public.ligar_emenda_ao_pedido(p_pedido_id UUID, p_versao INTEGER, p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_num    CHAR(8);
  v_ano    SMALLINT;
  v_modo   TEXT := upper(COALESCE(NULLIF(btrim(p->>'modo'), ''), 'OUTRA'));
  v_sei    TEXT := NULLIF(regexp_replace(COALESCE(p->>'documento_sei', ''), '\D', '', 'g'), '');
  v_obs    TEXT := NULLIF(btrim(COALESCE(p->>'observacao', '')), '');
  v_nome   TEXT;
  v_versao INTEGER;
  v_notas  INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador ligam emendas aos pedidos.' USING ERRCODE = '42501';
  END IF;
  IF v_modo NOT IN ('OUTRA', 'TROCA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha se é outra emenda do pedido ou se o nº do pedido está errado.' USING ERRCODE = '22023';
  END IF;
  IF v_sei IS NOT NULL AND v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o documento SEI tem de 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(v_obs, '')) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a observação tem no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  SELECT x.numero, x.ano INTO v_num, v_ano FROM public.emendas_numero_e_ano(p->>'numero', (p->>'ano')::INTEGER) x;

  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e tente de novo.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa = 'CANCELADO' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido está cancelado.' USING ERRCODE = '22023';
  END IF;
  IF v_p.siop_emenda IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido ainda não tem a emenda conferida no SIOP. Confira a emenda pela etapa do pedido.' USING ERRCODE = '22023';
  END IF;
  IF v_p.siop_emenda::TEXT = v_num AND (v_p.siop_emenda_ano IS NULL OR v_p.siop_emenda_ano = v_ano) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: esta já é a emenda conferida do pedido.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);
  IF v_modo = 'OUTRA' THEN
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_emendas WHERE pedido_id = p_pedido_id AND numero = v_num AND ano = v_ano) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda já está no pedido.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedido_emendas (pedido_id, ano, numero, documento_sei, observacao, criado_por, criado_por_nome)
    VALUES (p_pedido_id, v_ano, v_num, v_sei, v_obs, auth.uid(), v_nome);
    UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = p_pedido_id RETURNING versao INTO v_versao;
  ELSE
    -- A mesma emenda como outra deixa de ser outra: passa a ser a conferida.
    DELETE FROM public.emenda_pedido_emendas WHERE pedido_id = p_pedido_id AND numero = v_num AND ano = v_ano;
    UPDATE public.emenda_pedidos SET siop_emenda = v_num, siop_emenda_ano = v_ano,
           versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = p_pedido_id RETURNING versao INTO v_versao;
  END IF;

  PERFORM public.emendas_ligar_notas();
  SELECT count(*) INTO v_notas
    FROM public.emenda_linha_notas n
    JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id
    JOIN public.empenhos e ON e.id = n.empenho_id
   WHERE l.pedido_id = p_pedido_id AND substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = v_num;
  RETURN jsonb_build_object('versao', v_versao, 'linhas_com_nota_da_emenda', v_notas);
END;
$$;
REVOKE ALL ON FUNCTION public.ligar_emenda_ao_pedido(UUID, INTEGER, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ligar_emenda_ao_pedido(UUID, INTEGER, JSONB) TO authenticated;

-- Tirar uma das outras emendas do pedido: só sem nota dela nos itens.
CREATE OR REPLACE FUNCTION public.remover_emenda_do_pedido(p_id UUID, p_versao INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_o      RECORD;
  v_p      RECORD;
  v_nome   TEXT;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador tiram emendas dos pedidos.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_o FROM public.emenda_pedido_emendas WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Emenda não encontrada no pedido.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = v_o.pedido_id FOR UPDATE;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e tente de novo.' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1
               FROM public.emenda_linha_notas n
               JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id
               JOIN public.empenhos e ON e.id = n.empenho_id
              WHERE l.pedido_id = v_o.pedido_id
                AND substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = v_o.numero::TEXT
                AND substring(e.plano_interno from '(20[0-9]{2})[0-9]{8}')::INTEGER = v_o.ano) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: há nota desta emenda nos itens do pedido; a emenda não pode sair.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  DELETE FROM public.emenda_pedido_emendas WHERE id = p_id;
  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = v_o.pedido_id RETURNING versao INTO v_versao;
  PERFORM public.emendas_ligar_notas();
  RETURN jsonb_build_object('versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.remover_emenda_do_pedido(UUID, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.remover_emenda_do_pedido(UUID, INTEGER) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7) Anulação total: o pedido volta à reserva sem a emenda conferida, e sem as outras
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_emendas_pedido_sem_emenda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.emenda_pedido_emendas WHERE pedido_id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_pedido_sem_emenda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_emendas_pedido_sem_emenda ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_pedido_sem_emenda
  AFTER UPDATE OF siop_emenda ON public.emenda_pedidos
  FOR EACH ROW WHEN (OLD.siop_emenda IS NOT NULL AND NEW.siop_emenda IS NULL)
  EXECUTE FUNCTION public.trg_emendas_pedido_sem_emenda();
