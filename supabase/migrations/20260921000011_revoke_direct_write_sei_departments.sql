-- ==============================================================================
-- MIGRATION 11: HARDENING DE RLS — REVOGAÇÃO DE ESCRITAS DIRETAS EM DEPARTAMENTOS E PROCESSOS SEI
-- Arquivo: 20260921000011_revoke_direct_write_sei_departments.sql
-- Invariantes: P1 (SSOT), P2 (Backend Authority), P3 (Database Integrity), P7 (Least Privilege)
-- Resolução: GAP-43G-RLS-DIRECT-WRITE
-- ==============================================================================

-- ==============================================================================
-- 1. REVOGAÇÃO DE ESCRITAS DIRETAS EM internal_departments
-- ==============================================================================
-- Todas as mutações (criação, edição, exclusão e mesclagem) foram migradas
-- para as RPCs canônicas:
--   - public.save_internal_department_atomic
--   - public.delete_internal_department_atomic
--   - public.merge_internal_department_allocations_atomic
--
-- A policy "Admin Write: internal_departments" (criada na Migration 02) é revogada
-- para impedir que clientes autenticados realizem INSERT/UPDATE/DELETE direto via PostgREST.
-- A leitura permanece pública e irrestrita via "Public Read: internal_departments".

DROP POLICY IF EXISTS "Admin Write: internal_departments" ON public.internal_departments;

-- ==============================================================================
-- 2. REVOGAÇÃO DE ESCRITAS DIRETAS EM processos_sei
-- ==============================================================================
-- Todas as mutações (criação, edição e exclusão) foram migradas
-- para as RPCs canônicas:
--   - public.save_processo_sei_atomic
--   - public.delete_processo_sei_atomic
--
-- A policy "Gestor Write: processos_sei" (criada na Migration 02) é revogada
-- para impedir que clientes autenticados realizem INSERT/UPDATE/DELETE direto via PostgREST.
-- A leitura permanece pública e irrestrita via "Public Read: processos_sei".

DROP POLICY IF EXISTS "Gestor Write: processos_sei" ON public.processos_sei;

-- ==============================================================================
-- 3. GRANTS EXPLÍCITOS DE EXECUÇÃO NAS RPCS DE DEPARTAMENTOS E PROCESSOS SEI
-- ==============================================================================
-- Garante que chamadas anônimas sejam bloqueadas e que usuários autenticados
-- possam invocar as funções (onde a autorização RBAC é verificada internamente).

REVOKE ALL ON FUNCTION public.save_internal_department_atomic(VARCHAR, VARCHAR, VARCHAR, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_internal_department_atomic(VARCHAR, VARCHAR, VARCHAR, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_internal_department_atomic(VARCHAR, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_internal_department_atomic(VARCHAR, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.merge_internal_department_allocations_atomic(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_internal_department_allocations_atomic(VARCHAR, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.save_processo_sei_atomic(VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_processo_sei_atomic(VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_processo_sei_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_processo_sei_atomic(VARCHAR) TO authenticated;
