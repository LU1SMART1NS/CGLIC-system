-- Carteira de Atas mais leve: v_arp_item_saldo_detalhado levava 1,2 s a 2,5 s para o usuário logado na carteira
-- da 200331 (picos de 6 s, perto do tempo limite de 8 s). Quase todo o tempo ia na função registrado_por_uasg,
-- que lê o JSON dos órgãos de cada item (com expressões regulares e DISTINCT desde a migration 143) e era
-- chamada várias vezes na mesma consulta (~250 ms cada).
--
-- A cópia dos órgãos (itens_ata_unidades_copia) passa a guardar o resultado da função na coluna "registrado",
-- preenchida por gatilho sempre que a lista de órgãos é gravada. As views que chamavam a função passam a ler
-- essa coluna. A regra não muda: é a mesma função, só calculada uma vez ao gravar, e não a cada leitura.

ALTER TABLE public.itens_ata_unidades_copia
  ADD COLUMN IF NOT EXISTS registrado JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.itens_ata_unidades_copia.registrado IS
  'Resultado de registrado_por_uasg(unidades), gravado pelo gatilho trg_registrado_da_copia (migration 146).';

CREATE OR REPLACE FUNCTION public.trg_registrado_da_copia()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.registrado := COALESCE(
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.uasg) FROM public.registrado_por_uasg(NEW.unidades) r),
    '[]'::jsonb
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_registrado_da_copia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_registrado_da_copia ON public.itens_ata_unidades_copia;
CREATE TRIGGER trg_registrado_da_copia
  BEFORE INSERT OR UPDATE OF unidades ON public.itens_ata_unidades_copia
  FOR EACH ROW EXECUTE FUNCTION public.trg_registrado_da_copia();

-- Carga das linhas que já existem (só a coluna nova: o gatilho da base SENASP, UPDATE OF unidades, não dispara).
UPDATE public.itens_ata_unidades_copia c
   SET registrado = COALESCE(
         (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.uasg) FROM public.registrado_por_uasg(c.unidades) r),
         '[]'::jsonb
       );

