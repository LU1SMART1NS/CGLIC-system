-- ==============================================================================
-- MIGRATION 219: REMANEJAMENTO PARA ÓRGÃO NÃO PARTICIPANTE
-- Versão: 20261027000219_remanejamento_nao_participante.sql
-- Contexto: a gerenciadora pode remanejar quantidade de um participante (ou da própria cota da SENASP) para um
-- órgão não participante, com a anuência de quem cede e observados os limites da adesão (50% do item por órgão e
-- o limite total de adesões). A lista de órgãos do Compras.gov.br só traz gerenciadora e participantes, então a
-- operação não aparece lá: sem registro aqui, a redução do participante contava como "devolvida à SENASP".
-- Regras aprovadas pelo usuário (protótipo de 27/10/2026):
-- 1) Os limites da lei travam a gravação: 50% do homologado por não participante (somando as adesões que ele já
--    tem) e o limite de adesão do item (maximoAdesao; sem ele, o limite da gerenciadora; sem os dois, 2x o
--    homologado).
-- 2) Documento SEI (8 dígitos) obrigatório: a autorização com a concordância de quem cede.
-- 3) A quantidade sai da ata: não volta para a cota própria. No participante, cobre primeiro a redução que o
--    Compras.gov.br já mostra (falta sem destino); o resto ainda está no registrado dele e "aguarda a fonte".
--    Remanejamento de participante não muda a cota própria.
-- 4) Cota da SENASP: não passa do que está livre (base do saldo − alocado). Se depois o registrado da SENASP
--    cair no Compras.gov.br, a queda conta como o remanejamento já refletido (não desconta duas vezes).
-- 5) UASG participante do item é recusada (caminho: remanejamento entre participantes).
-- 6) Adesão nova da mesma UASG que aparecer depois na cópia das adesões fica "a conferir" e não conta no limite
--    até o gestor decidir: "é o mesmo" (não conta) ou "são diferentes" (conta).
-- 7) Gestor de saldo ou coordenador (allocations.manage), como o remanejamento entre participantes. Desfazer
--    pede justificativa.
-- Exige a ata assinada informada no item (as contas por órgão só existem com ela) e ata gerenciada pela SENASP.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Tabelas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ata_item_remanejamentos_nao_participante (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key               VARCHAR(100) NOT NULL,
  uasg_origem            VARCHAR(6)   NOT NULL CHECK (uasg_origem ~ '^[0-9]{6}$'),
  uasg_destino           VARCHAR(6)   NOT NULL CHECK (uasg_destino ~ '^[0-9]{6}$'),
  nome_destino           VARCHAR(200) NOT NULL CHECK (length(btrim(nome_destino)) > 0),
  quantidade             NUMERIC(18, 4) NOT NULL CHECK (quantidade > 0 AND quantidade = trunc(quantidade)),
  documento_sei          VARCHAR(8)   NOT NULL CHECK (documento_sei ~ '^[0-9]{8}$'),
  justificativa          TEXT NOT NULL CHECK (length(btrim(justificativa)) BETWEEN 15 AND 500),
  -- Registrado do órgão que cede no Compras.gov.br na hora do registro (na SENASP, base do "já refletido").
  registrado_origem      NUMERIC(18, 4),
  -- Adesões que a UASG de destino já tinha no item (dataAprovacaoAnalise): só as que vierem depois ficam a conferir.
  adesoes_conhecidas     TEXT[] NOT NULL DEFAULT '{}',
  registrado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  registrado_por_nome    VARCHAR(150) NOT NULL,
  registrado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  desfeito_em            TIMESTAMPTZ,
  desfeito_por_nome      VARCHAR(150),
  desfeito_justificativa TEXT,
  CHECK (uasg_destino <> uasg_origem),
  CHECK (uasg_destino NOT IN ('200330', '200331')),
  CHECK ((desfeito_em IS NULL) = (desfeito_justificativa IS NULL))
);
CREATE INDEX IF NOT EXISTS ata_item_rem_np_ativos_idx ON public.ata_item_remanejamentos_nao_participante (item_key, uasg_origem) WHERE desfeito_em IS NULL;
CREATE INDEX IF NOT EXISTS ata_item_rem_np_destino_idx ON public.ata_item_remanejamentos_nao_participante (item_key, uasg_destino) WHERE desfeito_em IS NULL;
CREATE INDEX IF NOT EXISTS ata_item_rem_np_user_idx ON public.ata_item_remanejamentos_nao_participante (registrado_por_user_id) WHERE registrado_por_user_id IS NOT NULL;
COMMENT ON TABLE public.ata_item_remanejamentos_nao_participante IS
  'Remanejamento de um participante (ou da cota da SENASP) para órgão não participante. A quantidade sai da ata e conta no limite de adesão. Grava só remanejar_para_nao_participante; desfazer preenche desfeito_em.';

