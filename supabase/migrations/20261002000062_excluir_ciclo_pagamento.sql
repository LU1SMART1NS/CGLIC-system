-- ==============================================================================
-- MIGRATION 62: EXCLUSÃO DEFINITIVA DE CICLO DE PAGAMENTO (SÓ ADMIN)
-- Versão: 20261002000062_excluir_ciclo_pagamento.sql
--
-- Cancelar (marco CANCELADO) mantém o ciclo no histórico e é do gestor. Excluir apaga de vez o ciclo, os
-- documentos e o histórico (em cascata) e o plano de checklist do ciclo, e é restrito a admin. O trigger de
-- auditoria registra a exclusão de cada tabela.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.delete_payment_cycle_atomic(p_cycle_key VARCHAR(180))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle_key VARCHAR(180) := TRIM(COALESCE(p_cycle_key, ''));
  v_cycle RECORD;
  v_planos INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: A exclusão definitiva de um ciclo de pagamento é restrita a administradores.'
      USING ERRCODE = '42501';
  END IF;
  IF v_cycle_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chave do ciclo (cycle_key) é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cycle FROM public.contract_payment_cycles WHERE cycle_key = v_cycle_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_NOT_FOUND: Ciclo de pagamento "%" não encontrado.', v_cycle_key USING ERRCODE = 'P0002';
  END IF;

  -- Checklist do ciclo (a chave do plano é o cycle_key); macrotarefas e tarefas saem em cascata.
  DELETE FROM public.contract_task_plans WHERE contract_key = v_cycle_key;
  GET DIAGNOSTICS v_planos = ROW_COUNT;

  -- Documentos e histórico saem em cascata.
  DELETE FROM public.contract_payment_cycles WHERE id = v_cycle.id;

  RETURN jsonb_build_object('success', true, 'cycle_key', v_cycle_key, 'planos_removidos', v_planos);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_payment_cycle_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payment_cycle_atomic(VARCHAR) TO authenticated;