-- v_item_quantitativos_orgaos: definição atual de produção, com a coluna gravada no lugar da função.
CREATE OR REPLACE VIEW public.v_item_quantitativos_orgaos
WITH (security_invoker = true)
AS
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
        ), hist AS (
         SELECT h.item_key,
            h.uasg,
            max(COALESCE(h.atualizado_na_fonte, (h.lido_em AT TIME ZONE 'America/Sao_Paulo'::text))) AS mudou_em
           FROM itens_ata_unidades_historico h
             JOIN informados i ON i.item_key::text = h.item_key::text
          GROUP BY h.item_key, h.uasg
        ), rem AS (
         SELECT r.item_key,
            r.uasg_origem AS uasg,
            sum(r.quantidade) AS confirmado
           FROM ata_item_remanejamentos r
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
          WHERE (split_part(x.item_key::text, '-'::text, 2) = ANY (ARRAY['200330'::text, '200331'::text])) OR (x.uasg::text = ANY (ARRAY['200330'::character varying, '200331'::character varying]::text[]))
        ), base AS (
         SELECT o.item_key,
            o.uasg,
            COALESCE(r.nome_orgao, q.nome_orgao::text) AS nome_orgao,
            r.tipo_unidade,
            o.uasg::text = ANY (ARRAY['200330'::character varying, '200331'::character varying]::text[]) AS eh_senasp,
            split_part(o.item_key::text, '-'::text, 2) = ANY (ARRAY['200330'::text, '200331'::text]) AS ata_da_senasp,
            COALESCE(q.quantidade, 0::numeric) AS quantidade_assinada,
            r.quantidade AS quantidade_registrada,
            r.incluido_em,
            r.atualizado_em,
            h.mudou_em AS mudou_no_historico_em,
            r.atualizado_em IS NOT NULL AND r.incluido_em IS NOT NULL AND r.atualizado_em > (r.incluido_em + '1 day'::interval) AND r.atualizado_em < (r.historico_desde AT TIME ZONE 'America/Sao_Paulo'::text) AND COALESCE(g.n, 1::bigint) <= 3 AS mudou_antes_do_historico,
            COALESCE(rm.confirmado, 0::numeric) AS remanejado_confirmado,
            co.quantidade AS continua_do_orgao
           FROM orgaos o
             LEFT JOIN reg r ON r.item_key::text = o.item_key::text AND r.uasg::text = o.uasg::text
             LEFT JOIN ata_item_quantidade_assinada q ON q.item_key::text = o.item_key::text AND q.uasg::text = o.uasg::text
             LEFT JOIN grupo g ON g.item_key::text = r.item_key::text AND g.atualizado_em = r.atualizado_em
             LEFT JOIN hist h ON h.item_key::text = o.item_key::text AND h.uasg::text = o.uasg::text
             LEFT JOIN rem rm ON rm.item_key::text = o.item_key::text AND rm.uasg::text = o.uasg::text
             LEFT JOIN ata_item_continua_orgao co ON co.item_key::text = o.item_key::text AND co.uasg::text = o.uasg::text
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
            c.mudou,
            c.falta,
            c.acima,
            LEAST(c.remanejado_confirmado, c.falta) AS confirmado_valido,
            c.falta - LEAST(c.remanejado_confirmado, c.falta) AS resto
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
            c.mudou,
            c.falta,
            c.acima,
            c.confirmado_valido,
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
                END AS situacao
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
    ata_da_senasp
   FROM sit s;

-- v_arp_item_saldo_detalhado: definição atual de produção, com a coluna gravada no lugar da função.
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
         SELECT o.item_key,
            min(o.situacao) AS situacao,
            sum(o.quantidade_assinada) AS assinada,
            sum(o.gerenciado) AS gerenciado
           FROM v_item_quantitativos_orgaos o
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
             LEFT JOIN v_item_quantitativos vq ON vq.item_key::text = ic.canonical_item_key
             LEFT JOIN registrado_acima ra ON ra.item_key = ic.canonical_item_key
             LEFT JOIN LATERAL ( SELECT e_1.excedente_senasp,
                        CASE
                            WHEN ra.resolvido_em IS NULL THEN e_1.excedente_senasp
                            ELSE 0::numeric
                        END AS desconto
                   FROM ( SELECT
                                CASE
                                    WHEN vq.item_key IS NOT NULL THEN LEAST(GREATEST(vq.cota_propria - vq.assinada_senasp, 0::numeric), ra.excedente)
                                    ELSE LEAST(ra.excedente, GREATEST(COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric), 0::numeric))
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

-- v_participantes_contratos_fila: definição atual de produção, com a coluna gravada no lugar da função.
CREATE OR REPLACE VIEW public.v_participantes_contratos_fila
WITH (security_invoker = true)
AS
 SELECT p.uasg_gerenciadora,
    p.uasg,
    l.lido_em,
    l.contratos_na_ug,
    l.contratos_nos_itens
   FROM ( SELECT DISTINCT split_part(c.item_key::text, '-'::text, 2)::character varying(6) AS uasg_gerenciadora,
            x.uasg
           FROM itens_ata_unidades_copia c
             CROSS JOIN LATERAL jsonb_to_recordset(c.registrado) x(uasg character varying, nome_orgao text, tipo_unidade text, quantidade numeric, incluido_em timestamp without time zone, atualizado_em timestamp without time zone)
          WHERE (split_part(c.item_key::text, '-'::text, 2) = ANY (ARRAY['200330'::text, '200331'::text])) AND (x.uasg::text <> ALL (ARRAY['200330'::character varying, '200331'::character varying]::text[]))) p
     LEFT JOIN participantes_contratos_leituras l ON l.uasg_gerenciadora::text = p.uasg_gerenciadora::text AND l.uasg::text = p.uasg::text;
