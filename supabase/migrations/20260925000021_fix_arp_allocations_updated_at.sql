-- ==============================================================================
-- MIGRATION 21: FASE 0.1 — CORREÇÃO arp_allocations.updated_at AUSENTE
-- ==============================================================================
-- Bug confirmado em auditoria: public.merge_internal_department_allocations_atomic
-- (20260918000009_department_authority.sql) executa
--   UPDATE public.arp_allocations SET unit_name = ..., updated_at = NOW()
-- mas a coluna updated_at nunca foi criada em arp_allocations
-- (20260917000001_canonical_schema.sql), causando falha em runtime
-- ("column \"updated_at\" of relation \"arp_allocations\" does not exist").
--
-- Todas as tabelas irmãs do domínio de saldo já seguem o padrão
-- created_at + updated_at (internal_departments, processos_sei,
-- item_allocation_state). Esta migration alinha arp_allocations ao mesmo
-- modelo temporal já adotado, em vez de remover o campo da RPC.
-- ==============================================================================

ALTER TABLE public.arp_allocations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
