-- ==============================================================================
-- MIGRATION 135: RESTOS A PAGAR PROCESSADOS E NÃO PROCESSADOS NA VIEW DO TESOURO (FASE 4 DO ESTUDO)
-- Versão: 20261014000135_restos_a_pagar_tesouro.sql
--
-- Contexto: estudo docs/estudos/saldo-contabil-tesouro.md, fase 4 (restos a pagar). v_empenho_saldo_contabil
-- (migration 128) já tinha rp_a_liquidar e rp_liquidado_a_pagar, mas o liquidado a pagar juntava os restos a pagar
-- não processados (conta 631300000) e os processados (632100000), e o pago do ano juntava o exercício e os restos.
--
-- O que muda: três colunas novas no fim da view, todas do ano mais recente lido:
--   rpnp_liquidado_a_pagar  restos a pagar não processados, liquidados a pagar (631300000);
--   rpp_a_pagar             restos a pagar processados, a pagar (632100000);
--   rp_pago_no_ano          restos a pagar pagos no ano (631400000 + 632200000).
-- Os não processados a liquidar seguem em rp_a_liquidar. As demais colunas mantêm nome, tipo e ordem.
-- Medição de 14/10/2026 nos empenhos dos contratos: não processados em 640 empenhos (R$ 339,6 mi a liquidar,
-- R$ 173,9 mi liquidados a pagar, R$ 299,4 mi pagos no ano); processados em 12 (R$ 0,9 mi a pagar, R$ 10,8 mi pagos).
-- ==============================================================================

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
         SUM(s.saldo) FILTER (WHERE s.ano = a.ano AND s.conta = '631300000') AS rpnp_liquidado_a_pagar,
         SUM(s.saldo) FILTER (WHERE s.ano = a.ano AND s.conta = '632100000') AS rpp_a_pagar,
         SUM(s.saldo) FILTER (WHERE s.ano = a.ano AND s.conta IN ('631400000', '632200000')) AS rp_pago_no_ano,
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
  p.sincronizado_em,
  COALESCE(p.rpnp_liquidado_a_pagar, 0) AS rpnp_liquidado_a_pagar,
  COALESCE(p.rpp_a_pagar, 0) AS rpp_a_pagar,
  COALESCE(p.rp_pago_no_ano, 0) AS rp_pago_no_ano
FROM por_ne p
LEFT JOIN public.empenhos e
  ON e.uasg_emitente = p.ug AND upper(split_part(btrim(e.numero_oficial), ' ', 1)) = p.numero_empenho;

COMMENT ON VIEW public.v_empenho_saldo_contabil IS
  'Por UG e empenho, pelo saldo contábil do Tesouro: pago total (todos os anos), pago no ano e, no ano mais recente lido, a liquidar, liquidado a pagar e restos a pagar (não processados a liquidar e liquidados a pagar, processados a pagar, pagos no ano). empenho_id quando o empenho está no sistema.';

REVOKE ALL ON public.v_empenho_saldo_contabil FROM PUBLIC, anon;
GRANT SELECT ON public.v_empenho_saldo_contabil TO authenticated, service_role;