CREATE TABLE IF NOT EXISTS public.ata_item_adesao_conferida (
  item_key             VARCHAR(100) NOT NULL,
  uasg                 VARCHAR(6)   NOT NULL CHECK (uasg ~ '^[0-9]{6}$'),
  aprovada_em          VARCHAR(19)  NOT NULL,   -- dataAprovacaoAnalise, sem fuso
  remanejamento_id     UUID NOT NULL REFERENCES public.ata_item_remanejamentos_nao_participante(id) ON DELETE CASCADE,
  decisao              VARCHAR(10)  NOT NULL CHECK (decisao IN ('MESMO', 'DIFERENTES')),
  decidido_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_por_nome    VARCHAR(150) NOT NULL,
  decidido_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_key, uasg, aprovada_em)
);
CREATE INDEX IF NOT EXISTS ata_item_adesao_conferida_rem_idx ON public.ata_item_adesao_conferida (remanejamento_id);
CREATE INDEX IF NOT EXISTS ata_item_adesao_conferida_user_idx ON public.ata_item_adesao_conferida (decidido_por_user_id) WHERE decidido_por_user_id IS NOT NULL;
COMMENT ON TABLE public.ata_item_adesao_conferida IS
  'Decisão do gestor sobre uma adesão que apareceu depois de um remanejamento para a mesma UASG: MESMO (não conta no limite) ou DIFERENTES (conta). Grava só decidir_adesao_do_remanejamento.';

ALTER TABLE public.ata_item_remanejamentos_nao_participante ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_item_adesao_conferida ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: ata_item_remanejamentos_nao_participante" ON public.ata_item_remanejamentos_nao_participante;
CREATE POLICY "Authenticated Read: ata_item_remanejamentos_nao_participante" ON public.ata_item_remanejamentos_nao_participante
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.ata_item_remanejamentos_nao_participante;
CREATE POLICY "Somente usuario ativo" ON public.ata_item_remanejamentos_nao_participante AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
DROP POLICY IF EXISTS "Authenticated Read: ata_item_adesao_conferida" ON public.ata_item_adesao_conferida;
CREATE POLICY "Authenticated Read: ata_item_adesao_conferida" ON public.ata_item_adesao_conferida
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.ata_item_adesao_conferida;
CREATE POLICY "Somente usuario ativo" ON public.ata_item_adesao_conferida AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));

REVOKE ALL ON public.ata_item_remanejamentos_nao_participante, public.ata_item_adesao_conferida FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ata_item_remanejamentos_nao_participante, public.ata_item_adesao_conferida TO authenticated;
GRANT ALL ON public.ata_item_remanejamentos_nao_participante, public.ata_item_adesao_conferida TO service_role;

