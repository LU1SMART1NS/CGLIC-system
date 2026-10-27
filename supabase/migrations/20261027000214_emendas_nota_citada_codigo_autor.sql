-- ==============================================================================
-- MIGRATION 214: NOTA CITADA NO SEI DO PEDIDO COM O CÓDIGO DO PARLAMENTAR NO PLANO INTERNO
-- Versão: 20261027000214_emendas_nota_citada_codigo_autor.sql
--
-- Conferência no SEI em 27/10/2026 (PDF de cada NE): nos pedidos 424, 428, 529/530 e 448 a nota é do pedido — a
-- descrição da NE cita a emenda do pedido e a autorização dele —, mas o NOME do plano interno no SIAFI traz o número de
-- outra emenda (o plano interno SP999S9 + código do parlamentar é reaproveitado):
--   2026NE000066/071  "SP999S94351 - 202443510006 - DELEGADO RAMAGEM"          pedido 428, emenda 4351 0004 (Dr. Flavio)
--   2026NE000083      "SP999S94408 - EMENDA 202544740008 - SARGENTO GONCALVES" pedido 424, emenda 4408 0002 (Leo Prates)
--   2026NE000091      "SP999S94405 - 202444050014 - KIKO CELEGUIM"              pedidos 529/530, emenda 4405 0002
--   2026NE000153/155/156 "SP999S97105 - BANCADA DE SANTA CATARINA/202571260005" pedido 448, emenda 7105 0008 (Bancada AP)
-- O sistema lia o número de 12 dígitos do nome e tirava a nota da conferência ("falta a nota do SEI no sistema") e a
-- punha em "Notas sem pedido". Mesmo caso nas 117, 118 e 147 (SP999S94014, pedido 532, emenda 4014 0004).
--
-- Regra nova: a nota citada no despacho de empenho do SEI do pedido vale para a emenda do pedido quando o código do
-- parlamentar no plano interno (SP999S9xxxx) é o da emenda, mesmo que o nome cite outro número.
--   1) v_emendas_empenho_x_pedido (base: migration 213): a nota entra em ne por essa regra.
--   2) v_emendas_notas_sem_pedido (base: migration 211): a nota sai da lista.
-- Mesmas colunas e mesma permissão nas duas views.
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
        ), cit AS (
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
                  WHERE p_1.emenda::text = c_1.emenda::text AND NOT o.principal)) OR "substring"(e.plano_interno, '^SP999S?9?([0-9]{4})'::text) = substr(c_1.emenda::text, 1, 4) AND (EXISTS ( SELECT 1
                   FROM cit
                  WHERE cit.emenda::text = c_1.emenda::text AND cit.id = e.id)))
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

-- Notas sem pedido: sai a nota citada no SEI de um pedido com o código do parlamentar do plano interno.
CREATE OR REPLACE VIEW public.v_emendas_notas_sem_pedido AS
WITH ne AS (
         SELECT e.id AS empenho_id,
            e.numero_oficial AS nota,
            e.uasg_emitente AS ug,
            e.ano_exercicio,
            e.data_emissao,
            e.valor_empenhado,
            e.credor_nome,
            e.plano_interno,
            "substring"(e.plano_interno, '20[0-9]{2}([0-9]{8})'::text) AS emenda,
            "substring"(e.plano_interno, '(20[0-9]{2})[0-9]{8}'::text)::integer AS emenda_ano,
            e.natureza_despesa,
            btrim(e.credor_cnpj_cpf::text) AS credor_doc
           FROM empenhos e
          WHERE e.uasg_emitente::text = '200330'::text AND e.ano_exercicio >= EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text) - '60 days'::interval)::integer AND e.plano_interno ~ '20[0-9]{2}[0-9]{8}'::text AND COALESCE(e.valor_empenhado, 0::numeric) > 0::numeric AND (e.natureza_despesa::text = ANY (ARRAY['339030'::character varying, '449052'::character varying]::text[]))
        ), ped AS (
         SELECT p.id,
            p.numero,
            p.siop_emenda,
            p.autor_id
           FROM emenda_pedidos p
          WHERE p.siop_emenda IS NOT NULL AND p.etapa::text <> 'CANCELADO'::text
        )
 SELECT empenho_id,
    nota,
    ug,
    ano_exercicio,
    data_emissao,
    valor_empenhado,
    credor_nome,
    plano_interno,
    emenda,
    emenda_ano,
    ( SELECT array_agg(DISTINCT a.nome ORDER BY a.nome) AS array_agg
           FROM ped
             JOIN emenda_autores a ON a.id::text = ped.autor_id::text
          WHERE "left"(ped.siop_emenda::text, 4) = "left"(ne.emenda, 4)) AS autores_do_codigo,
    ( SELECT array_agg(ped.id ORDER BY ped.numero) AS array_agg
           FROM ped
          WHERE "left"(ped.siop_emenda::text, 4) = "left"(ne.emenda, 4)) AS pedidos_do_codigo,
    natureza_despesa,
    credor_doc
   FROM ne
  WHERE NOT (EXISTS ( SELECT 1
           FROM v_emenda_pedido_emendas pe
             JOIN emenda_pedidos p ON p.id = pe.pedido_id
          WHERE p.etapa::text <> 'CANCELADO'::text AND pe.numero = ne.emenda)) AND NOT (EXISTS ( SELECT 1
           FROM emenda_pedido_documentos_sei d
             JOIN emenda_pedidos p ON p.id = d.pedido_id
          WHERE d.etapa::text = 'EMPENHO'::text AND d.nota_empenho::text = ne.nota::text AND p.etapa::text <> 'CANCELADO'::text AND "left"(p.siop_emenda::text, 4) = "substring"(ne.plano_interno, '^SP999S?9?([0-9]{4})'::text))) AND ( SELECT has_permission('emendas.view'::text) AS has_permission);;

COMMENT ON VIEW public.v_emendas_empenho_x_pedido IS
  'Emendas: quantidade dos pedidos já empenhados × quantidade das notas da emenda lidas no Portal, por emenda e item (migrations 187, 211, 213 e 214).';
