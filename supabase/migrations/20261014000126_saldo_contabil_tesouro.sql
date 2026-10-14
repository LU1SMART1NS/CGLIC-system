-- ==============================================================================
-- MIGRATION 126: SALDO CONTÁBIL DO TESOURO POR EMPENHO (FASE 1 DO ESTUDO)
-- Versão: 20261014000126_saldo_contabil_tesouro.sql
--
-- Contexto: estudo docs/estudos/saldo-contabil-tesouro.md (14/10/2026). A API aberta do Tesouro (STA) publica,
-- uma vez por dia, o saldo contábil do SIAFI por conta corrente (nota de empenho + subitem). Com ele dá para saber,
-- por empenho, quanto está a liquidar, liquidado a pagar e pago, no exercício e em restos a pagar. Esta fase só
-- guarda e expõe o dado; nenhuma tela muda.
--
-- O que entra
-- 1) empenho_saldo_contabil: uma linha por UG × ano × conta × conta corrente, como vem do Tesouro.
-- 2) saldo_contabil_cargas: quando cada UG × ano × conta foi lido e quantas linhas trouxe. Serve para a
--    sincronização ler os anos passados uma vez só (o ano fechado não muda).
-- 3) gravar_saldo_contabil(ug, ano, conta, linhas): só o servidor. Substitui o conjunto daquela UG × ano × conta;
--    lista vazia não apaga o que já existe (a fonte fora do ar não pode zerar o saldo).
-- 4) v_empenho_saldo_contabil: por UG × empenho, o pago total (soma das contas de pago de todos os anos) e, no ano
--    mais recente lido, a liquidar, liquidado a pagar e restos a pagar; com o empenho do sistema, quando existe.
-- 5) Agendamento: recurso 'saldo_contabil' de 6 em 6 horas por UG (o Tesouro atualiza uma vez por dia).
--
-- Contas (plano de contas da União):
--   622920101 a liquidar · 622920102 em liquidação · 622920103 liquidado a pagar · 622920104 pago (exercício)
--   631100000 a liquidar · 631200000 em liquidação · 631300000 liquidado a pagar · 631400000 pago (RP não processados)
--   632100000 a pagar · 632200000 pago (RP processados)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) e 2) Tabelas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empenho_saldo_contabil (
  ug                  VARCHAR(6)  NOT NULL,
  ano                 SMALLINT    NOT NULL,          -- ano do saldo (não o do empenho)
  conta               VARCHAR(9)  NOT NULL,
  conta_corrente      VARCHAR(20) NOT NULL,          -- ex.: 2025NE00047152 = 2025NE000471, subitem 52
  numero_empenho      VARCHAR(12) GENERATED ALWAYS AS (left(conta_corrente, 12)) STORED,
  subitem             VARCHAR(2)  GENERATED ALWAYS AS (substr(conta_corrente, 13, 2)) STORED,
  saldo               NUMERIC(18, 2) NOT NULL DEFAULT 0,
  debito_mensal       NUMERIC(18, 2) NOT NULL DEFAULT 0,
  credito_mensal      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  atualizado_tesouro  TIMESTAMP,                     -- created_at do Tesouro (horário de Brasília, sem fuso)
  sincronizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ug, ano, conta, conta_corrente),
  CONSTRAINT empenho_saldo_contabil_ug_formato CHECK (ug ~ '^[0-9]{6}$'),
  CONSTRAINT empenho_saldo_contabil_conta_formato CHECK (conta ~ '^[0-9]{9}$'),
  CONSTRAINT empenho_saldo_contabil_cc_formato CHECK (conta_corrente ~ '^[0-9]{4}NE[0-9]{8}$')
);
CREATE INDEX IF NOT EXISTS empenho_saldo_contabil_ne_idx ON public.empenho_saldo_contabil (ug, numero_empenho);

COMMENT ON TABLE public.empenho_saldo_contabil IS
  'Saldo contábil do SIAFI por conta corrente (empenho + subitem), lido da API aberta do Tesouro (STA). Escrita só por gravar_saldo_contabil (servidor).';