DROP TRIGGER IF EXISTS trg_audit_ata_item_remanejamentos_nao_participante ON public.ata_item_remanejamentos_nao_participante;
CREATE TRIGGER trg_audit_ata_item_remanejamentos_nao_participante AFTER INSERT OR UPDATE OR DELETE ON public.ata_item_remanejamentos_nao_participante
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
DROP TRIGGER IF EXISTS trg_audit_ata_item_adesao_conferida ON public.ata_item_adesao_conferida;
CREATE TRIGGER trg_audit_ata_item_adesao_conferida AFTER INSERT OR UPDATE OR DELETE ON public.ata_item_adesao_conferida
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- 2) Adesões do item com a situação de cada uma no limite
--    CONTA: entra no limite · A_CONFERIR: apareceu depois de um remanejamento para a mesma UASG e o gestor ainda
--    não decidiu (não conta) · MESMO: é o próprio remanejamento (não conta, o remanejamento já conta).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adesoes_do_item(p_item_key VARCHAR)
RETURNS TABLE (uasg VARCHAR, aprovada_em VARCHAR, quantidade NUMERIC, situacao TEXT)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH ad AS (
    SELECT substring(a->>'unidadeNaoParticipante' FROM '^\s*([0-9]{6})')::VARCHAR AS uasg,
           left(COALESCE(a->>'dataAprovacaoAnalise', ''), 19)::VARCHAR AS aprovada_em,
           COALESCE(NULLIF(a->>'quantidadeAprovadaAdesao', '')::NUMERIC, 0) AS quantidade
      FROM public.itens_ata_unidades_copia c
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.adesoes, '[]'::jsonb)) a
     WHERE c.item_key = p_item_key
  )
  SELECT ad.uasg, ad.aprovada_em, ad.quantidade,
         CASE
           WHEN d.decisao = 'MESMO' THEN 'MESMO'
           WHEN d.decisao = 'DIFERENTES' THEN 'CONTA'
           WHEN EXISTS (SELECT 1 FROM public.ata_item_remanejamentos_nao_participante r
                         WHERE r.item_key = p_item_key AND r.uasg_destino = ad.uasg AND r.desfeito_em IS NULL
                           AND NOT (ad.aprovada_em = ANY (r.adesoes_conhecidas))) THEN 'A_CONFERIR'
           ELSE 'CONTA'
         END
    FROM ad
    LEFT JOIN public.ata_item_adesao_conferida d
      ON d.item_key = p_item_key AND d.uasg = ad.uasg AND d.aprovada_em = ad.aprovada_em
   WHERE ad.uasg IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.adesoes_do_item(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adesoes_do_item(VARCHAR) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) v_item_quantitativos_orgaos: definição atual de produção, com o remanejamento a não participante.
--    Participante: cobre primeiro a redução sem destino (np_coberto); o resto ainda está no registrado dele e
--    aguarda a fonte. A cota própria não muda: se a parte coberta era gerenciada pela SENASP, ela continua fora
--    da cota (saida_nao_participante = o gerenciado que deixou de ser gerenciado).
--    SENASP: sai da cota o que o registrado da SENASP ainda não caiu desde o primeiro registro.
--    Colunas novas no fim.
-- ------------------------------------------------------------------------------
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
            r.atualizado_em IS NOT NULL AND r.incluido_em IS NOT NULL AND r.atualizado_em > (r.incluido_em + '1 day'::interval) AND r.atualizado_em < (r.historico_desde AT TIME ZONE 'America/Sao_Paulo'::text) AND COALESCE(g.n, 1::bigint) <= 3 AS mudou_antes_do_historico,
            COALESCE(rm.confirmado, 0::numeric) AS remanejado_confirmado,
            co.quantidade AS continua_do_orgao,
            COALESCE(npr.quantidade, 0::numeric) AS remanejado_np,
            npr.registrado_no_primeiro AS np_registrado_no_primeiro
           FROM orgaos o
             LEFT JOIN reg r ON r.item_key::text = o.item_key::text AND r.uasg::text = o.uasg::text
             LEFT JOIN ata_item_quantidade_assinada q ON q.item_key::text = o.item_key::text AND q.uasg::text = o.uasg::text
             LEFT JOIN grupo g ON g.item_key::text = r.item_key::text AND g.atualizado_em = r.atualizado_em
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
            CASE WHEN c.eh_senasp AND c.ata_da_senasp THEN 0::numeric ELSE LEAST(c.remanejado_np, c.falta - LEAST(c.remanejado_confirmado, c.falta)) END AS np_coberto,
            c.falta - LEAST(c.remanejado_confirmado, c.falta) AS resto0,
            c.falta - LEAST(c.remanejado_confirmado, c.falta) - CASE WHEN c.eh_senasp AND c.ata_da_senasp THEN 0::numeric ELSE LEAST(c.remanejado_np, c.falta - LEAST(c.remanejado_confirmado, c.falta)) END AS resto
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

