-- Saldo dos itens mais leve: a lista de órgãos de cada item é calculada uma vez só por leitura.
--
-- Medição em 16/10/2026 (usuário logado, carteira 200331, banco calmo): v_arp_item_saldo_detalhado levava ~0,7 s,
-- e ~70% disso era v_item_quantitativos_orgaos (11.140 linhas, ~245 ms), calculada DUAS vezes na mesma consulta:
-- uma dentro de v_item_quantitativos (totais por item) e outra em senasp_participante. Em produção a consulta da
-- carteira tem média de ~1 s e cauda até 7,5 s; com o banco disputado passa dos 8 s do usuário logado e o Início
-- mostrava "canceling statement due to statement timeout".
--
-- Três mudanças, sem mexer em colunas, tipos, ordem ou regras:
--   1. "orgaos" (MATERIALIZED): v_item_quantitativos_orgaos é lida uma vez e serve a "vq" e a senasp_participante.
--   2. "vq" (MATERIALIZED): as colunas de v_item_quantitativos que esta view usa, calculadas a partir de "orgaos"
--      (mesmas fórmulas, ver migration 109). v_item_quantitativos continua existindo para as outras telas.
--   3. "chaves": o FULL JOIN entre itens e contratos virou itens da ata + contratos órfãos (UNION ALL). O filtro da
--      tela passa a cair direto em atas_registro_preco.uasg_carteira/codigo_uasg (NOT NULL, com índice); antes caía
--      num COALESCE, o banco estimava ~2 itens (eram 667) e recalculava "vq" e "registrado_acima" item a item.
--
-- Ensaio em produção (16/10/2026, view de teste em transação desfeita, como usuário logado): mesmas 667 linhas,
-- nenhuma diferença em nenhum sentido, nomes e tipos das colunas iguais. Tempo de execução, atual → nova:
-- carteira 200331 640–740 → 430–620 ms; carteira 200330 (vazia) 14–16 → 11–12 ms; codigo_uasg 200109 585–640 →
-- ~430 ms; um item (Item 360) ~600 → ~355 ms. Planejamento 44–56 → 30–40 ms.
--
-- ATENÇÃO ao mudar a fórmula de v_item_quantitativos: o CTE "vq" abaixo repete a parte dela usada aqui.

