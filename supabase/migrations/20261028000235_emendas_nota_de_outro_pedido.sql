-- ==============================================================================
-- Migration 235: nota de outro pedido da mesma emenda não vai pelas regras automáticas
--
-- Com um pedido por ofício, a mesma emenda tem vários pedidos e cada nota de empenho está no pedido do ofício que ela
-- atende (documento de empenho do SEI). As regras CONTRATO, ITEM, AUTOR e FORNECEDOR olham só a emenda, o contrato e o
-- item, e levavam a nota também para a linha de outro pedido com o mesmo item da ata. Caso real (Gilson Marques): a
-- 2026NE000339 cita a autorização 36453579 (camionetes de Salto Veloso e Canoinhas, ofício EIM012/EIM013) e ia também
-- para a camionete de Balneário Piçarras (autorização 35963540, ofício MJ002), que não tem nota. Agora a nota cujo
-- documento de empenho está em outro pedido da mesma emenda, e não no da linha, não entra por essas regras; a regra SEI
-- não muda. Medição de 28/10/2026: nenhum outro item muda. Resto da função igual ao de produção (migration 233).
-- CREATE OR REPLACE mantém as permissões.
-- ==============================================================================

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
  -- Migration 235: nota cujo documento de empenho está em outro pedido da mesma emenda, e não neste, é daquele pedido
  -- (um pedido por ofício). As regras CONTRATO, ITEM, AUTOR e FORNECEDOR não a levam para as linhas deste (Gilson
  -- Marques: a 2026NE000339 é das camionetes de Salto Veloso e Canoinhas, autorização 36453579, e ia também para a
  -- camionete de Balneário Piçarras, de outro ofício, pela regra ITEM).
  nota_outro AS (
    SELECT DISTINCT p.id AS pedido_id, e.id AS empenho_id
      FROM public.emenda_pedidos p
      JOIN public.emenda_pedidos p2 ON p2.siop_emenda = p.siop_emenda AND p2.id <> p.id AND p2.etapa <> 'CANCELADO'
      JOIN public.emenda_pedido_documentos_sei d ON d.pedido_id = p2.id AND d.etapa = 'EMPENHO' AND d.nota_empenho IS NOT NULL
      JOIN public.empenhos e ON e.numero_oficial = d.nota_empenho AND e.uasg_emitente IN ('200330', '200331')
     WHERE p.etapa <> 'CANCELADO'
       AND NOT EXISTS (SELECT 1 FROM public.emenda_pedido_documentos_sei d3
                        WHERE d3.pedido_id = p.id AND d3.etapa = 'EMPENHO' AND d3.nota_empenho = d.nota_empenho)),
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
                               AND substring(e.plano_interno from '^SP999S?9?([0-9]{4})') = substr(pe.numero, 1, 4))
                           -- Migration 233: o texto do plano interno cita outra emenda, mas o código do autor é o da emenda
                           -- e o Portal da Transparência liga a nota a ela (Léo Prates, 2026NE000083: "SP999S94408 -
                           -- EMENDA 202544740008 - SARGENTO GONCALVES", no Portal da emenda 2026 4408 0002).
                           OR (substring(e.plano_interno from '^SP999S?9?([0-9]{4})') = substr(pe.numero, 1, 4)
                               AND EXISTS (SELECT 1 FROM public.emenda_execucao_portal x
                                            WHERE x.emenda = pe.numero AND (pe.ano IS NULL OR x.ano = pe.ano)
                                              AND (e.uasg_emitente || ':' || e.numero_oficial) = ANY (x.notas_senasp)))))
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
           AND NOT EXISTS (SELECT 1 FROM nota_outro o WHERE o.pedido_id = l.pedido_id AND o.empenho_id = ne.id)
         GROUP BY l.id),
  b AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN l_em le ON le.id = l.id JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt = le.numero AND ne.ano_exercicio = l.ano AND NOT l.antes
           AND NOT EXISTS (SELECT 1 FROM nota_outro o WHERE o.pedido_id = l.pedido_id AND o.empenho_id = ne.id)
         GROUP BY l.id),
  c AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN l_em le ON le.id = l.id JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt IS NULL AND ne.autor_pi = substr(le.numero, 1, 4) AND ne.ano_exercicio = l.ano AND NOT l.antes
           AND NOT EXISTS (SELECT 1 FROM nota_outro o WHERE o.pedido_id = l.pedido_id AND o.empenho_id = ne.id)
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
         WHERE NOT EXISTS (SELECT 1 FROM nota_outro o WHERE o.pedido_id = l.pedido_id AND o.empenho_id = e.id)
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
