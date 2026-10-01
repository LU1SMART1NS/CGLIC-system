-- Endurecimento apontado pelo Supabase Security Advisor (db advisors --type security).
--
-- 1) anon_security_definer_function_executable
--    RPCs de escrita SECURITY DEFINER estavam executáveis por `anon` (e, em
--    parte, por PUBLIC). Todas já bloqueiam internamente via has_role(), então
--    não havia brecha de escrita, mas o privilégio não é necessário: o app só
--    as chama autenticado. Revoga de PUBLIC/anon e mantém authenticated e
--    service_role.
--
--    NÃO alterados de propósito: has_role / has_permission / has_scope.
--    Duas policies SELECT (user_roles, user_scope_assignments) valem para o
--    papel `public` e chamam essas funções; revogar `anon` trocaria um
--    resultado vazio por "permission denied for function". Elas são somente
--    leitura e retornam falso para `anon`.
--
-- 2) function_search_path_mutable
--    Fixa o search_path nas 4 funções. Todas usam apenas funções de
--    pg_catalog (regexp_*, lpad, trim, upper, left), sem dependência de
--    outros schemas.

-- ---------------------------------------------------------------------------
-- 1) Revogar EXECUTE de PUBLIC/anon
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.link_contract_to_item_atomic(VARCHAR, VARCHAR, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unlink_contract_from_item_atomic(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_contract_task_template_atomic(VARCHAR) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_contract_task_template_macrotask_atomic(VARCHAR) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_contract_task_template_task_atomic(VARCHAR) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_contract_task_template_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) FROM PUBLIC, anon;

-- Função de trigger: o privilégio EXECUTE só é checado na criação do trigger,
-- não ao disparar; não precisa ser chamável por anon/PUBLIC.
REVOKE EXECUTE ON FUNCTION public.trg_audit_log_capture() FROM PUBLIC, anon;

-- Garante explicitamente quem continua com acesso.
GRANT EXECUTE ON FUNCTION public.link_contract_to_item_atomic(VARCHAR, VARCHAR, NUMERIC, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlink_contract_from_item_atomic(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_atomic(VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_macrotask_atomic(VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_task_atomic(VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_contract_task_template_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Fixar search_path
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.normalize_contract_key(VARCHAR, VARCHAR, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.build_payment_cycle_key(VARCHAR, VARCHAR, VARCHAR) SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_prevent_empenho_eventos_mutation() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_user_roles_default_role_id() SET search_path = public, pg_temp;