-- ------------------------------------------------------------------------------
-- 4) v_item_quantitativos: cota própria = registrado da SENASP − gerenciado − saída a não participantes.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_item_quantitativos
WITH (security_invoker = true)
AS
WITH ultimo AS (
         SELECT DISTINCT ON (r.item_key) r.item_key,
            r.documento_sei,
            r.informado_por_nome,
            r.informado_em,
            r.total
           FROM ata_item_assinada_registros r
          ORDER BY r.item_key, r.informado_em DESC
        ), por_item AS (
         SELECT o.item_key,
            sum(o.quantidade_assinada) AS total_assinada,
            sum(COALESCE(o.quantidade_registrada, 0::numeric)) AS total_registrado,
            sum(o.quantidade_assinada) FILTER (WHERE o.eh_senasp) AS assinada_senasp,
            sum(o.gerenciado) AS gerenciado_participantes,
            sum(o.saida_nao_participante) AS saida_nao_participante,
            count(*) FILTER (WHERE o.situacao = 'FORA_DA_ATA'::text) AS orgaos_fora_da_ata,
            count(*) FILTER (WHERE o.situacao = 'REMANEJADO_A_MENOS'::text) AS orgaos_remanejados_a_menos,
            count(*) FILTER (WHERE o.gerenciado > 0::numeric) AS orgaos_gerenciados
           FROM v_item_quantitativos_orgaos o
          GROUP BY o.item_key
        ), itens AS (
         SELECT (((a.numero_ata::text || '-'::text) || a.codigo_uasg::text) || '-'::text) || lpad(i.numero_item::text, 5, '0'::text) AS item_key,
            COALESCE(i.quantidade_homologada, 0::numeric) AS homologado,
            COALESCE(i.quantidade_senasp, i.quantidade_homologada, 0::numeric) AS registrado_senasp
           FROM itens_ata i
             JOIN atas_registro_preco a ON a.id = i.ata_id
          WHERE a.codigo_uasg::text = ANY (ARRAY['200330'::character varying, '200331'::character varying]::text[])
        ), aloc AS (
         SELECT al_1.item_key,
            sum(al_1.allocated_qty) AS alocado
           FROM arp_allocations al_1
          GROUP BY al_1.item_key
        ), contratado AS (
         SELECT c.item_key,
            c.uasg,
            sum(COALESCE(c.quantidade, 0::numeric)) AS quantidade
           FROM participantes_contratos_itens c
          GROUP BY c.item_key, c.uasg
        ), acima_do_registrado AS (
         SELECT o.item_key,
            count(*) AS n
           FROM v_item_quantitativos_orgaos o
             JOIN contratado c ON c.item_key::text = o.item_key::text AND c.uasg::text = o.uasg::text
          WHERE NOT o.eh_senasp AND c.quantidade > COALESCE(o.quantidade_registrada, 0::numeric)
          GROUP BY o.item_key
        )
 SELECT u.item_key,
    u.documento_sei,
    u.informado_por_nome,
    u.informado_em,
    it.homologado,
    COALESCE(p.total_assinada, 0::numeric) AS total_assinada,
    COALESCE(p.total_registrado, 0::numeric) AS total_registrado,
    COALESCE(p.assinada_senasp, 0::numeric) AS assinada_senasp,
    it.registrado_senasp,
    COALESCE(p.gerenciado_participantes, 0::numeric) AS gerenciado_participantes,
    it.registrado_senasp - COALESCE(p.gerenciado_participantes, 0::numeric) - COALESCE(p.saida_nao_participante, 0::numeric) AS cota_propria,
    COALESCE(al.alocado, 0::numeric) AS alocado,
    COALESCE(p.orgaos_fora_da_ata, 0::bigint) AS orgaos_fora_da_ata,
    COALESCE(p.orgaos_remanejados_a_menos, 0::bigint) AS orgaos_remanejados_a_menos,
    COALESCE(p.orgaos_gerenciados, 0::bigint) AS orgaos_gerenciados,
    COALESCE(ar.n, 0::bigint) AS orgaos_contratado_acima,
    COALESCE(p.saida_nao_participante, 0::numeric) AS saida_nao_participante
   FROM ultimo u
     JOIN itens it ON it.item_key = u.item_key::text
     LEFT JOIN por_item p ON p.item_key::text = u.item_key::text
     LEFT JOIN aloc al ON al.item_key::text = u.item_key::text
     LEFT JOIN acima_do_registrado ar ON ar.item_key::text = u.item_key::text;