CREATE TABLE IF NOT EXISTS public.saldo_contabil_cargas (
  ug            VARCHAR(6)  NOT NULL,
  ano           SMALLINT    NOT NULL,
  conta         VARCHAR(9)  NOT NULL,
  linhas        INTEGER     NOT NULL DEFAULT 0,
  carregado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ug, ano, conta)
);

COMMENT ON TABLE public.saldo_contabil_cargas IS
  'Última leitura de cada UG × ano × conta do saldo contábil do Tesouro, para ler os anos fechados uma vez só.';

DO $$
DECLARE v_tabela TEXT;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['empenho_saldo_contabil', 'saldo_contabil_cargas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leitura para logados: ' || v_tabela, v_tabela);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'Leitura para logados: ' || v_tabela, v_tabela);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', v_tabela);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', v_tabela);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_tabela);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_tabela);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3) Gravação (só o servidor)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_saldo_contabil(p_ug TEXT, p_ano INTEGER, p_conta TEXT, p_linhas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ug TEXT := btrim(COALESCE(p_ug, ''));
  v_conta TEXT := btrim(COALESCE(p_conta, ''));
  v_recebidas INTEGER;
  v_gravadas INTEGER := 0;
  v_removidas INTEGER := 0;
  v_existentes INTEGER;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava o saldo contábil.' USING ERRCODE = '42501';
  END IF;
  IF v_ug !~ '^[0-9]{6}$' OR v_conta !~ '^[0-9]{9}$' OR p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UG, ano ou conta fora do formato (UG %, ano %, conta %).', v_ug, p_ano, v_conta USING ERRCODE = '22023';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Envie uma lista de linhas.' USING ERRCODE = '22023';
  END IF;

  v_recebidas := jsonb_array_length(p_linhas);
  SELECT COUNT(*) INTO v_existentes FROM public.empenho_saldo_contabil WHERE ug = v_ug AND ano = p_ano AND conta = v_conta;

  -- Lista vazia não apaga o que existe: a fonte fora do ar não pode zerar o saldo.
  IF v_recebidas = 0 AND v_existentes > 0 THEN
    RETURN jsonb_build_object('gravadas', 0, 'removidas', 0, 'bloqueada', true);
  END IF;

  WITH linhas AS (
    SELECT DISTINCT ON (x->>'conta_corrente')
           x->>'conta_corrente' AS conta_corrente,
           COALESCE(NULLIF(x->>'saldo', '')::NUMERIC, 0) AS saldo,
           COALESCE(NULLIF(x->>'debito_mensal', '')::NUMERIC, 0) AS debito_mensal,
           COALESCE(NULLIF(x->>'credito_mensal', '')::NUMERIC, 0) AS credito_mensal,
           NULLIF(x->>'atualizado_tesouro', '')::TIMESTAMP AS atualizado_tesouro
      FROM jsonb_array_elements(p_linhas) x
     WHERE x->>'conta_corrente' ~ '^[0-9]{4}NE[0-9]{8}$'
  ), removidas AS (
    DELETE FROM public.empenho_saldo_contabil s
     WHERE s.ug = v_ug AND s.ano = p_ano AND s.conta = v_conta
       AND NOT EXISTS (SELECT 1 FROM linhas l WHERE l.conta_corrente = s.conta_corrente)
    RETURNING 1
  ), gravadas AS (
    INSERT INTO public.empenho_saldo_contabil AS s (ug, ano, conta, conta_corrente, saldo, debito_mensal, credito_mensal, atualizado_tesouro, sincronizado_em)
    SELECT v_ug, p_ano, v_conta, conta_corrente, saldo, debito_mensal, credito_mensal, atualizado_tesouro, NOW() FROM linhas
    ON CONFLICT (ug, ano, conta, conta_corrente) DO UPDATE SET
      saldo = EXCLUDED.saldo, debito_mensal = EXCLUDED.debito_mensal, credito_mensal = EXCLUDED.credito_mensal,
      atualizado_tesouro = EXCLUDED.atualizado_tesouro, sincronizado_em = NOW()
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM gravadas), (SELECT COUNT(*) FROM removidas) INTO v_gravadas, v_removidas;

  INSERT INTO public.saldo_contabil_cargas AS c (ug, ano, conta, linhas, carregado_em)
  VALUES (v_ug, p_ano, v_conta, v_gravadas, NOW())
  ON CONFLICT (ug, ano, conta) DO UPDATE SET linhas = EXCLUDED.linhas, carregado_em = NOW();

  RETURN jsonb_build_object('gravadas', v_gravadas, 'removidas', v_removidas, 'bloqueada', false);
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_saldo_contabil(TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_saldo_contabil(TEXT, INTEGER, TEXT, JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 4) Por empenho
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_empenho_saldo_contabil
WITH (security_invoker = true)
AS
WITH ano_atual AS (
  SELECT ug, MAX(ano) AS ano FROM public.empenho_saldo_contabil GROUP BY ug
), por_ne AS (
  SELECT s.ug, s.numero_empenho,
         SUM(s.saldo) FILTER (WHERE s.conta IN ('622920104', '631400000', '632200000')) AS pago_total,
         SUM(s.saldo) FILTER (WHERE s.ano = a.ano AND s.conta IN ('622920104', '631400000', '632200000')) AS pago_no_ano,
         SUM(s.saldo) FILTER (WHERE s.ano = a.ano AND s.conta IN ('622920101', '622920102')) AS exercicio_a_liquidar,
         SUM(s.saldo) FILTER (WHERE s.ano = a.ano AND s.conta = '622920103') AS exercicio_liquidado_a_pagar,
         SUM(s.saldo) FILTER (WHERE s.ano = a.ano AND s.conta IN ('631100000', '631200000')) AS rp_a_liquidar,
         SUM(s.saldo) FILTER (WHERE s.ano = a.ano AND s.conta IN ('631300000', '632100000')) AS rp_liquidado_a_pagar,
         a.ano AS ano_do_saldo,
         MAX(s.atualizado_tesouro) FILTER (WHERE s.ano = a.ano) AS atualizado_tesouro,
         MAX(s.sincronizado_em) AS sincronizado_em
    FROM public.empenho_saldo_contabil s
    JOIN ano_atual a ON a.ug = s.ug
   GROUP BY s.ug, s.numero_empenho, a.ano
)
SELECT
  p.ug,
  p.numero_empenho,
  e.id AS empenho_id,
  COALESCE(p.pago_total, 0) AS pago_total,
  COALESCE(p.pago_no_ano, 0) AS pago_no_ano,
  COALESCE(p.exercicio_a_liquidar, 0) AS exercicio_a_liquidar,
  COALESCE(p.exercicio_liquidado_a_pagar, 0) AS exercicio_liquidado_a_pagar,
  COALESCE(p.rp_a_liquidar, 0) AS rp_a_liquidar,
  COALESCE(p.rp_liquidado_a_pagar, 0) AS rp_liquidado_a_pagar,
  p.ano_do_saldo,
  p.atualizado_tesouro,
  p.sincronizado_em
FROM por_ne p
LEFT JOIN public.empenhos e
  ON e.uasg_emitente = p.ug AND upper(split_part(btrim(e.numero_oficial), ' ', 1)) = p.numero_empenho;

COMMENT ON VIEW public.v_empenho_saldo_contabil IS
  'Por UG e empenho, pelo saldo contábil do Tesouro: pago total (todos os anos), pago no ano e, no ano mais recente lido, a liquidar, liquidado a pagar e restos a pagar. empenho_id quando o empenho está no sistema.';

REVOKE ALL ON public.v_empenho_saldo_contabil FROM PUBLIC, anon;
GRANT SELECT ON public.v_empenho_saldo_contabil TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5) Agendamento: de 6 em 6 horas por UG (validade de 5 horas na sincronização)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('sincronizar-saldo-contabil-200330', 'sincronizar-saldo-contabil-200331');
    PERFORM cron.schedule('sincronizar-saldo-contabil-200330', '12 */6 * * *', $c$SELECT public.disparar_sincronizacao('saldo_contabil', '200330')$c$);
    PERFORM cron.schedule('sincronizar-saldo-contabil-200331', '27 */6 * * *', $c$SELECT public.disparar_sincronizacao('saldo_contabil', '200331')$c$);
  END IF;
END;
$$;
