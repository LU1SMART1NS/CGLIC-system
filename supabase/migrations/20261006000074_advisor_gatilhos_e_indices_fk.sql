-- Achados do Supabase Advisor (db advisors --type all) depois das migrations 066 a 073.
--
-- 1) anon_security_definer_function_executable
--    As 4 funções de gatilho criadas nas migrations 069 a 071 estavam executáveis por
--    PUBLIC/anon. O privilégio EXECUTE de uma função de gatilho só é checado na criação do
--    trigger, não ao disparar, então revogar não muda o comportamento dos gatilhos
--    (mesmo caso da migration 047 com trg_audit_log_capture). Mantém authenticated e
--    service_role.
--
--    NÃO alterados de propósito: has_role / has_permission / has_scope. Duas policies SELECT
--    (user_roles, user_scope_assignments) valem para o papel `public` e chamam essas funções;
--    revogar `anon` trocaria um resultado vazio por "permission denied for function".
--
-- 2) unindexed_foreign_keys
--    Índice de cobertura nas 16 chaves estrangeiras apontadas. 11 delas são colunas de
--    auditoria que referenciam auth.users (ON DELETE SET NULL, migration 067): sem índice,
--    excluir um usuário varre cada uma dessas tabelas. As demais aceleram junções por
--    processo SEI, unidade interna e alocação. IF NOT EXISTS: reaplicável.

-- ---------------------------------------------------------------------------
-- 1) Revogar EXECUTE de PUBLIC/anon nas funções de gatilho
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.trg_ata_manager_propaga_contratos() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_vinculo_contrato_uma_ata() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_vinculo_herda_gestor_da_ata() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_vinculo_limpa_descarte_da_ata() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.trg_ata_manager_propaga_contratos() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_vinculo_contrato_uma_ata() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_vinculo_herda_gestor_da_ata() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_vinculo_limpa_descarte_da_ata() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Índices de cobertura das chaves estrangeiras
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_arp_allocations_processo_sei_id ON public.arp_allocations (processo_sei_id);
CREATE INDEX IF NOT EXISTS idx_arp_allocations_unit_name ON public.arp_allocations (unit_name);
CREATE INDEX IF NOT EXISTS idx_arp_item_contract_dismissals_dismissed_by ON public.arp_item_contract_dismissals (dismissed_by);
CREATE INDEX IF NOT EXISTS idx_arp_item_contract_links_criado_por ON public.arp_item_contract_links (criado_por);
CREATE INDEX IF NOT EXISTS idx_arp_item_empenhos_confirmado_por ON public.arp_item_empenhos (confirmado_por);
CREATE INDEX IF NOT EXISTS idx_arp_item_saldo_oficial_atualizado_por ON public.arp_item_saldo_oficial (atualizado_por);
CREATE INDEX IF NOT EXISTS idx_contract_ata_descartes_descartado_por_user_id ON public.contract_ata_descartes (descartado_por_user_id);
CREATE INDEX IF NOT EXISTS idx_contract_payment_cycles_numero_processo_contrato_sei ON public.contract_payment_cycles (numero_processo_contrato_sei);
CREATE INDEX IF NOT EXISTS idx_contract_payment_cycles_numero_processo_pagamento_sei ON public.contract_payment_cycles (numero_processo_pagamento_sei);
CREATE INDEX IF NOT EXISTS idx_contract_payment_cycles_responsavel_user_id ON public.contract_payment_cycles (responsavel_user_id);
CREATE INDEX IF NOT EXISTS idx_contract_sem_ata_confirmacoes_confirmado_por_user_id ON public.contract_sem_ata_confirmacoes (confirmado_por_user_id);
CREATE INDEX IF NOT EXISTS idx_distribuicao_avisos_feito_por_user_id ON public.distribuicao_avisos (feito_por_user_id);
CREATE INDEX IF NOT EXISTS idx_distribuicao_avisos_lido_por_user_id ON public.distribuicao_avisos (lido_por_user_id);
CREATE INDEX IF NOT EXISTS idx_empenho_links_allocation_id ON public.empenho_links (allocation_id);
CREATE INDEX IF NOT EXISTS idx_instrument_complexity_overrides_ajustado_por_user_id ON public.instrument_complexity_overrides (ajustado_por_user_id);
CREATE INDEX IF NOT EXISTS idx_sincronizacao_fontes_em_andamento_por ON public.sincronizacao_fontes (em_andamento_por);
