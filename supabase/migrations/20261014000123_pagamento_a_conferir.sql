-- ==============================================================================
-- MIGRATION 123: PAGAMENTO SÓ CONFIRMADO POR OB DA FATURA; O RESTO FICA A CONFERIR
-- Versão: 20261014000123_pagamento_a_conferir.sql
--
-- Contexto (conferência de 14/10/2026): a fatura era "paga" quando havia OB válida com o mesmo número de NP na UG
-- da fatura. Mas o número de NP que o Contratos.gov.br informa muitas vezes aponta, nessa UG, para outro documento.
-- Exemplos: 25 faturas da HPE (00028/2026, R$ 7,1 mi) "pagas" pela 2026NP000204, cuja única OB é de R$ 247,32 ao
-- Banco do Brasil (taxas de licenciamento); 262 faturas do 00269/2025 (R$ 75,7 mi) "pagas" pela 2026NP000297, cuja
-- única OB é de R$ 544,00 (taxas). Medição: 1.884 faturas (R$ 422 mi, 161 contratos) nessa situação; numa amostra
-- das maiores NPs, 414 de 1.451 faturas têm a OB verdadeira na outra UG, citando o número delas.
--
-- Regra nova: uma OB válida da NP confirma o pagamento da fatura quando
--   a) a observação da OB cita o número da fatura (qualquer das duas UGs, como na migration 119); ou
--   b) a OB é da UG da fatura e
--      - o favorecido tem a mesma raiz de CNPJ (ou o mesmo CPF) do fornecedor do contrato; ou
--      - o contrato não tem documento do fornecedor no banco (regra antiga); ou
--      - o favorecido é intermediário (Banco do Brasil, Caixa ou "credor sem cadastro", como em carta de crédito)
--        e as OBs válidas da NP nessa UG somam ao menos a metade das faturas da NP.
-- OB da UG da fatura fora dessa regra não confirma: a fatura fica "pagamento a conferir" (não paga, fora de
-- "aguardando OB"), com a OB e o favorecido para conferência. Situação "Pago" do Contratos.gov.br segue valendo.
--
-- Por que uma tabela: a regra usa expressão regular por par fatura × OB. Calculada a cada leitura, a view passava
-- de ~0,1 s para 1,6 s por página. O resultado fica em fatura_pagamento, recalculado ao fim de cada sincronização
-- de faturas e de OBs (função sincronizar-fontes) e pelo pg_cron aos minutos 28 e 58, antes da conciliação dos
-- ciclos (29 e 59). A view só lê o resultado.
--
-- O que entra
-- 1) raiz_documento(texto); ob_cita_fatura com descarte rápido por texto (mesmo resultado da migration 120).
-- 2) fatura_pagamento (OBs que confirmam a fatura e OBs a conferir) e recalcular_pagamento_faturas().
-- 3) v_contrato_faturas lê fatura_pagamento; colunas novas no fim: obs_a_conferir e pagamento_a_conferir. As
--    demais colunas mantêm nome, tipo e ordem.
-- 4) v_contrato_faturas_resumo: liquidadas_sem_pagamento deixa de contar as "a conferir"; coluna nova no fim,
--    pagamentos_a_conferir. Valor pago passa a somar só as confirmadas.
-- 5) Agendamento e cálculo inicial.
--
-- Efeitos: a conciliação dos ciclos, o pago dos empenhos, o histórico de pagamentos e a previsão leem "paga" e
-- passam a usar só o pagamento confirmado.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Funções de apoio
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.raiz_documento(p_documento TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN length(d) = 14 THEN left(d, 8)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g') AS d) x
$$;

COMMENT ON FUNCTION public.raiz_documento(TEXT) IS
  'Só os dígitos do CNPJ/CPF; CNPJ vira a raiz (8 dígitos), para comparar matriz e filial. Vazio vira NULL.';

GRANT EXECUTE ON FUNCTION public.raiz_documento(TEXT) TO authenticated, service_role;

-- Mesma regra da migration 120, com descarte rápido: se o número (sem os zeros à esquerda, quando só de dígitos)
-- nem aparece no texto, a expressão regular não teria como casar.
CREATE OR REPLACE FUNCTION public.ob_cita_fatura(p_observacao TEXT, p_numero TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  WITH n AS (
    SELECT upper(btrim(p_numero)) AS bruto,
           upper(btrim(p_numero)) ~ '^[0-9]+$' AS so_digitos,
           upper(p_observacao) AS texto
  ), alvo AS (
    SELECT so_digitos, texto,
           CASE WHEN so_digitos THEN regexp_replace(bruto, '^0+', '') ELSE bruto END AS numero
      FROM n
  )
  SELECT CASE
    WHEN p_observacao IS NULL OR p_numero IS NULL OR length(alvo.numero) < 4 THEN FALSE
    WHEN strpos(alvo.texto, alvo.numero) = 0 THEN FALSE
    ELSE alvo.texto ~ (
      '(^|[[:space:],;:])'
      || CASE WHEN alvo.so_digitos THEN '0*' ELSE '' END
      || regexp_replace(alvo.numero, '([^[:alnum:]])', '\\\1', 'g')
      || '($|[[:space:],;:]|\.([[:space:]]|$))'
    )
  END
  FROM alvo
$$;

-- ------------------------------------------------------------------------------
-- 2) Resultado guardado e recálculo
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fatura_pagamento (
  id_fatura        BIGINT PRIMARY KEY REFERENCES public.contrato_faturas(id_fatura) ON DELETE CASCADE,
  ordens_bancarias TEXT,          -- OBs que confirmam o pagamento da fatura
  ob_emissao       DATE,
  ob_valor         NUMERIC,        -- sem precisão fixa: mesmo tipo que a view sempre teve
  obs_a_conferir   TEXT,          -- OBs da NP na UG da fatura que não confirmam, com o favorecido
  calculado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.fatura_pagamento IS
  'OBs que confirmam o pagamento de cada fatura e OBs a conferir (regra da migration 123). Escrita só por recalcular_pagamento_faturas().';

ALTER TABLE public.fatura_pagamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: fatura_pagamento" ON public.fatura_pagamento;
CREATE POLICY "Authenticated Read: fatura_pagamento" ON public.fatura_pagamento FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fatura_pagamento FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fatura_pagamento TO authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_pagamento_faturas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_faturas INTEGER;
  v_alteradas INTEGER;
  v_removidas INTEGER;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor') OR public.has_role('admin') OR session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito.' USING ERRCODE = '42501';
  END IF;
  -- um recálculo por vez (as duas UGs e o pg_cron podem chamar juntos)
  PERFORM pg_advisory_xact_lock(hashtext('recalcular_pagamento_faturas'));

  WITH np_valores AS (
    -- quanto as faturas da NP somam e quanto as OBs válidas da NP na mesma UG pagaram
    SELECT fx.ug_np, fx.np, SUM(fx.valor_liquido) AS faturas,
           (SELECT COALESCE(SUM(o.valor), 0) FROM public.ordens_bancarias o
             WHERE o.ug = fx.ug_np AND o.np = fx.np AND NOT o.cancelada) AS obs
      FROM public.contrato_faturas fx
     WHERE fx.np IS NOT NULL AND NOT fx.cancelada
     GROUP BY fx.ug_np, fx.np
  ),
  fornecedor AS (
    SELECT DISTINCT ON (contract_key) contract_key, raiz
      FROM (SELECT contract_key, public.raiz_documento(fornecedor_cnpj_cpf) AS raiz FROM public.contratos_oficiais) c
     WHERE raiz IS NOT NULL
     ORDER BY contract_key
  ),
  calc AS (
    SELECT f.id_fatura, ob.obs, ob.ob_emissao, ob.ob_valor, ob.obs_a_conferir
      FROM public.contrato_faturas f
      LEFT JOIN fornecedor forn ON forn.contract_key = f.contract_key
      LEFT JOIN np_valores npv ON npv.ug_np = f.ug_np AND npv.np = f.np
      CROSS JOIN LATERAL (
        SELECT string_agg(x.numero, ', ' ORDER BY x.emissao, x.numero) FILTER (WHERE x.aceita) AS obs,
               MAX(x.emissao) FILTER (WHERE x.aceita) AS ob_emissao,
               SUM(x.valor) FILTER (WHERE x.aceita) AS ob_valor,
               string_agg(x.numero || ' (' || COALESCE(x.favorecido_nome, 'favorecido não informado') || ')', ', '
                          ORDER BY x.emissao, x.numero) FILTER (WHERE NOT x.aceita) AS obs_a_conferir
          FROM (
            SELECT o.numero, o.emissao, o.valor, o.favorecido_nome,
                   -- a citação (expressão regular) só é avaliada quando o favorecido não confirma sozinho
                   CASE
                     WHEN o.ug = f.ug_np
                      AND (
                        forn.raiz IS NULL
                        OR public.raiz_documento(o.favorecido_documento) = forn.raiz
                        OR (
                          (o.favorecido_nome ~* '^(BANCO DO BRASIL|CAIXA ECONOMICA FEDERAL|CREDOR SEM CADASTRO)'
                           OR public.raiz_documento(o.favorecido_documento) IN ('00000000', '00360305'))
                          AND COALESCE(npv.obs, 0) >= 0.5 * COALESCE(npv.faturas, 0)
                        )
                      ) THEN TRUE
                     ELSE public.ob_cita_fatura(o.observacao, f.numero)
                   END AS aceita
              FROM public.ordens_bancarias o
             WHERE NOT o.cancelada
               AND o.np = f.np
               AND (o.ug = f.ug_np OR public.ob_cita_fatura(o.observacao, f.numero))
          ) x
      ) ob
     WHERE f.np IS NOT NULL AND (ob.obs IS NOT NULL OR ob.obs_a_conferir IS NOT NULL)
  ),
  removidas AS (
    DELETE FROM public.fatura_pagamento fp
     WHERE NOT EXISTS (SELECT 1 FROM calc c WHERE c.id_fatura = fp.id_fatura)
    RETURNING 1
  ),
  alteradas AS (
    INSERT INTO public.fatura_pagamento AS fp (id_fatura, ordens_bancarias, ob_emissao, ob_valor, obs_a_conferir, calculado_em)
    SELECT id_fatura, obs, ob_emissao, ob_valor, obs_a_conferir, NOW() FROM calc
    ON CONFLICT (id_fatura) DO UPDATE SET
      ordens_bancarias = EXCLUDED.ordens_bancarias, ob_emissao = EXCLUDED.ob_emissao, ob_valor = EXCLUDED.ob_valor,
      obs_a_conferir = EXCLUDED.obs_a_conferir, calculado_em = NOW()
    WHERE (fp.ordens_bancarias, fp.ob_emissao, fp.ob_valor, fp.obs_a_conferir)
          IS DISTINCT FROM (EXCLUDED.ordens_bancarias, EXCLUDED.ob_emissao, EXCLUDED.ob_valor, EXCLUDED.obs_a_conferir)
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM calc), (SELECT COUNT(*) FROM alteradas), (SELECT COUNT(*) FROM removidas)
    INTO v_faturas, v_alteradas, v_removidas;

  RETURN jsonb_build_object('faturas_com_ob', v_faturas, 'alteradas', v_alteradas, 'removidas', v_removidas);
END;
$$;

COMMENT ON FUNCTION public.recalcular_pagamento_faturas() IS
  'Recalcula fatura_pagamento pela regra da migration 123. Chamada ao fim das sincronizações de faturas e OBs e pelo pg_cron (28 e 58).';

REVOKE ALL ON FUNCTION public.recalcular_pagamento_faturas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalcular_pagamento_faturas() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) View das faturas
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_contrato_faturas
WITH (security_invoker = true)
AS
WITH np_contratos AS (
  SELECT ug_np, np, COUNT(DISTINCT contract_key) AS contratos
    FROM public.contrato_faturas
   WHERE np IS NOT NULL
   GROUP BY ug_np, np
),
nes AS (
  SELECT fe.id_fatura,
         string_agg(COALESCE(fe.numero_empenho, fe.id_empenho_gov), ', ' ORDER BY fe.numero_empenho) AS empenhos,
         COUNT(*) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
               FROM public.empenhos e
               JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
              WHERE e.identificador_fonte = fe.id_empenho_gov
                AND ce.contract_key = f.contract_key
           )
         ) AS empenhos_sem_vinculo,
         string_agg(fe.numero_empenho, ', ' ORDER BY fe.numero_empenho) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
               FROM public.empenhos e
               JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
              WHERE e.identificador_fonte = fe.id_empenho_gov
                AND ce.contract_key = f.contract_key
           )
         ) AS empenhos_sem_vinculo_numeros
    FROM public.fatura_empenhos fe
    JOIN public.contrato_faturas f ON f.id_fatura = fe.id_fatura
   GROUP BY fe.id_fatura
)
SELECT
  f.id_fatura,
  f.contract_key,
  f.numero,
  f.tipo,
  f.emissao,
  f.vencimento,
  f.valor,
  f.glosa,
  f.valor_liquido,
  f.data_liquidacao,
  f.situacao,
  f.cancelada,
  f.np,
  f.ug_np,
  f.referencia,
  fp.ordens_bancarias,
  fp.ob_emissao,
  fp.ob_valor,
  (NOT f.cancelada AND (fp.ordens_bancarias IS NOT NULL OR f.situacao = 'Pago')) AS paga,
  COALESCE(npc.contratos, 0) AS np_contratos,
  n.empenhos,
  COALESCE(n.empenhos_sem_vinculo, 0) AS empenhos_sem_vinculo,
  n.empenhos_sem_vinculo_numeros,
  f.sincronizado_em,
  fp.obs_a_conferir,
  (NOT f.cancelada AND fp.ordens_bancarias IS NULL AND f.situacao IS DISTINCT FROM 'Pago' AND fp.obs_a_conferir IS NOT NULL) AS pagamento_a_conferir