CREATE OR REPLACE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
 WITH empenhado_agg AS (
         SELECT v_arp_item_contrato_empenhado.item_key,
            sum(v_arp_item_contrato_empenhado.notas)::bigint AS total_empenhos_vinculados
           FROM v_arp_item_contrato_empenhado
          GROUP BY v_arp_item_contrato_empenhado.item_key
        ), contratos_agg AS (
         SELECT v_arp_item_contrato_quantidade.item_key,
            COALESCE(sum(v_arp_item_contrato_quantidade.quantidade_contratada), 0::numeric) AS total_contratado,
            count(*) AS total_contratos_vinculados,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.quantidade_contratada IS NULL) AS total_contratos_sem_quantidade,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.ajustada) AS total_contratos_ajustados,
            COALESCE(sum(v_arp_item_contrato_quantidade.quantidade_sem_unidade), 0::numeric) AS quantidade_contratada_sem_unidade,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.situacao_divisao = 'CONFERIR'::text OR v_arp_item_contrato_quantidade.fonte_mudou_apos_ajuste) AS total_contratos_a_conferir
           FROM v_arp_item_contrato_quantidade
          GROUP BY v_arp_item_contrato_quantidade.item_key
        ), orgaos AS MATERIALIZED (
         -- Lista de órgãos de cada item, calculada uma vez e usada por vq e por senasp_participante.
         SELECT o.item_key,
            o.uasg,
            o.eh_senasp,
            o.ata_da_senasp,
            o.quantidade_assinada,
            o.quantidade_registrada,
            o.gerenciado,
            o.situacao
           FROM v_item_quantitativos_orgaos o
        ), vq AS MATERIALIZED (
         -- Mesmas fórmulas de v_item_quantitativos (migration 109), só com as colunas usadas nesta view.
         SELECT u.item_key,
            COALESCE(p.total_assinada, 0::numeric) AS total_assinada,
            COALESCE(p.total_registrado, 0::numeric) AS total_registrado,
            COALESCE(p.assinada_senasp, 0::numeric) AS assinada_senasp,
            COALESCE(p.gerenciado_participantes, 0::numeric) AS gerenciado_participantes,
            it.registrado_senasp - COALESCE(p.gerenciado_participantes, 0::numeric) AS cota_propria,
            COALESCE(p.orgaos_fora_da_ata, 0::bigint) AS orgaos_fora_da_ata,
            COALESCE(ar.n, 0::bigint) AS orgaos_contratado_acima
           FROM ( SELECT DISTINCT r.item_key
                   FROM ata_item_assinada_registros r) u
             JOIN ( SELECT (((a.numero_ata::text || '-'::text) || a.codigo_uasg::text) || '-'::text) || lpad(i.numero_item::text, 5, '0'::text) AS item_key,
                    COALESCE(i.quantidade_senasp, i.quantidade_homologada, 0::numeric) AS registrado_senasp
                   FROM itens_ata i
                     JOIN atas_registro_preco a ON a.id = i.ata_id
                  WHERE a.codigo_uasg::text = ANY (ARRAY['200330'::text, '200331'::text])) it ON it.item_key = u.item_key::text
             LEFT JOIN ( SELECT o.item_key,
                    sum(o.quantidade_assinada) AS total_assinada,
                    sum(COALESCE(o.quantidade_registrada, 0::numeric)) AS total_registrado,
                    sum(o.quantidade_assinada) FILTER (WHERE o.eh_senasp) AS assinada_senasp,
                    sum(o.gerenciado) AS gerenciado_participantes,
                    count(*) FILTER (WHERE o.situacao = 'FORA_DA_ATA'::text) AS orgaos_fora_da_ata
                   FROM orgaos o
                  GROUP BY o.item_key) p ON p.item_key::text = u.item_key::text
             LEFT JOIN ( SELECT o.item_key,
                    count(*) AS n
                   FROM orgaos o
                     JOIN ( SELECT c.item_key,
                            c.uasg,
                            sum(COALESCE(c.quantidade, 0::numeric)) AS quantidade
                           FROM participantes_contratos_itens c
                          GROUP BY c.item_key, c.uasg) c ON c.item_key::text = o.item_key::text AND c.uasg::text = o.uasg::text
                  WHERE NOT o.eh_senasp AND c.quantidade > COALESCE(o.quantidade_registrada, 0::numeric)
                  GROUP BY o.item_key) ar ON ar.item_key::text = u.item_key::text
        ), senasp_participante AS (
         SELECT o.item_key,
            min(o.situacao) AS situacao,
            sum(o.quantidade_assinada) AS assinada,
            sum(o.gerenciado) AS gerenciado
           FROM orgaos o
          WHERE o.eh_senasp AND NOT o.ata_da_senasp
          GROUP BY o.item_key
        ), alocado_agg AS (
         SELECT al_1.item_key,
            sum(al_1.allocated_qty) AS total_alocado
           FROM arp_allocations al_1
          GROUP BY al_1.item_key
        ), outros_orgaos AS (
         SELECT c.item_key,
            count(*) AS outros
           FROM itens_ata_unidades_copia c
             CROSS JOIN LATERAL jsonb_to_recordset(c.registrado) x(uasg character varying, nome_orgao text, tipo_unidade text, quantidade numeric, incluido_em timestamp without time zone, atualizado_em timestamp without time zone)
          WHERE (x.uasg::text <> ALL (ARRAY['200330'::text, '200331'::text])) AND x.quantidade > 0::numeric
          GROUP BY c.item_key
        ), registrado_acima AS MATERIALIZED (
         SELECT v_item_registrado_acima.item_key,
            v_item_registrado_acima.numero_ata,
            v_item_registrado_acima.codigo_uasg,
            v_item_registrado_acima.numero_item,
            v_item_registrado_acima.homologado,
            v_item_registrado_acima.soma_registrado,
            v_item_registrado_acima.excedente,
            v_item_registrado_acima.registrado_senasp,
            v_item_registrado_acima.chave_aviso,
            v_item_registrado_acima.resolvido_em,
            v_item_registrado_acima.resolvido_por_nome,
            v_item_registrado_acima.resolvido_justificativa
           FROM v_item_registrado_acima
        ), itens_canonical AS NOT MATERIALIZED (
         SELECT i.id AS item_ata_id,
            i.ata_id,
            a.numero_ata,
            a.codigo_uasg,
            a.uasg_carteira,
            a.papel_senasp,
            i.numero_item,
            (((a.numero_ata::text || '-'::text) || a.codigo_uasg::text) || '-'::text) || lpad(i.numero_item::text, 5, '0'::text) AS canonical_item_key,
            i.descricao_item,
            i.fornecedor_razao_social,
            i.fornecedor_cnpj_cpf,
            COALESCE(i.quantidade_homologada, 0::numeric) AS quantidade_homologada,
            i.quantidade_senasp,
            i.valor_unitario
           FROM itens_ata i
             JOIN atas_registro_preco a ON a.id = i.ata_id
        ), chaves AS (
         -- O mesmo que "itens_canonical FULL JOIN contratos_agg", escrito como itens da ata (com os seus contratos)
         -- + contratos cujo item não está na ata. Assim o filtro da tela (uasg_carteira, codigo_uasg...) cai direto
         -- nas colunas da ata (NOT NULL, com índice) e o banco estima certo quantos itens vêm. Com o FULL JOIN o filtro
         -- era sobre um COALESCE, o banco chutava ~2 itens (eram 667) e recalculava partes da view item a item.
         SELECT ic.canonical_item_key AS item_key,
            ic.canonical_item_key,
            ic.item_ata_id,
            ic.ata_id,
            ic.numero_ata,
            ic.codigo_uasg,
            ic.numero_item,
            ic.uasg_carteira,
            ic.papel_senasp,
            ic.descricao_item,
            ic.fornecedor_razao_social,
            ic.fornecedor_cnpj_cpf,
            ic.valor_unitario,
            ic.quantidade_homologada,
            ic.quantidade_senasp,
            ca.total_contratado,
            ca.total_contratos_vinculados,
            ca.total_contratos_sem_quantidade,
            ca.total_contratos_ajustados,
            ca.quantidade_contratada_sem_unidade,
            ca.total_contratos_a_conferir
           FROM itens_canonical ic
             LEFT JOIN contratos_agg ca ON ca.item_key::text = ic.canonical_item_key
        UNION ALL
         SELECT ca.item_key::text AS item_key,
            ic.canonical_item_key,
            ic.item_ata_id,
            ic.ata_id,
            split_part(ca.item_key::text, '-'::text, 1)::character varying AS numero_ata,
            split_part(ca.item_key::text, '-'::text, 2)::character varying AS codigo_uasg,
            split_part(ca.item_key::text, '-'::text, 3)::character varying AS numero_item,
            split_part(ca.item_key::text, '-'::text, 2)::character varying AS uasg_carteira,
            'GERENCIADORA'::character varying AS papel_senasp,
            ic.descricao_item,
            ic.fornecedor_razao_social,
            ic.fornecedor_cnpj_cpf,
            ic.valor_unitario,
            ic.quantidade_homologada,
            ic.quantidade_senasp,
            ca.total_contratado,
            ca.total_contratos_vinculados,
            ca.total_contratos_sem_quantidade,
            ca.total_contratos_ajustados,
            ca.quantidade_contratada_sem_unidade,
            ca.total_contratos_a_conferir
           FROM contratos_agg ca
             LEFT JOIN itens_canonical ic ON false
          WHERE NOT (EXISTS ( SELECT 1
                   FROM itens_canonical i2
                  WHERE i2.canonical_item_key = ca.item_key::text))
        ), base AS (
         SELECT k.item_key,
            k.item_ata_id,
            k.ata_id,
            k.numero_ata,
            k.codigo_uasg,
            k.numero_item,
            k.uasg_carteira,
            k.papel_senasp,
            k.descricao_item,
            k.fornecedor_razao_social,
            k.fornecedor_cnpj_cpf,
            k.valor_unitario,
            COALESCE(k.quantidade_homologada, 0::numeric) AS quantidade_homologada,
            k.quantidade_senasp,
                CASE
                    WHEN vq.item_key IS NOT NULL THEN vq.cota_propria
                    ELSE COALESCE(k.quantidade_senasp, k.quantidade_homologada, 0::numeric)
                END - COALESCE(px.desconto, 0::numeric) AS quantidade_base_senasp,
            COALESCE(k.quantidade_senasp, k.quantidade_homologada, 0::numeric) AS quantidade_registrada_senasp,
            COALESCE(vq.gerenciado_participantes, 0::numeric) AS gerenciado_participantes,
            vq.item_key IS NOT NULL AS ata_assinada_informada,
            vq.total_assinada,
            vq.total_registrado,
            COALESCE(vq.orgaos_fora_da_ata, 0::bigint) AS orgaos_fora_da_ata,
            COALESCE(vq.orgaos_contratado_acima, 0::bigint) AS orgaos_contratado_acima,
            COALESCE(k.total_contratado, 0::numeric) AS quantidade_consumida,
            COALESCE(k.total_contratos_vinculados, 0::bigint) AS total_contratos_vinculados,
            COALESCE(k.total_contratos_sem_quantidade, 0::bigint) AS total_contratos_sem_quantidade,
            COALESCE(k.total_contratos_ajustados, 0::bigint) AS total_contratos_ajustados,
            COALESCE(k.quantidade_contratada_sem_unidade, 0::numeric) AS quantidade_contratada_sem_unidade,
            COALESCE(k.total_contratos_a_conferir, 0::bigint) AS total_contratos_a_conferir,
            ra.soma_registrado,
            COALESCE(ra.excedente, 0::numeric) AS excedente_registrado,
            COALESCE(px.excedente_senasp, 0::numeric) AS excedente_registrado_senasp,
            COALESCE(px.desconto, 0::numeric) AS desconto_registrado_acima,
            ra.chave_aviso AS registrado_acima_chave,
            ra.resolvido_em IS NOT NULL AS registrado_acima_resolvido
           FROM chaves k
             LEFT JOIN vq ON vq.item_key::text = k.canonical_item_key
             LEFT JOIN registrado_acima ra ON ra.item_key = k.canonical_item_key
             LEFT JOIN LATERAL ( SELECT e_1.excedente_senasp,
                        CASE
                            WHEN ra.resolvido_em IS NULL THEN e_1.excedente_senasp
                            ELSE 0::numeric
                        END AS desconto
                   FROM ( SELECT
                                CASE
                                    WHEN vq.item_key IS NOT NULL THEN LEAST(GREATEST(vq.cota_propria - vq.assinada_senasp, 0::numeric), ra.excedente)
                                    ELSE LEAST(ra.excedente, GREATEST(COALESCE(k.quantidade_senasp, k.quantidade_homologada, 0::numeric), 0::numeric))
                                END AS excedente_senasp) e_1
                  WHERE ra.item_key IS NOT NULL) px ON true
        )
 SELECT b.item_key,
    b.item_ata_id,
    b.ata_id,
    b.numero_ata,
    b.codigo_uasg,
    b.numero_item,
    b.descricao_item,
    b.fornecedor_razao_social,
    b.fornecedor_cnpj_cpf,
    b.valor_unitario,
    b.quantidade_homologada,
    b.quantidade_consumida,
    b.quantidade_base_senasp - b.quantidade_consumida AS saldo_disponivel,
        CASE
            WHEN b.quantidade_base_senasp > 0::numeric THEN round(b.quantidade_consumida / b.quantidade_base_senasp * 100::numeric, 2)
            ELSE 0::numeric
        END AS percentual_consumido,
    COALESCE(e.total_empenhos_vinculados, 0::bigint) AS total_empenhos_vinculados,
    b.total_contratos_vinculados,
    b.total_contratos_sem_quantidade,
    b.quantidade_senasp,
    b.quantidade_base_senasp,
    b.total_contratos_ajustados,
    b.quantidade_contratada_sem_unidade,
    b.total_contratos_a_conferir,
    b.uasg_carteira,
    b.papel_senasp,
    b.quantidade_registrada_senasp,
    b.gerenciado_participantes,
    b.ata_assinada_informada,
    b.total_assinada,
    b.total_registrado,
    b.orgaos_fora_da_ata,
    b.orgaos_contratado_acima,
    sp.situacao AS situacao_senasp_participante,
    sp.assinada AS assinada_senasp_participante,
    COALESCE(sp.gerenciado, 0::numeric) AS gerenciado_pela_gerenciadora,
    COALESCE(al.total_alocado, 0::numeric) AS total_alocado_unidades,
    COALESCE(oo.outros, 0::bigint) AS outros_orgaos_registrados,
    b.soma_registrado,
    b.excedente_registrado,
    b.excedente_registrado_senasp,
    b.desconto_registrado_acima,
    b.registrado_acima_chave,
    b.registrado_acima_resolvido
   FROM base b
     LEFT JOIN empenhado_agg e ON e.item_key::text = b.item_key
     LEFT JOIN senasp_participante sp ON sp.item_key::text = b.item_key
     LEFT JOIN alocado_agg al ON al.item_key::text = b.item_key
     LEFT JOIN outros_orgaos oo ON oo.item_key::text = b.item_key;
