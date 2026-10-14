-- ==============================================================================
-- MIGRATION 122: RESUMO DAS FATURAS DO CONTRATO SEM AS LIQUIDADAS SEM NP
-- Versão: 20261014000122_resumo_faturas_sem_np.sql
--
-- Contexto (14/10/2026): 27 faturas liquidadas não têm NP no Contratos.gov.br (antigas, de 2024 e 2025, ou pagas
-- por outro documento, como DD). Sem NP não há como achar a OB no Tesouro. As telas já as mostram como "Sem como
-- confirmar" e fora do "aguardando OB" (PR #177) e da previsão mensal (PR #178), mas v_contrato_faturas_resumo
-- ainda as contava em liquidadas_sem_pagamento.
--
-- O que muda em v_contrato_faturas_resumo:
--   - liquidadas_sem_pagamento conta só as liquidadas com NP e sem OB (as que aguardam OB de fato);
--   - coluna nova no fim, liquidadas_sem_np: liquidadas, não pagas e sem NP ("Sem como confirmar").
-- O que não muda: as demais colunas (faturado, liquidado e pago continuam com todas as faturas) e v_contrato_faturas.
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_contrato_faturas_resumo
WITH (security_invoker = true)
AS
SELECT
  contract_key,
  COUNT(*) FILTER (WHERE NOT cancelada) AS faturas,
  COALESCE(SUM(valor) FILTER (WHERE NOT cancelada), 0) AS valor_faturado,
  COALESCE(SUM(valor) FILTER (WHERE NOT cancelada AND data_liquidacao IS NOT NULL), 0) AS valor_liquidado,
  COALESCE(SUM(valor) FILTER (WHERE paga), 0) AS valor_pago,
  COUNT(*) FILTER (WHERE NOT cancelada AND data_liquidacao IS NOT NULL AND NOT paga AND np IS NOT NULL) AS liquidadas_sem_pagamento,
  COUNT(*) FILTER (WHERE empenhos_sem_vinculo > 0) AS faturas_com_ne_sem_vinculo,
  MAX(data_liquidacao) AS ultima_liquidacao,
  MAX(ob_emissao) AS ultimo_pagamento,
  COUNT(*) FILTER (WHERE NOT cancelada AND data_liquidacao IS NOT NULL AND NOT paga AND np IS NULL) AS liquidadas_sem_np
FROM public.v_contrato_faturas
GROUP BY contract_key;

COMMENT ON VIEW public.v_contrato_faturas_resumo IS
  'Resumo por contrato: faturado, liquidado e pago (soma das faturas com OB válida, nunca o valor da OB, que pode cobrir vários contratos); liquidadas aguardando OB (com NP) e liquidadas sem NP, sem como confirmar o pagamento.';

GRANT SELECT ON public.v_contrato_faturas_resumo TO authenticated;