FROM public.contrato_faturas f
LEFT JOIN public.fatura_pagamento fp ON fp.id_fatura = f.id_fatura
LEFT JOIN np_contratos npc ON npc.ug_np = f.ug_np AND npc.np = f.np
LEFT JOIN nes n ON n.id_fatura = f.id_fatura;

COMMENT ON VIEW public.v_contrato_faturas IS
  'Faturas dos contratos. Paga: OB que confirma a fatura (fatura_pagamento, regra da migration 123) ou situação "Pago". OB da NP na UG da fatura que não confirma fica em obs_a_conferir (pagamento_a_conferir). Também NP compartilhada entre contratos e NEs citadas sem vínculo.';

-- ------------------------------------------------------------------------------
-- 4) Resumo por contrato
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_contrato_faturas_resumo
WITH (security_invoker = true)
AS
SELECT
  contract_key,
  COUNT(*) FILTER (WHERE NOT cancelada) AS faturas,
  COALESCE(SUM(valor) FILTER (WHERE NOT cancelada), 0) AS valor_faturado,
  COALESCE(SUM(valor) FILTER (WHERE NOT cancelada AND data_liquidacao IS NOT NULL), 0) AS valor_liquidado,
  COALESCE(SUM(valor) FILTER (WHERE paga), 0) AS valor_pago,
  COUNT(*) FILTER (WHERE NOT cancelada AND data_liquidacao IS NOT NULL AND NOT paga AND np IS NOT NULL AND NOT pagamento_a_conferir) AS liquidadas_sem_pagamento,
  COUNT(*) FILTER (WHERE empenhos_sem_vinculo > 0) AS faturas_com_ne_sem_vinculo,
  MAX(data_liquidacao) AS ultima_liquidacao,
  MAX(ob_emissao) AS ultimo_pagamento,
  COUNT(*) FILTER (WHERE NOT cancelada AND data_liquidacao IS NOT NULL AND NOT paga AND np IS NULL) AS liquidadas_sem_np,
  COUNT(*) FILTER (WHERE pagamento_a_conferir) AS pagamentos_a_conferir
FROM public.v_contrato_faturas
GROUP BY contract_key;

COMMENT ON VIEW public.v_contrato_faturas_resumo IS
  'Resumo por contrato: faturado, liquidado e pago (só pagamento confirmado; soma das faturas, nunca o valor da OB); liquidadas aguardando OB (com NP, sem OB), liquidadas sem NP e pagamentos a conferir (OB da NP é de outra despesa).';

GRANT SELECT ON public.v_contrato_faturas, public.v_contrato_faturas_resumo TO authenticated;

-- ------------------------------------------------------------------------------
-- 5) Agendamento (antes da conciliação, aos 29 e 59) e cálculo inicial
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recalcular-pagamento-faturas';
    PERFORM cron.schedule('recalcular-pagamento-faturas', '28,58 * * * *', 'SELECT public.recalcular_pagamento_faturas()');
  END IF;
END;
$$;

SELECT public.recalcular_pagamento_faturas();
ANALYZE public.fatura_pagamento;
