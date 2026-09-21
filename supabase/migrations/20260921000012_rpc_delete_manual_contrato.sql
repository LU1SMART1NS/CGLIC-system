-- ==============================================================================
-- MIGRATION 12: RPC DE EXCLUSÃO ATÔMICA DE CONTRATOS MANUAIS — SALDOARP 3.0
-- Arquivo: 20260921000012_rpc_delete_manual_contrato.sql
-- Invariantes: P1 (SSOT), P2 (Backend Authority), P3 (Database Integrity), P4 (ACID), P7 (Least Privilege)
-- Resolução: GAP-43D4-DELETE (Eliminação da exclusão simulada/local de contratos)
-- ==============================================================================

-- ==============================================================================
-- 1. FUNÇÃO RPC: delete_manual_contrato_atomic
-- ==============================================================================
-- Exclui um contrato manual de forma atômica e transacional.
-- Os vínculos em contrato_empenho_links são automaticamente removidos via FK ON DELETE CASCADE.
-- Não afeta arp_allocations, empenhos_manuais, empenho_manual_quantidades nem o saldo da ARP (RN-02).

CREATE OR REPLACE FUNCTION public.delete_manual_contrato_atomic(
  p_id VARCHAR(100)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(100);
  v_record RECORD;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: VERIFICAÇÃO RIGOROSA DE AUTORIZAÇÃO (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: NORMALIZAÇÃO E VALIDAÇÕES DE ENTRADA
  -- --------------------------------------------------------------------------
  v_id := TRIM(COALESCE(p_id, ''));
  IF v_id = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O identificador do contrato manual é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: LOCALIZAÇÃO E TRAVA DO REGISTRO (FOR UPDATE)
  -- --------------------------------------------------------------------------
  SELECT * INTO v_record
  FROM public.contratos_manuais
  WHERE id = v_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND: Contrato manual com ID "%" não encontrado.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 4: EXCLUSÃO ATÔMICA
  -- (A foreign key em contrato_empenho_links propaga ON DELETE CASCADE automaticamente)
  -- --------------------------------------------------------------------------
  DELETE FROM public.contratos_manuais WHERE id = v_id;

  -- --------------------------------------------------------------------------
  -- PASSO 5: RESPOSTA CANÔNICA ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'item_key', v_record.item_key,
    'numero', v_record.numero,
    'ano', v_record.ano,
    'message', 'Contrato manual e seus vínculos associados excluídos com sucesso.'
  );
END;
$$;

-- ==============================================================================
-- 2. HARDENING DE PRIVILÉGIOS DE EXECUÇÃO (GRANTS)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.delete_manual_contrato_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_manual_contrato_atomic(VARCHAR) TO authenticated;
