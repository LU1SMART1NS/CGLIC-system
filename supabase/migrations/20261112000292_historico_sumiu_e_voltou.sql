-- Órgão que some da fonte e volta com a mesma quantidade não é remanejamento.
--
-- A consulta 3 do Compras.gov.br às vezes deixa de devolver um órgão e o devolve na leitura seguinte. O histórico
-- grava "sumiu" (quantidade_nova nula) e "voltou" (quantidade_anterior nula), e a view tratava qualquer linha do
-- histórico como mudança: o órgão 927143 ficava "Remanejado a menos" em 14 itens sem ter mudado (1 → some → 1).
--
-- Agora o histórico só conta como mudança quando alguma linha tem os dois valores (mudança de verdade) ou quando a
-- primeira quantidade conhecida é diferente da última (ex.: 00058/2025 item 1, 926016: 180 → some → 0).
-- Mesmas colunas: as views que leem esta não precisam ser recriadas.

CREATE OR REPLACE VIEW public.v_item_quantitativos_orgaos AS
 WITH informados AS (
         SELECT DISTINCT r.item_key
           FROM ata_item_assinada_registros r
        ), reg AS (
         SELECT c.item_key,
            c.historico_desde,
            x.uasg,
            x.nome_orgao,
            x.tipo_unidade,
            x.quantidade,
            x.incluido_em,
            x.atualizado_em
           FROM itens_ata_unidades_copia c
             JOIN informados i ON i.item_key::text = c.item_key::text
             CROSS JOIN LATERAL jsonb_to_recordset(c.registrado) x(uasg character varying, nome_orgao text, tipo_unidade text, quantidade numeric, incluido_em timestamp without time zone, atualizado_em timestamp without time zone)
        ), grupo AS (
         SELECT r.item_key,
            r.atualizado_em,
            count(*) AS n
           FROM reg r
          WHERE r.atualizado_em IS NOT NULL
          GROUP BY r.item_key, r.atualizado_em
        ), mov AS (
         -- Órgãos com ata assinada cujo registrado mudou depois do registro e antes do histórico, e para que lado.
         SELECT r.item_key,
            r.uasg,
            r.atualizado_em,
            sign(COALESCE(r.quantidade, 0::numeric) - q.quantidade) AS sentido
           FROM reg r
             JOIN ata_item_quantidade_assinada q ON q.item_key::text = r.item_key::text AND q.uasg::text = r.uasg::text
          WHERE r.atualizado_em IS NOT NULL AND r.incluido_em IS NOT NULL AND r.atualizado_em > (r.incluido_em + '1 day'::interval) AND r.atualizado_em < (r.historico_desde AT TIME ZONE 'America/Sao_Paulo'::text) AND COALESCE(r.quantidade, 0::numeric) <> q.quantidade
        ), par AS (
         -- Remanejamento com muitos órgãos: quem desceu tem quem subiu até 60 s antes ou depois (e vice-versa).
         SELECT DISTINCT a.item_key,
            a.uasg
           FROM mov a
             JOIN mov b ON b.item_key::text = a.item_key::text AND b.sentido = (- a.sentido) AND b.atualizado_em >= (a.atualizado_em - '00:01:00'::interval) AND b.atualizado_em <= (a.atualizado_em + '00:01:00'::interval)
        ), hist AS (
         SELECT h.item_key,
            h.uasg,
            max(COALESCE(h.atualizado_na_fonte, (h.lido_em AT TIME ZONE 'America/Sao_Paulo'::text))) AS mudou_em
           FROM itens_ata_unidades_historico h
             JOIN informados i ON i.item_key::text = h.item_key::text
          GROUP BY h.item_key, h.uasg
         -- Órgão que sumiu da fonte e voltou com a mesma quantidade não mudou (migration 292).
         HAVING bool_or(h.quantidade_anterior IS NOT NULL AND h.quantidade_nova IS NOT NULL) OR ((array_agg(h.quantidade_anterior ORDER BY h.lido_em, h.id))[1] IS DISTINCT FROM (array_agg(h.quantidade_nova ORDER BY h.lido_em DESC, h.id DESC))[1])
        ), rem AS (
         SELECT r.item_key,
            r.uasg_origem AS uasg,
            sum(r.quantidade) AS confirmado
           FROM ata_item_remanejamentos r
          WHERE r.desfeito_em IS NULL
          GROUP BY r.item_key, r.uasg_origem
        ), np AS (
         SELECT r.item_key,
            r.uasg_origem AS uasg,
            sum(r.quantidade) AS quantidade,
            (array_agg(r.registrado_origem ORDER BY r.registrado_em, r.id))[1] AS registrado_no_primeiro
           FROM ata_item_remanejamentos_nao_participante r
          WHERE r.desfeito_em IS NULL
          GROUP BY r.item_key, r.uasg_origem
        ), orgaos AS (
         SELECT x.item_key,
            x.uasg
           FROM ( SELECT q.item_key,
                    q.uasg
                   FROM ata_item_quantidade_assinada q
                     JOIN informados i ON i.item_key::text = q.item_key::text
                UNION
                 SELECT r.item_key,
                    r.uasg
                   FROM reg r) x
          WHERE (split_part(x.item_key::text, '-'::text, 2) = ANY (ARRAY['200330'::text, '200331'::text])) OR (x.uasg::text = ANY (ARRAY['200330'::character varying::text, '200331'::character varying::text]))
        ), base AS (
         SELECT o.item_key,
            o.uasg,
            COALESCE(r.nome_orgao, q.nome_orgao::text) AS nome_orgao,
            r.tipo_unidade,
            o.uasg::text = ANY (ARRAY['200330'::character varying::text, '200331'::character varying::text]) AS eh_senasp,
            split_part(o.item_key::text, '-'::text, 2) = ANY (ARRAY['200330'::text, '200331'::text]) AS ata_da_senasp,
            COALESCE(q.quantidade, 0::numeric) AS quantidade_assinada,
            r.quantidade AS quantidade_registrada,
            r.incluido_em,
            r.atualizado_em,
            h.mudou_em AS mudou_no_historico_em,
            r.atualizado_em IS NOT NULL AND r.incluido_em IS NOT NULL AND r.atualizado_em > (r.incluido_em + '1 day'::interval) AND r.atualizado_em < (r.historico_desde AT TIME ZONE 'America/Sao_Paulo'::text) AND (COALESCE(g.n, 1::bigint) <= 3 OR pa.uasg IS NOT NULL) AS mudou_antes_do_historico,
            COALESCE(rm.confirmado, 0::numeric) AS remanejado_confirmado,
            co.quantidade AS continua_do_orgao,
            COALESCE(npr.quantidade, 0::numeric) AS remanejado_np,
            npr.registrado_no_primeiro AS np_registrado_no_primeiro
           FROM orgaos o
             LEFT JOIN reg r ON r.item_key::text = o.item_key::text AND r.uasg::text = o.uasg::text
             LEFT JOIN ata_item_quantidade_assinada q ON q.item_key::text = o.item_key::text AND q.uasg::text = o.uasg::text
             LEFT JOIN grupo g ON g.item_key::text = r.item_key::text AND g.atualizado_em = r.atualizado_em
             LEFT JOIN par pa ON pa.item_key::text = r.item_key::text AND pa.uasg::text = r.uasg::text
             LEFT JOIN hist h ON h.item_key::text = o.item_key::text AND h.uasg::text = o.uasg::text
             LEFT JOIN rem rm ON rm.item_key::text = o.item_key::text AND rm.uasg::text = o.uasg::text
             LEFT JOIN ata_item_continua_orgao co ON co.item_key::text = o.item_key::text AND co.uasg::text = o.uasg::text
             LEFT JOIN np npr ON npr.item_key::text = o.item_key::text AND npr.uasg::text = o.uasg::text
        ), calc AS (
         SELECT b.item_key,
            b.uasg,
            b.nome_orgao,
            b.tipo_unidade,
            b.eh_senasp,
            b.ata_da_senasp,
            b.quantidade_assinada,
            b.quantidade_registrada,
            b.incluido_em,
            b.atualizado_em,
            b.mudou_no_historico_em,
            b.mudou_antes_do_historico,
            b.remanejado_confirmado,
            b.continua_do_orgao,
            b.remanejado_np,
            b.np_registrado_no_primeiro,
            b.mudou_no_historico_em IS NOT NULL OR b.mudou_antes_do_historico AS mudou,
            GREATEST(b.quantidade_assinada - COALESCE(b.quantidade_registrada, 0::numeric), 0::numeric) AS falta,
            GREATEST(COALESCE(b.quantidade_registrada, 0::numeric) - b.quantidade_assinada, 0::numeric) AS acima
           FROM base b
        ), calc2 AS (
         SELECT c.item_key,
            c.uasg,
            c.nome_orgao,
            c.tipo_unidade,
            c.eh_senasp,
            c.ata_da_senasp,
            c.quantidade_assinada,
            c.quantidade_registrada,
            c.incluido_em,
            c.atualizado_em,
            c.mudou_no_historico_em,
            c.mudou_antes_do_historico,
            c.remanejado_confirmado,
            c.continua_do_orgao,
            c.remanejado_np,
            c.np_registrado_no_primeiro,
            c.mudou,
            c.falta,
            c.acima,
            LEAST(c.remanejado_confirmado, c.falta) AS confirmado_valido,
                CASE
                    WHEN c.eh_senasp AND c.ata_da_senasp THEN 0::numeric
                    ELSE LEAST(c.remanejado_np, c.falta - LEAST(c.remanejado_confirmado, c.falta))
                END AS np_coberto,
            c.falta - LEAST(c.remanejado_confirmado, c.falta) AS resto0,
            c.falta - LEAST(c.remanejado_confirmado, c.falta) -
                CASE
                    WHEN c.eh_senasp AND c.ata_da_senasp THEN 0::numeric
                    ELSE LEAST(c.remanejado_np, c.falta - LEAST(c.remanejado_confirmado, c.falta))
                END AS resto
           FROM calc c
        ), sit AS (
         SELECT c.item_key,
            c.uasg,
            c.nome_orgao,
            c.tipo_unidade,
            c.eh_senasp,
            c.ata_da_senasp,
            c.quantidade_assinada,
            c.quantidade_registrada,
            c.incluido_em,
            c.atualizado_em,
            c.mudou_no_historico_em,
            c.mudou_antes_do_historico,
            c.remanejado_confirmado,
            c.continua_do_orgao,
            c.remanejado_np,
            c.np_registrado_no_primeiro,
            c.mudou,
            c.falta,
            c.acima,
            c.confirmado_valido,
            c.np_coberto,
            c.resto0,
            c.resto,
                CASE
                    WHEN c.eh_senasp AND c.ata_da_senasp THEN 'SENASP'::text
                    WHEN c.quantidade_registrada IS NOT NULL AND c.quantidade_assinada = 0::numeric AND c.quantidade_registrada > 0::numeric THEN 'FORA_DA_ATA'::text
                    WHEN c.falta = 0::numeric AND c.acima = 0::numeric THEN 'IGUAL'::text
                    WHEN c.acima > 0::numeric THEN
                    CASE
                        WHEN c.mudou THEN 'REMANEJADO_A_MAIS'::text
                        ELSE 'ACIMA_DA_ATA'::text
                    END
                    WHEN c.resto = 0::numeric THEN 'REMANEJAMENTO_CONFIRMADO'::text
                    WHEN c.quantidade_registrada IS NOT NULL AND c.mudou THEN 'REMANEJADO_A_MENOS'::text
                    ELSE 'GERENCIADO'::text
                END AS situacao,
                CASE
                    WHEN c.eh_senasp AND c.ata_da_senasp THEN 'SENASP'::text
                    WHEN c.quantidade_registrada IS NOT NULL AND c.quantidade_assinada = 0::numeric AND c.quantidade_registrada > 0::numeric THEN 'FORA_DA_ATA'::text
                    WHEN c.falta = 0::numeric AND c.acima = 0::numeric THEN 'IGUAL'::text
                    WHEN c.acima > 0::numeric THEN
                    CASE
                        WHEN c.mudou THEN 'REMANEJADO_A_MAIS'::text
                        ELSE 'ACIMA_DA_ATA'::text
                    END
                    WHEN c.resto0 = 0::numeric THEN 'REMANEJAMENTO_CONFIRMADO'::text
                    WHEN c.quantidade_registrada IS NOT NULL AND c.mudou THEN 'REMANEJADO_A_MENOS'::text
                    ELSE 'GERENCIADO'::text
                END AS situacao0
           FROM calc2 c
        )
 SELECT item_key,
    uasg,
    nome_orgao,
    tipo_unidade,
    eh_senasp,
    quantidade_assinada,
    quantidade_registrada,
    quantidade_registrada IS NULL AS sem_registro,
    situacao,
        CASE
            WHEN eh_senasp AND ata_da_senasp THEN 0::numeric
            ELSE falta
        END AS falta,
        CASE
            WHEN eh_senasp AND ata_da_senasp THEN 0::numeric
            ELSE acima
        END AS acima,
        CASE
            WHEN eh_senasp AND ata_da_senasp THEN 0::numeric
            ELSE confirmado_valido
        END AS remanejado_confirmado,
        CASE
            WHEN eh_senasp AND ata_da_senasp THEN 0::numeric
            ELSE resto
        END AS resto,
    continua_do_orgao,
        CASE situacao
            WHEN 'GERENCIADO'::text THEN resto
            WHEN 'REMANEJADO_A_MENOS'::text THEN LEAST(COALESCE(continua_do_orgao, 0::numeric), resto)
            ELSE 0::numeric
        END AS gerenciado,
    mudou,
    COALESCE(mudou_no_historico_em,
        CASE
            WHEN mudou_antes_do_historico THEN atualizado_em
            ELSE NULL::timestamp without time zone
        END) AS mudou_em,
    atualizado_em,
    incluido_em,
    ata_da_senasp,
    remanejado_np AS remanejado_nao_participante,
        CASE
            WHEN eh_senasp AND ata_da_senasp THEN remanejado_np - LEAST(remanejado_np, GREATEST(COALESCE(np_registrado_no_primeiro, 0::numeric) - COALESCE(quantidade_registrada, 0::numeric), 0::numeric))
            ELSE
            CASE situacao0
                WHEN 'GERENCIADO'::text THEN resto0
                WHEN 'REMANEJADO_A_MENOS'::text THEN LEAST(COALESCE(continua_do_orgao, 0::numeric), resto0)
                ELSE 0::numeric
            END -
            CASE situacao
                WHEN 'GERENCIADO'::text THEN resto
                WHEN 'REMANEJADO_A_MENOS'::text THEN LEAST(COALESCE(continua_do_orgao, 0::numeric), resto)
                ELSE 0::numeric
            END
        END AS saida_nao_participante,
        CASE
            WHEN eh_senasp AND ata_da_senasp THEN remanejado_np - LEAST(remanejado_np, GREATEST(COALESCE(np_registrado_no_primeiro, 0::numeric) - COALESCE(quantidade_registrada, 0::numeric), 0::numeric))
            ELSE remanejado_np - np_coberto
        END AS nao_participante_aguarda_fonte
   FROM sit s;
