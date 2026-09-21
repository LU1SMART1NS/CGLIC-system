-- ==============================================================================
-- MIGRATION 10: RPCs TRANSACIONAIS DO CATÁLOGO DE PROCESSOS SEI — SALDOARP 3.0
-- Arquivo: 20260918000010_sei_authority.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P6 (Auditabilidade), P7 (Least Privilege)
-- Resolução: GAP-43F-SEI (Eliminação de Mutação PostgREST Direta em Processos SEI)
-- ==============================================================================

-- ==============================================================================
-- 1. FUNÇÃO RPC: save_processo_sei_atomic
-- ==============================================================================
-- Cria ou atualiza um processo administrativo SEI no catálogo oficial com autorização RBAC,
-- normalização de número SEI, validações de tamanho/status e geração de ID no backend.

CREATE OR REPLACE FUNCTION public.save_processo_sei_atomic(
  p_id VARCHAR(50) DEFAULT NULL,
  p_numero_processo_sei VARCHAR(50) DEFAULT NULL,
  p_descricao_objeto TEXT DEFAULT NULL,
  p_unidade_requisitante VARCHAR(100) DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_status_processo VARCHAR(50) DEFAULT 'Em Instrução'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(50);
  v_numero_processo_sei VARCHAR(50);
  v_descricao_objeto TEXT;
  v_unidade_requisitante VARCHAR(100);
  v_responsavel_nome VARCHAR(150);
  v_status_processo VARCHAR(50);
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
  v_numero_processo_sei := TRIM(COALESCE(p_numero_processo_sei, ''));
  v_descricao_objeto := NULLIF(TRIM(COALESCE(p_descricao_objeto, '')), '');
  v_unidade_requisitante := NULLIF(TRIM(COALESCE(p_unidade_requisitante, '')), '');
  v_responsavel_nome := NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), '');
  v_status_processo := TRIM(COALESCE(p_status_processo, 'Em Instrução'));

  IF v_numero_processo_sei = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número do processo SEI é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF LENGTH(v_numero_processo_sei) > 50 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número do processo SEI não pode exceder 50 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF v_unidade_requisitante IS NOT NULL AND LENGTH(v_unidade_requisitante) > 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A unidade requisitante não pode exceder 100 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF v_responsavel_nome IS NOT NULL AND LENGTH(v_responsavel_nome) > 150 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do responsável não pode exceder 150 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF v_status_processo NOT IN ('Em Instrução', 'Aprovado', 'Empenhado', 'Concluído') THEN
    RAISE EXCEPTION 'INVALID_PROCESS_SEI_STATUS: Status do processo SEI inválido ("%"). Valores permitidos: Em Instrução, Aprovado, Empenhado, Concluído.', v_status_processo
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: EXECUÇÃO DE CRIAÇÃO (INSERT) OU ATUALIZAÇÃO (UPDATE)
  -- --------------------------------------------------------------------------
  v_id := NULLIF(TRIM(COALESCE(p_id, '')), '');

  IF v_id IS NULL THEN
    -- Gera ID determinístico no backend
    v_id := 'sei-' || gen_random_uuid()::text;

    -- Inserção deixando a constraint UNIQUE(numero_processo_sei) garantir unicidade
    INSERT INTO public.processos_sei (
      id,
      numero_processo_sei,
      descricao_objeto,
      unidade_requisitante,
      responsavel_nome,
      status_processo,
      created_at,
      updated_at
    )
    VALUES (
      v_id,
      v_numero_processo_sei,
      v_descricao_objeto,
      v_unidade_requisitante,
      v_responsavel_nome,
      v_status_processo,
      NOW(),
      NOW()
    )
    RETURNING id, numero_processo_sei, descricao_objeto, unidade_requisitante, responsavel_nome, status_processo, created_at, updated_at
    INTO v_record;

  ELSE
    -- Atualização: Valida se o registro existe
    IF NOT EXISTS (SELECT 1 FROM public.processos_sei WHERE id = v_id) THEN
      RAISE EXCEPTION 'PROCESS_SEI_NOT_FOUND: Processo SEI com ID "%" não encontrado.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Atualiza o processo SEI
    UPDATE public.processos_sei
    SET
      numero_processo_sei = v_numero_processo_sei,
      descricao_objeto = v_descricao_objeto,
      unidade_requisitante = v_unidade_requisitante,
      responsavel_nome = v_responsavel_nome,
      status_processo = v_status_processo,
      updated_at = NOW()
    WHERE id = v_id
    RETURNING id, numero_processo_sei, descricao_objeto, unidade_requisitante, responsavel_nome, status_processo, created_at, updated_at
    INTO v_record;

  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 4: RESPOSTA CANÔNICA ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'processo', jsonb_build_object(
      'id', v_record.id,
      'numero_processo_sei', v_record.numero_processo_sei,
      'descricao_objeto', v_record.descricao_objeto,
      'unidade_requisitante', v_record.unidade_requisitante,
      'responsavel_nome', v_record.responsavel_nome,
      'status_processo', v_record.status_processo,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

-- ==============================================================================
-- 2. FUNÇÃO RPC: delete_processo_sei_atomic
-- ==============================================================================
-- Exclui um processo SEI de forma atômica e segura.
-- A integridade com arp_allocations é mantida automaticamente pelo PostgreSQL via ON DELETE SET NULL.

CREATE OR REPLACE FUNCTION public.delete_processo_sei_atomic(
  p_id VARCHAR(50)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(50);
  v_proc RECORD;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: VERIFICAÇÃO RIGOROSA DE AUTORIZAÇÃO (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: LOCALIZAÇÃO DO PROCESSO SEI
  -- --------------------------------------------------------------------------
  v_id := TRIM(COALESCE(p_id, ''));
  IF v_id = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O ID do processo SEI é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_proc FROM public.processos_sei WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROCESS_SEI_NOT_FOUND: Processo SEI com ID "%" não encontrado.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: EXCLUSÃO ATÔMICA
  -- (ON DELETE SET NULL em arp_allocations seta processo_sei_id para NULL automaticamente)
  -- --------------------------------------------------------------------------
  DELETE FROM public.processos_sei WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'numero_processo_sei', v_proc.numero_processo_sei,
    'message', 'Processo SEI excluído com sucesso.'
  );
END;
$$;