-- ------------------------------------------------------------------------------
-- 5) v_arp_item_saldo_detalhado: a mesma conta da cota (base do saldo e limite da alocação).
-- ------------------------------------------------------------------------------
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
                    sum(o.saida_nao_participante) AS saida_nao_participante,
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

-- ------------------------------------------------------------------------------
-- 6) Limites de adesão do item: 50% do homologado por órgão e o limite total.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.limites_adesao_do_item(p_item_key VARCHAR)
RETURNS TABLE (homologado NUMERIC, limite_total NUMERIC, por_orgao NUMERIC)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(i.quantidade_homologada, 0),
         COALESCE(NULLIF(i.maximo_adesao, 0),
                  NULLIF((SELECT max(NULLIF(u->>'qtdLimiteAdesao', '')::NUMERIC)
                            FROM public.itens_ata_unidades_copia c
                           CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u
                           WHERE c.item_key = p_item_key AND u->>'tipoUnidade' = 'GERENCIADORA'), 0),
                  2 * COALESCE(i.quantidade_homologada, 0)),
         COALESCE(i.quantidade_homologada, 0) / 2
    FROM public.itens_ata i
    JOIN public.atas_registro_preco a ON a.id = i.ata_id
   WHERE a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item, 5, '0') = p_item_key;
