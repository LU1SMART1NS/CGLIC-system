-- ==============================================================================
-- MIGRATION 213: ITEM DA NOTA DA EMENDA SEM CONTRATO (conferência empenhado × pedido)
-- Versão: 20261027000213_emendas_item_da_nota_sem_contrato.sql
--
-- "Empenho a conferir" tinha 36 emendas; em 33 o motivo era "item da nota sem ata conhecida" (126 notas, 154 itens,
-- medição de 27/10/2026). As notas da UG 200330 quase nunca estão na lista de empenhos de um contrato (os contratos
-- são todos da UASG 200331), então a ata do item vinha só pelo número do item nas linhas da emenda — e o mesmo número
-- existe em 2 a 10 atas da emenda (item 1 de várias atas). Sem uma só ata, a nota ficava fora da soma.
--
-- Agora, depois das regras de antes (contrato da nota; número do item nas linhas da emenda, se for uma ata só):
--   4) a linha da emenda com aquele número de item que já está ligada àquela nota (emenda_linha_notas), se for uma só;
--   5) a linha da emenda com aquele número de item cuja ata tem como fornecedor o credor da nota
--      (credor_e_fornecedor_da_ata, a comparação das migrations 191/192), se for uma só.
-- Na medição, 4 sozinha resolve 136 dos 154 itens, 5 sozinha 144, as duas juntas 148, e nunca apontam atas diferentes.
-- Só a view muda (mesmas colunas, mesma permissão). Base: a versão da migration 211.
-- ==============================================================================

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
                      WHERE lin.emenda::text = it.emenda::text AND split_part(lin.item_key::text, '-'::text, 3) ~ '^[0-9]+$'::text AND split_part(lin.item_key::text, '-'::text, 3)::integer = it.numero_item), ( SELECT
                            CASE
                                WHEN count(DISTINCT lin.item_key) = 1 THEN min(lin.item_key::text)
                                ELSE NULL::text
                            END AS "case"
                       FROM lin
                         JOIN emenda_linha_notas n ON n.linha_id = lin.linha_id
                      WHERE n.empenho_id = it.empenho_id AND lin.emenda::text = it.emenda::text AND split_part(lin.item_key::text, '-'::text, 3) ~ '^[0-9]+$'::text AND split_part(lin.item_key::text, '-'::text, 3)::integer = it.numero_item), ( SELECT
                            CASE
                                WHEN count(DISTINCT lin.item_key) = 1 THEN min(lin.item_key::text)
                                ELSE NULL::text
                            END AS "case"
                       FROM lin
                         JOIN empenhos e ON e.id = it.empenho_id
                         JOIN atas_registro_preco r ON r.numero_ata::text = split_part(lin.item_key::text, '-'::text, 1) AND r.codigo_uasg::text = split_part(lin.item_key::text, '-'::text, 2)
                         JOIN itens_ata i ON i.ata_id = r.id AND lpad(i.numero_item::text, 5, '0'::text) = split_part(lin.item_key::text, '-'::text, 3)
                      WHERE lin.emenda::text = it.emenda::text AND split_part(lin.item_key::text, '-'::text, 3) ~ '^[0-9]+$'::text AND split_part(lin.item_key::text, '-'::text, 3)::integer = it.numero_item AND credor_e_fornecedor_da_ata(e.credor_cnpj_cpf::text, e.credor_nome::text, i.fornecedor_cnpj_cpf::text, i.fornecedor_razao_social::text)))
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

COMMENT ON VIEW public.v_emendas_empenho_x_pedido IS
  'Emendas: quantidade dos pedidos já empenhados × quantidade das notas da emenda lidas no Portal, por emenda e item (migrations 187, 211 e 213).';
