-- ==============================================================================
-- MIGRATION 60: RECRIA O MODELO DE ACOMPANHAMENTO DE PAGAMENTO COM AS 3 ETAPAS
-- Versão: 20261002000060_recria_modelo_acompanhamento_pagamento.sql
--
-- O modelo tpl-acompanhamento-pagamento-14133 foi excluído na tela de modelos depois da migration 58,
-- e sem ele os ciclos novos não recebem checklist. Esta migration o recria com o mesmo desenho da 58:
-- 3 etapas, só com tarefas humanas (as funções automáticas viram alertas). Idempotente: se o modelo
-- existir, só garante o conteúdo das 3 etapas.
-- ==============================================================================
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo)
VALUES (
  'tpl-acompanhamento-pagamento-14133',
  'Workflow de Acompanhamento de Pagamento (Faturamento)',
  'Roteiro instrutório e checklist operacional de conferência de atesto, envio à CGOFI e acompanhamento do pagamento.',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET ativo = TRUE, updated_at = NOW();

INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem) VALUES
  ('macro-pgto-1', 'tpl-acompanhamento-pagamento-14133', '1. Recepção e conferência', 1),
  ('macro-pgto-2', 'tpl-acompanhamento-pagamento-14133', '2. Envio à CGOFI', 2),
  ('macro-pgto-3', 'tpl-acompanhamento-pagamento-14133', '3. Acompanhamento do pagamento', 3)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();

DELETE FROM public.contract_task_template_macrotasks
 WHERE template_id = 'tpl-acompanhamento-pagamento-14133' AND id NOT IN ('macro-pgto-1', 'macro-pgto-2', 'macro-pgto-3');

DELETE FROM public.contract_task_template_tasks
 WHERE macrotask_id IN ('macro-pgto-1', 'macro-pgto-2', 'macro-pgto-3');

INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode) VALUES
  ('task-pgto-1-1', 'macro-pgto-1', 'Conferir a conformidade formal do Termo de Atesto e das notas fiscais', 1, 'INTERNA'),
  ('task-pgto-1-2', 'macro-pgto-1', 'Verificar a regularidade fiscal e trabalhista do credor (SICAF / CNDs)', 2, 'EXTERNA'),
  ('task-pgto-2-1', 'macro-pgto-2', 'Elaborar o Despacho de Instrução de Pagamento e tramitar à CGOFI pelo SEI', 1, 'EXTERNA'),
  ('task-pgto-3-1', 'macro-pgto-3', 'Cobrar a CGOFI quando o prazo de acompanhamento for excedido', 1, 'INTERNA'),
  ('task-pgto-3-2', 'macro-pgto-3', 'Registrar a Ordem Bancária e concluir o ciclo', 2, 'CONFIRMACAO');