$$;
REVOKE ALL ON FUNCTION public.limites_adesao_do_item(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limites_adesao_do_item(VARCHAR) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7) Registrar, desfazer e conferir
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remanejar_para_nao_participante(
  p_item_key      VARCHAR,
  p_uasg_origem   VARCHAR,
  p_uasg_destino  VARCHAR,
  p_quantidade    NUMERIC,
  p_documento_sei VARCHAR,
  p_justificativa TEXT,
  p_nome_destino  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key    VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_origem VARCHAR(6) := regexp_replace(COALESCE(p_uasg_origem, ''), '\D', '', 'g');
  v_dest   VARCHAR(6) := regexp_replace(COALESCE(p_uasg_destino, ''), '\D', '', 'g');
  v_sei    VARCHAR(8) := regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g');
  v_just   TEXT := btrim(COALESCE(p_justificativa, ''));
  v_nome   TEXT;
  v_org    RECORD;
  v_lim    RECORD;
  v_livre  NUMERIC;
  v_usado_uasg  NUMERIC;
  v_usado_total NUMERIC;
  v_id     UUID;
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de saldo ou o coordenador remaneja quantidades.' USING ERRCODE = '42501';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 OR p_quantidade <> trunc(p_quantidade) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade precisa ser um número inteiro maior que zero.' USING ERRCODE = '22023';
  END IF;
  IF v_sei !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'INVALID_SEI: O documento SEI tem 8 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF length(v_just) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: Escreva a justificativa (15 a 500 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF v_dest !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'INVALID_DESTINATION: A UASG do órgão não participante tem 6 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF v_dest IN ('200330', '200331') OR v_dest = v_origem THEN
    RAISE EXCEPTION 'INVALID_DESTINATION: O destino precisa ser um órgão não participante.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ata_assinada:' || v_key));

  SELECT o.* INTO v_org FROM public.v_item_quantitativos_orgaos o WHERE o.item_key = v_key AND o.uasg = v_origem;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGAO_NAO_ENCONTRADO: A UASG % não está no item % (ou a ata assinada não foi informada).', v_origem, v_key
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_org.ata_da_senasp THEN
    RAISE EXCEPTION 'ATA_DE_OUTRO_ORGAO: Só a gerenciadora remaneja: a ata não é da SENASP.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.v_item_quantitativos_orgaos o WHERE o.item_key = v_key AND o.uasg = v_dest)
     OR EXISTS (SELECT 1 FROM public.itens_ata_unidades_copia c
                 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u
                 WHERE c.item_key = v_key AND regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') = v_dest) THEN
    RAISE EXCEPTION 'DESTINO_PARTICIPANTE: A UASG % é participante do item. Use o remanejamento entre participantes.', v_dest
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(btrim(u.nome), ''), NULLIF(btrim(p_nome_destino), '')) INTO v_nome
    FROM (SELECT 1) x LEFT JOIN public.uasgs_cadastro u ON u.codigo_uasg = v_dest AND u.encontrada;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'INVALID_DESTINATION: Informe o nome do órgão não participante.' USING ERRCODE = '22023';
  END IF;

  -- Livre na origem.
  IF v_org.eh_senasp THEN
    SELECT s.quantidade_base_senasp - COALESCE((SELECT sum(a.allocated_qty) FROM public.arp_allocations a WHERE a.item_key = v_key), 0)
      INTO v_livre FROM public.v_arp_item_saldo_detalhado s WHERE s.item_key = v_key;
    v_livre := GREATEST(COALESCE(v_livre, 0), 0);
    IF p_quantidade > v_livre THEN
      RAISE EXCEPTION 'ACIMA_DO_LIVRE: A cota própria tem % livre (cota menos o alocado às unidades). Para ceder mais, diminua antes a alocação.', trim_scale(v_livre)
        USING ERRCODE = '22023';
    END IF;
  ELSE
    v_livre := GREATEST(COALESCE(v_org.quantidade_registrada, 0) - v_org.nao_participante_aguarda_fonte + v_org.resto
                        - COALESCE((SELECT sum(COALESCE(c.quantidade, 0)) FROM public.participantes_contratos_itens c
                                     WHERE c.item_key = v_key AND c.uasg = v_origem), 0), 0);
    IF p_quantidade > v_livre THEN
      RAISE EXCEPTION 'ACIMA_DO_LIVRE: O órgão tem % para ceder (registrado e redução sem destino, menos o contratado e o já remanejado).', trim_scale(v_livre)
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Limites da adesão.
  SELECT * INTO v_lim FROM public.limites_adesao_do_item(v_key);
  IF NOT FOUND OR v_lim.homologado <= 0 THEN
    RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO: Item % sem homologado.', v_key USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(sum(a.quantidade) FILTER (WHERE a.situacao = 'CONTA' AND a.uasg = v_dest), 0),
         COALESCE(sum(a.quantidade) FILTER (WHERE a.situacao = 'CONTA'), 0)
    INTO v_usado_uasg, v_usado_total FROM public.adesoes_do_item(v_key) a;
  SELECT v_usado_uasg + COALESCE(sum(r.quantidade) FILTER (WHERE r.uasg_destino = v_dest), 0),
         v_usado_total + COALESCE(sum(r.quantidade), 0)
    INTO v_usado_uasg, v_usado_total
    FROM public.ata_item_remanejamentos_nao_participante r WHERE r.item_key = v_key AND r.desfeito_em IS NULL;
  IF v_usado_uasg + p_quantidade > v_lim.por_orgao THEN
    RAISE EXCEPTION 'ACIMA_DE_50: Passa de 50%% do item para esta UASG (máximo %, já tem %).', trim_scale(v_lim.por_orgao), trim_scale(v_usado_uasg)
      USING ERRCODE = '22023';
  END IF;
  IF v_usado_total + p_quantidade > v_lim.limite_total THEN
    RAISE EXCEPTION 'ACIMA_DO_LIMITE_DE_ADESAO: Passa do limite de adesão do item (limite %, já usado %).', trim_scale(v_lim.limite_total), trim_scale(v_usado_total)
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_item_remanejamentos_nao_participante
    (item_key, uasg_origem, uasg_destino, nome_destino, quantidade, documento_sei, justificativa, registrado_origem,
     adesoes_conhecidas, registrado_por_user_id, registrado_por_nome)
  VALUES (v_key, v_origem, v_dest, left(v_nome, 200), p_quantidade, v_sei, v_just, v_org.quantidade_registrada,
          COALESCE((SELECT array_agg(a.aprovada_em) FROM public.adesoes_do_item(v_key) a WHERE a.uasg = v_dest), '{}'),
          auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'item_key', v_key, 'uasg_origem', v_origem, 'uasg_destino', v_dest, 'quantidade', p_quantidade);
