-- ==============================================================================
-- MIGRATION 132: O QUE O TESOURO DIZ DO EMPENHO DAS FATURAS A CONFERIR (FASE 3 DO ESTUDO)
-- Versão: 20261014000132_fatura_conferencia_tesouro.sql
--
-- Contexto: estudo docs/estudos/saldo-contabil-tesouro.md, fase 3. As faturas "sem como confirmar" (pagamento a
-- conferir, migration 123, ou liquidadas sem NP, migration 122) não têm OB que confirme o pagamento. O saldo contábil
-- do Tesouro (migration 128) não diz qual fatura foi paga, mas diz quanto o empenho pagou. Comparando com as faturas
-- do empenho, dá para avisar na linha da fatura. A fatura continua "a conferir" (decisão do estudo).
--
-- Regra, por empenho da fatura (partes da fatura reduzidas na proporção quando passam do valor dela):
--   confirmado = partes das faturas já pagas (OB que confirma ou "Pago");
--   a conferir = partes das faturas a conferir;
--   PAGO     quando o pago no Tesouro cobre confirmado + a conferir (tolerância de 1% ou R$ 1);
--   PARCIAL  quando o Tesouro pagou mais que o confirmado, mas não tudo;
--   NAO_PAGO quando o Tesouro não pagou além do confirmado.
-- A fatura fica PAGO só se todos os empenhos dela cobrem; NAO_PAGO se nenhum pagou além do confirmado; PARCIAL no
-- resto. Fatura sem empenho no Tesouro não aparece.
-- Medição de 14/10/2026: 196 faturas PAGO (R$ 30,5 mi), 247 PARCIAL (R$ 54,5 mi), 794 NAO_PAGO (R$ 217,6 mi).
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_fatura_conferencia_tesouro
WITH (security_invoker = true)
AS
-- Cada parte é calculada uma vez (MATERIALIZED): sem isso, o planejador refaz a view do Tesouro por linha (36 s).
WITH faturas AS MATERIALIZED (
  -- Mesmas regras de paga e pagamento_a_conferir de v_contrato_faturas (migration 123), lidas das tabelas: a view
  -- inteira calcula colunas que aqui não servem e deixava a consulta lenta.
  SELECT x.id_fatura, x.valor_liquido, x.paga,
         (x.pagamento_a_conferir OR (x.data_liquidacao IS NOT NULL AND x.np IS NULL AND NOT x.paga)) AS a_conferir
    FROM (
      SELECT f.id_fatura, f.valor_liquido, f.data_liquidacao, f.np,
             (fp.ordens_bancarias IS NOT NULL OR f.situacao = 'Pago') AS paga,
             (fp.ordens_bancarias IS NULL AND f.situacao IS DISTINCT FROM 'Pago' AND fp.obs_a_conferir IS NOT NULL) AS pagamento_a_conferir
        FROM public.contrato_faturas f
        LEFT JOIN public.fatura_pagamento fp ON fp.id_fatura = f.id_fatura
       WHERE NOT f.cancelada
    ) x
), tesouro AS MATERIALIZED (
  SELECT empenho_id, pago_total
    FROM public.v_empenho_saldo_contabil
   WHERE empenho_id IS NOT NULL
), partes AS MATERIALIZED (
  SELECT fe.id_fatura, e.id AS empenho_id, fe.valor,
         SUM(fe.valor) OVER (PARTITION BY fe.id_fatura) AS soma
    FROM public.fatura_empenhos fe
    JOIN public.empenhos e ON e.identificador_fonte = fe.id_empenho_gov
), cota AS MATERIALIZED (
  SELECT p.id_fatura, p.empenho_id,
         p.valor * LEAST(1, f.valor_liquido / NULLIF(p.soma, 0)) AS parte,
         f.paga, f.a_conferir
    FROM partes p
    JOIN faturas f USING (id_fatura)
), por_empenho AS MATERIALIZED (
  SELECT c.empenho_id,
         COALESCE(SUM(c.parte) FILTER (WHERE c.paga), 0) AS confirmado,
         COALESCE(SUM(c.parte) FILTER (WHERE c.a_conferir), 0) AS a_conferir,
         t.pago_total
    FROM cota c
    JOIN tesouro t ON t.empenho_id = c.empenho_id
   WHERE c.empenho_id IN (SELECT empenho_id FROM cota WHERE a_conferir)
   GROUP BY c.empenho_id, t.pago_total
), por_fatura AS (
  SELECT c.id_fatura,
         BOOL_AND(n.pago_total + GREATEST(1, 0.01 * (n.confirmado + n.a_conferir)) >= n.confirmado + n.a_conferir) AS todos_cobrem,
         BOOL_OR(n.pago_total > n.confirmado + GREATEST(1, 0.01 * n.confirmado)) AS algum_pagou_mais,
         SUM(n.pago_total) AS pago_tesouro,
         SUM(n.confirmado) AS confirmado,
         SUM(n.a_conferir) AS a_conferir,
         COUNT(*) AS empenhos
    FROM cota c
    JOIN por_empenho n USING (empenho_id)
   WHERE c.a_conferir
   GROUP BY c.id_fatura
)
SELECT
  id_fatura,
  CASE WHEN todos_cobrem THEN 'PAGO' WHEN algum_pagou_mais THEN 'PARCIAL' ELSE 'NAO_PAGO' END AS situacao_tesouro,
  ROUND(pago_tesouro, 2) AS pago_tesouro,
  ROUND(confirmado, 2) AS confirmado_faturas,
  ROUND(a_conferir, 2) AS a_conferir_faturas,
  empenhos
FROM por_fatura;

COMMENT ON VIEW public.v_fatura_conferencia_tesouro IS
  'Para cada fatura a conferir (sem OB que confirme ou liquidada sem NP): se o pago no Tesouro dos empenhos dela cobre as faturas do empenho (PAGO), cobre em parte (PARCIAL) ou não passa do já confirmado (NAO_PAGO). Aviso; não muda a etapa da fatura.';

REVOKE ALL ON public.v_fatura_conferencia_tesouro FROM PUBLIC, anon;
GRANT SELECT ON public.v_fatura_conferencia_tesouro TO authenticated, service_role;
