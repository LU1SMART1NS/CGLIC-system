-- ==============================================================================
-- MIGRATION: SYNC arp_allocations.updated_at
-- Versão: 20260925000021_sync_arp_allocations_updated_at.sql
-- ==============================================================================
-- O banco de produção (SaldoARP) já possui a coluna public.arp_allocations.updated_at
-- (TIMESTAMPTZ DEFAULT now()), aplicada fora do fluxo de migrations versionadas.
-- O schema canônico em 20260917000001_canonical_schema.sql nunca a declarou, o que
-- fazia parecer, a partir da leitura estática dos arquivos locais, que a função
-- merge_internal_department_allocations_atomic (20260918000009_department_authority.sql)
-- referenciava uma coluna inexistente. Não é o caso: a coluna existe no banco real.
-- Esta migration apenas documenta/sincroniza esse estado no repositório; é idempotente
-- e não tem efeito em bancos que já possuem a coluna.

ALTER TABLE public.arp_allocations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