END;
$$;

CREATE OR REPLACE FUNCTION public.desfazer_remanejamento_nao_participante(p_id UUID, p_justificativa TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_rem  RECORD;
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de saldo ou o coordenador desfaz remanejamentos.' USING ERRCODE = '42501';
  END IF;
  IF length(v_just) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: Escreva a justificativa (15 a 500 caracteres).' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_rem FROM public.ata_item_remanejamentos_nao_participante WHERE id = p_id;
  IF NOT FOUND OR v_rem.desfeito_em IS NOT NULL THEN
    RAISE EXCEPTION 'NADA_A_DESFAZER: Este remanejamento não existe ou já foi desfeito.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ata_assinada:' || v_rem.item_key));
  -- As decisões sobre adesões ligadas a ele perdem o sentido: a adesão volta a contar.
  DELETE FROM public.ata_item_adesao_conferida WHERE remanejamento_id = p_id;
  UPDATE public.ata_item_remanejamentos_nao_participante
     SET desfeito_em = NOW(), desfeito_por_nome = COALESCE(public.nome_do_usuario_logado(), 'Usuário'), desfeito_justificativa = v_just
   WHERE id = p_id AND desfeito_em IS NULL;
  RETURN jsonb_build_object('id', p_id, 'item_key', v_rem.item_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.decidir_adesao_do_remanejamento(
  p_item_key    VARCHAR,
  p_uasg        VARCHAR,
  p_aprovada_em VARCHAR,
  p_decisao     VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key   VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_uasg  VARCHAR(6) := regexp_replace(COALESCE(p_uasg, ''), '\D', '', 'g');
  v_data  VARCHAR(19) := left(btrim(COALESCE(p_aprovada_em, '')), 19);
  v_dec   VARCHAR(10) := upper(btrim(COALESCE(p_decisao, '')));
  v_rem   UUID;
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de saldo ou o coordenador confere adesões.' USING ERRCODE = '42501';
  END IF;
  IF v_dec NOT IN ('MESMO', 'DIFERENTES') THEN
    RAISE EXCEPTION 'INVALID_DECISION: A decisão é MESMO ou DIFERENTES.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ata_assinada:' || v_key));
  IF NOT EXISTS (SELECT 1 FROM public.adesoes_do_item(v_key) a WHERE a.uasg = v_uasg AND a.aprovada_em = v_data) THEN
    RAISE EXCEPTION 'ADESAO_NAO_ENCONTRADA: Não há adesão da UASG % aprovada em % neste item.', v_uasg, v_data USING ERRCODE = 'P0002';
  END IF;
  SELECT r.id INTO v_rem FROM public.ata_item_remanejamentos_nao_participante r
   WHERE r.item_key = v_key AND r.uasg_destino = v_uasg AND r.desfeito_em IS NULL AND NOT (v_data = ANY (r.adesoes_conhecidas))
   ORDER BY r.registrado_em DESC LIMIT 1;
  IF v_rem IS NULL THEN
    RAISE EXCEPTION 'NADA_A_CONFERIR: Esta adesão não está ligada a um remanejamento para não participante.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ata_item_adesao_conferida (item_key, uasg, aprovada_em, remanejamento_id, decisao, decidido_por_user_id, decidido_por_nome)
  VALUES (v_key, v_uasg, v_data, v_rem, v_dec, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'))
  ON CONFLICT (item_key, uasg, aprovada_em) DO UPDATE
    SET remanejamento_id = EXCLUDED.remanejamento_id, decisao = EXCLUDED.decisao,
        decidido_por_user_id = EXCLUDED.decidido_por_user_id, decidido_por_nome = EXCLUDED.decidido_por_nome, decidido_em = NOW();
  RETURN jsonb_build_object('item_key', v_key, 'uasg', v_uasg, 'aprovada_em', v_data, 'decisao', v_dec);
END;
$$;

REVOKE ALL ON FUNCTION public.remanejar_para_nao_participante(VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desfazer_remanejamento_nao_participante(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decidir_adesao_do_remanejamento(VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remanejar_para_nao_participante(VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.desfazer_remanejamento_nao_participante(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decidir_adesao_do_remanejamento(VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;
