-- Correção da migration 142: v_arp_item_saldo_detalhado passou do tempo limite (8 s) para o usuário logado na
-- carteira da 200331 (42,7 s medidos), porque o planejador recalculava v_item_registrado_acima para cada item.
-- A view passa a ler v_item_registrado_acima numa CTE MATERIALIZED (uma conta só). Nada mais muda.

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
        ), senasp_participante AS (
         -- Ata de outro órgão em que a SENASP é participante, com a ata assinada informada (migration 114): a base
         -- do saldo continua o registrado da SENASP; o que a ata assinada dá a mais fica com a gerenciadora.
         SELECT o.item_key,
            min(o.situacao) AS situacao,
            sum(o.quantidade_assinada) AS assinada,
            sum(o.gerenciado) AS gerenciado
           FROM v_item_quantitativos_orgaos o
          WHERE o.eh_senasp AND NOT o.ata_da_senasp
          GROUP BY o.item_key
        ), alocado_agg AS (
         -- Soma alocada às unidades internas (migration 116): a tela e os avisos comparam com a base do saldo.
         SELECT al.item_key,
            sum(al.allocated_qty) AS total_alocado
           FROM arp_allocations al
          GROUP BY al.item_key
        ), outros_orgaos AS (
         -- Órgãos que não são a SENASP com quantidade registrada no item (migration 116): sem eles, a ata assinada
         -- não muda o limite da alocação.
         SELECT c.item_key,
            count(*) AS outros
           FROM itens_ata_unidades_copia c
             CROSS JOIN LATERAL registrado_por_uasg(c.unidades) x(uasg, nome_orgao, tipo_unidade, quantidade, incluido_em, atualizado_em)
          WHERE x.uasg::text <> ALL (ARRAY['200330'::text, '200331'::text]) AND x.quantidade > 0::numeric
          GROUP BY c.item_key
        ), registrado_acima AS MATERIALIZED (
         -- Calculada uma vez só (migration 144): sem isso, o planejador refazia a soma da cópia para cada item e a
         -- carteira da 200331 passava do tempo limite para o usuário logado.
         SELECT * FROM v_item_registrado_acima
        ), itens_canonical AS (
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
        ), base AS (
         SELECT COALESCE(ic.canonical_item_key, ca.item_key::text) AS item_key,
            ic.item_ata_id,
            ic.ata_id,
            COALESCE(ic.numero_ata, split_part(ca.item_key::text, '-'::text, 1)::character varying) AS numero_ata,
            COALESCE(ic.codigo_uasg, split_part(ca.item_key::text, '-'::text, 2)::character varying) AS codigo_uasg,
            COALESCE(ic.numero_item, split_part(ca.item_key::text, '-'::text, 3)::character varying) AS numero_item,
            COALESCE(ic.uasg_carteira, split_part(ca.item_key::text, '-'::text, 2)::character varying) AS uasg_carteira,
            COALESCE(ic.papel_senasp, 'GERENCIADORA'::character varying) AS papel_senasp,
            ic.descricao_item,
            ic.fornecedor_razao_social,
            ic.fornecedor_cnpj_cpf,
            ic.valor_unitario,
            COALESCE(ic.quantidade_homologada, 0::numeric) AS quantidade_homologada,
            ic.quantidade_senasp,
            CASE
                    WHEN vq.item_key IS NOT NULL THEN vq.cota_propria
                    ELSE COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric)
                END - COALESCE(px.desconto, 0::numeric) AS quantidade_base_senasp,
            COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric) AS quantidade_registrada_senasp,
            COALESCE(vq.gerenciado_participantes, 0::numeric) AS gerenciado_participantes,
            vq.item_key IS NOT NULL AS ata_assinada_informada,
            vq.total_assinada,
            vq.total_registrado,
            COALESCE(vq.orgaos_fora_da_ata, 0::bigint) AS orgaos_fora_da_ata,
            COALESCE(vq.orgaos_contratado_acima, 0::bigint) AS orgaos_contratado_acima,
            COALESCE(ca.total_contratado, 0::numeric) AS quantidade_consumida,
            COALESCE(ca.total_contratos_vinculados, 0::bigint) AS total_contratos_vinculados,
            COALESCE(ca.total_contratos_sem_quantidade, 0::bigint) AS total_contratos_sem_quantidade,
            COALESCE(ca.total_contratos_ajustados, 0::bigint) AS total_contratos_ajustados,
            COALESCE(ca.quantidade_contratada_sem_unidade, 0::numeric) AS quantidade_contratada_sem_unidade,
            COALESCE(ca.total_contratos_a_conferir, 0::bigint) AS total_contratos_a_conferir,
            ra.soma_registrado,
            COALESCE(ra.excedente, 0::numeric) AS excedente_registrado,
            COALESCE(px.excedente_senasp, 0::numeric) AS excedente_registrado_senasp,
            COALESCE(px.desconto, 0::numeric) AS desconto_registrado_acima,
            ra.chave_aviso AS registrado_acima_chave,
            ra.resolvido_em IS NOT NULL AS registrado_acima_resolvido
           FROM itens_canonical ic
             FULL JOIN contratos_agg ca ON ca.item_key::text = ic.canonical_item_key
             LEFT JOIN v_item_quantitativos vq ON vq.item_key = ic.canonical_item_key
             LEFT JOIN registrado_acima ra ON ra.item_key = ic.canonical_item_key
             -- Parte do excedente que está na SENASP (com a ata assinada: o registrado líquido acima dela, até o
             -- excedente; sem ela: todo o excedente, até o registrado) e o desconto enquanto o aviso estiver aberto.
             LEFT JOIN LATERAL (
               SELECT e.excedente_senasp,
                      CASE WHEN ra.resolvido_em IS NULL THEN e.excedente_senasp ELSE 0::numeric END AS desconto
                 FROM (SELECT CASE
                                WHEN vq.item_key IS NOT NULL THEN LEAST(GREATEST(vq.cota_propria - vq.assinada_senasp, 0::numeric), ra.excedente)
                                ELSE LEAST(ra.excedente, GREATEST(COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric), 0::numeric))
                              END AS excedente_senasp) e
                WHERE ra.item_key IS NOT NULL
             ) px ON true
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
     LEFT JOIN senasp_participante sp ON sp.item_key = b.item_key
     LEFT JOIN alocado_agg al ON al.item_key::text = b.item_key
     LEFT JOIN outros_orgaos oo ON oo.item_key::text = b.item_key;
