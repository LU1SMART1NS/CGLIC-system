-- Renomeia a macroetapa 1 do template de acompanhamento de pagamento
-- ("Recepção e Atribuição do Atesto" -> "Recepção do Atesto"), no template e
-- nos planos de ciclos já instanciados (cópia por valor).
UPDATE public.contract_task_template_macrotasks
SET nome = '1. Recepção do Atesto', updated_at = NOW()
WHERE id = 'macro-pgto-1'
  AND template_id = 'tpl-acompanhamento-pagamento-14133';

UPDATE public.contract_task_macrotasks m
SET nome = '1. Recepção do Atesto'
FROM public.contract_task_plans p
WHERE m.plan_id = p.id
  AND p.template_id = 'tpl-acompanhamento-pagamento-14133'
  AND m.nome = '1. Recepção e Atribuição do Atesto';
