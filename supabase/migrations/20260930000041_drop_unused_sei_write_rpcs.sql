-- =============================================================================
-- Remoção das RPCs de escrita de processos SEI (cadastro manual descontinuado)
-- =============================================================================
-- O cadastro manual de processos SEI (SeiManagementModal) saiu do frontend.
-- Estas duas funções eram usadas só por ele.
--
-- A tabela public.processos_sei é MANTIDA: contract_payment_cycles tem FKs
-- para numero_processo_sei, save_allocations_atomic valida processo_sei_id
-- contra ela e dbCacheService lê o número do processo das alocações.
-- A escrita direta já estava revogada (20260921000011), então a tabela passa
-- a ser somente leitura para a aplicação.
--
-- Reversão: recriar as funções a partir de 20260918000010_sei_authority.sql
-- e reaplicar os GRANTs de 20260921000011_revoke_direct_write_sei_departments.sql.

DROP FUNCTION IF EXISTS public.save_processo_sei_atomic(VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.delete_processo_sei_atomic(VARCHAR);
