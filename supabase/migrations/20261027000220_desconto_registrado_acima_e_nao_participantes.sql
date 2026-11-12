-- ==============================================================================
-- Versão: 20261027000220_desconto_registrado_acima_e_nao_participantes.sql
-- 1) v_arp_item_saldo_detalhado: o desconto do registrado acima do homologado (migration 142) comparava a cota
--    própria, que já tira o remanejado a não participantes (migration 219), com a ata assinada, que não tira.
--    Com o remanejado, a parte da SENASP acima da ata assinada sumia. Agora compara o registrado da SENASP
--    antes dos remanejamentos a não participantes (cota + todo o remanejado pela SENASP, pendente ou já no
--    Compras.gov.br) com a ata assinada. 00062/2024 item 3: registrado 106, ata assinada 103, 32 remanejados,
--    excedente do item 14 → desconto 3 e base 71 (era 0 e 74).
-- 1b) v_item_registrado_acima: a soma do registrado conta também o remanejado a não participantes que o
--    Compras.gov.br já tirou do registrado de quem cedeu. A lista do Compras.gov.br só tem gerenciadora e
--    participantes; sem isso, quando o remanejamento aparecesse lá, a soma cairia abaixo do homologado e o
--    excedente sem lastro sumiria (00062/2024 item 3: 141 → 109 com o homologado 127).
-- 2) v_uasgs_participantes_gti: os não participantes que receberam remanejamento entram na lista de Ajustes ›
--    Grupo das UASGs.
-- 3) uasgs_para_cadastrar: e no cadastro de UASGs (nome inteiro, cidade/UF e sigla do órgão para o GTI).
-- Definições geradas a partir da produção (pg_get_viewdef/pg_get_functiondef); só as partes acima mudam.
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_item_registrado_acima
WITH (security_invoker = true)
AS
 WITH itens AS (
         SELECT (((a.numero_ata::text || '-'::text) || a.codigo_uasg::text) || '-'::text) || lpad(i.numero_item::text, 5, '0'::text) AS item_key,
            a.numero_ata,
            a.codigo_uasg,
            i.numero_item,
                CASE
                    WHEN btrim(i.numero_item::text) ~ '^\d+$'::text THEN btrim(i.numero_item::text)::bigint::text
                    ELSE btrim(i.numero_item::text)
                END AS item_canonico,
            COALESCE(i.quantidade_homologada, 0::numeric) AS homologado,
            COALESCE(i.quantidade_senasp, i.quantidade_homologada, 0::numeric) AS registrado_senasp
           FROM itens_ata i
             JOIN atas_registro_preco a ON a.id = i.ata_id
          WHERE a.codigo_uasg::text = ANY (ARRAY['200330'::text, '200331'::text])
        ), fim AS (
         SELECT it.item_key,
            it.numero_ata,
            it.codigo_uasg,
            it.numero_item,
            it.item_canonico,
            it.homologado,
            it.registrado_senasp,
            s.soma_registrado + COALESCE(np.refletido, 0::numeric) AS soma_registrado,
            s.soma_registrado + COALESCE(np.refletido, 0::numeric) - it.homologado AS excedente,
            (((((((('SALDO::'::text || it.numero_ata::text) || '-'::text) || it.codigo_uasg::text) || '::'::text) || it.item_canonico) || '::REGISTRADO-ACIMA-'::text) || round(s.soma_registrado + COALESCE(np.refletido, 0::numeric), 2)::text) || '-'::text) || round(it.homologado, 2)::text AS chave_aviso
           FROM itens it
             CROSS JOIN LATERAL ( SELECT sum(
                        CASE
                            WHEN btrim(u.value ->> 'quantidadeRegistrada'::text) ~ '^[0-9]+(\.[0-9]+)?$'::text THEN btrim(u.value ->> 'quantidadeRegistrada'::text)::numeric
                            ELSE 0::numeric
                        END) AS soma_registrado
                   FROM itens_ata_unidades_copia c
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(c.unidades) = 'array'::text THEN c.unidades
                            ELSE '[]'::jsonb
                        END) u(value)
                  WHERE c.item_key::text = it.item_key AND jsonb_typeof(u.value) = 'object'::text AND COALESCE(u.value ->> 'dataHoraExclusao'::text, ''::text) = ''::text AND regexp_replace(COALESCE(u.value ->> 'codigoUnidade'::text, ''::text), '\D'::text, ''::text, 'g'::text) ~ '^[0-9]{6}$'::text) s
             -- Remanejado a não participantes que o Compras.gov.br já tirou do registrado de quem cedeu (a lista do
             -- Compras.gov.br só tem gerenciadora e participantes): volta para a soma, senão o excedente sumiria.
             -- Mesma conta de v_item_quantitativos_orgaos: a queda do registrado desde o primeiro remanejamento.
             LEFT JOIN LATERAL ( SELECT sum(LEAST(o.total, GREATEST(o.primeiro - COALESCE(( SELECT sum(
                                CASE
                                    WHEN btrim(u.value ->> 'quantidadeRegistrada'::text) ~ '^[0-9]+(\.[0-9]+)?$'::text THEN btrim(u.value ->> 'quantidadeRegistrada'::text)::numeric
                                    ELSE 0::numeric
                                END)
                           FROM itens_ata_unidades_copia c
                             CROSS JOIN LATERAL jsonb_array_elements(
                                CASE
                                    WHEN jsonb_typeof(c.unidades) = 'array'::text THEN c.unidades
                                    ELSE '[]'::jsonb
                                END) u(value)
                          WHERE c.item_key::text = it.item_key AND jsonb_typeof(u.value) = 'object'::text AND COALESCE(u.value ->> 'dataHoraExclusao'::text, ''::text) = ''::text AND regexp_replace(COALESCE(u.value ->> 'codigoUnidade'::text, ''::text), '\D'::text, ''::text, 'g'::text) = o.uasg_origem::text), 0::numeric), 0::numeric))) AS refletido
                   FROM ( SELECT r.uasg_origem,
                            sum(r.quantidade) AS total,
                            (array_agg(r.registrado_origem ORDER BY r.registrado_em))[1] AS primeiro
                           FROM ata_item_remanejamentos_nao_participante r
                          WHERE r.item_key::text = it.item_key AND r.desfeito_em IS NULL
                          GROUP BY r.uasg_origem) o) np ON true
          WHERE it.homologado > 0::numeric AND (s.soma_registrado + COALESCE(np.refletido, 0::numeric) - it.homologado) >= 0.01
        )
 SELECT f.item_key,
    f.numero_ata,
    f.codigo_uasg,
    f.numero_item,
    f.homologado,
    f.soma_registrado,
    f.excedente,
    f.registrado_senasp,
    f.chave_aviso,
    r.resolvido_em,
    r.resolvido_por_nome,
    r.justificativa AS resolvido_justificativa
   FROM fim f
     LEFT JOIN avisos_resolvidos r ON r.chave::text = f.chave_aviso;

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
         SELECT o.item_key,
            o.uasg,
            o.eh_senasp,
            o.ata_da_senasp,
            o.quantidade_assinada,
            o.quantidade_registrada,
            o.gerenciado,
            o.saida_nao_participante,
            o.remanejado_nao_participante,
            o.situacao
           FROM v_item_quantitativos_orgaos o
        ), vq AS MATERIALIZED (
         SELECT u.item_key,
            COALESCE(p.total_assinada, 0::numeric) AS total_assinada,
            COALESCE(p.total_registrado, 0::numeric) AS total_registrado,
            COALESCE(p.assinada_senasp, 0::numeric) AS assinada_senasp,
            COALESCE(p.gerenciado_participantes, 0::numeric) AS gerenciado_participantes,
            it.registrado_senasp - COALESCE(p.gerenciado_participantes, 0::numeric) - COALESCE(p.saida_nao_participante, 0::numeric) AS cota_propria,
            COALESCE(p.orgaos_fora_da_ata, 0::bigint) AS orgaos_fora_da_ata,
            COALESCE(ar.n, 0::bigint) AS orgaos_contratado_acima,
            COALESCE(p.remanejado_np_senasp, 0::numeric) AS remanejado_np_senasp
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
                    sum(o.saida_nao_participante) AS saida_nao_participante,
                    sum(o.remanejado_nao_participante) FILTER (WHERE o.eh_senasp) AS remanejado_np_senasp,
                    count(*) FILTER (WHERE o.situacao = 'FORA_DA_ATA'::text) AS orgaos_fora_da_ata
                   FROM orgaos o
                  GROUP BY o.item_key) p ON p.item_key::text = u.item_key::text
             LEFT JOIN ( SELECT o.item_key,
                    count(*) AS n
                   FROM orgaos o
                     JOIN ( SELECT c_1.item_key,
                            c_1.uasg,
                            sum(COALESCE(c_1.quantidade, 0::numeric)) AS quantidade
                           FROM participantes_contratos_itens c_1
                          GROUP BY c_1.item_key, c_1.uasg) c ON c.item_key::text = o.item_key::text AND c.uasg::text = o.uasg::text
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
                                    WHEN vq.item_key IS NOT NULL THEN LEAST(GREATEST(vq.cota_propria + vq.remanejado_np_senasp - vq.assinada_senasp, 0::numeric), ra.excedente)
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

CREATE OR REPLACE VIEW public.v_uasgs_participantes_gti
WITH (security_invoker = true)
AS
 WITH participantes AS (
         SELECT u.value ->> 'codigoUnidade'::text AS uasg,
            (split_part(c.item_key::text, '-'::text, 1) || '-'::text) || split_part(c.item_key::text, '-'::text, 2) AS ata,
            NULLIF(btrim(u.value ->> 'nomeUnidade'::text), ''::text) AS nome_na_ata
           FROM itens_ata_unidades_copia c,
            LATERAL jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u(value)
          WHERE (u.value ->> 'codigoUnidade'::text) ~ '^[0-9]{6}$'::text AND ((u.value ->> 'codigoUnidade'::text) <> ALL (ARRAY['200330'::text, '200331'::text])) AND (u.value ->> 'codigoUnidade'::text) <> split_part(c.item_key::text, '-'::text, 2) AND COALESCE(u.value ->> 'tipoUnidade'::text, ''::text) <> 'GERENCIADORA'::text
        UNION ALL
         -- Não participantes que receberam remanejamento (migration 219): também entram no grupo das UASGs.
         SELECT r.uasg_destino::text AS uasg,
            (split_part(r.item_key::text, '-'::text, 1) || '-'::text) || split_part(r.item_key::text, '-'::text, 2) AS ata,
            NULLIF(btrim(r.nome_destino::text), ''::text) AS nome_na_ata
           FROM ata_item_remanejamentos_nao_participante r
          WHERE r.desfeito_em IS NULL AND r.uasg_destino::text ~ '^[0-9]{6}$'::text
        ), por_uasg AS (
         SELECT participantes.uasg,
            max(participantes.nome_na_ata) AS nome_na_ata,
            count(DISTINCT participantes.ata)::integer AS atas
           FROM participantes
          GROUP BY participantes.uasg
        UNION ALL
         SELECT g_1.codigo_uasg,
            NULL::text,
            0
           FROM uasgs_grupo_gti g_1
          WHERE NOT (EXISTS ( SELECT 1
                   FROM participantes p
                  WHERE p.uasg = g_1.codigo_uasg::text))
        )
 SELECT pu.uasg::character varying(6) AS codigo_uasg,
    COALESCE(k.nome, pu.nome_na_ata::character varying) AS nome,
    pu.nome_na_ata,
    k.sigla_uf,
    k.municipio,
    k.sigla_orgao,
    k.esfera_orgao,
    pu.atas,
    g.grupo,
    g.confirmado_por_nome,
    g.confirmado_em
   FROM por_uasg pu
     LEFT JOIN uasgs_cadastro k ON k.codigo_uasg::text = pu.uasg AND k.encontrada
     LEFT JOIN uasgs_grupo_gti g ON g.codigo_uasg::text = pu.uasg;

CREATE OR REPLACE FUNCTION public.uasgs_para_cadastrar(p_limite integer DEFAULT 500)
 RETURNS TABLE(codigo_uasg character varying)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH citadas AS (
    SELECT u->>'codigoUnidade' AS uasg
      FROM public.itens_ata_unidades_copia c,
           jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u
    UNION
    -- adesões: "929777 - SECRETARIA DE ..."
    SELECT substring(a->>'unidadeNaoParticipante' FROM '^\s*([0-9]{6})')
      FROM public.itens_ata_unidades_copia c,
           jsonb_array_elements(CASE WHEN jsonb_typeof(c.adesoes) = 'array' THEN c.adesoes ELSE '[]'::jsonb END) a
    UNION
    SELECT q.uasg FROM public.ata_item_quantidade_assinada q
    UNION
    -- não participantes que receberam remanejamento (migration 219)
    SELECT r.uasg_destino FROM public.ata_item_remanejamentos_nao_participante r WHERE r.desfeito_em IS NULL
  )
  SELECT ci.uasg::VARCHAR(6)
    FROM citadas ci
    LEFT JOIN public.uasgs_cadastro k ON k.codigo_uasg = ci.uasg
   WHERE ci.uasg ~ '^[0-9]{6}$'
     AND (public.eh_service_role() OR public.has_role('gestor'))
     AND (
       k.codigo_uasg IS NULL
       OR (k.encontrada AND k.lido_em < NOW() - INTERVAL '30 days')
       OR (NOT k.encontrada AND k.lido_em < NOW() - INTERVAL '7 days')
       -- Lida antes da migration 139: falta o órgão (sigla e esfera).
       OR (k.encontrada AND k.orgao_lido_em IS NULL)
     )
   ORDER BY k.lido_em NULLS FIRST, ci.uasg
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 2000));
$function$;
