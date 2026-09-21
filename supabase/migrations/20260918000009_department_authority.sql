-- ==============================================================================
-- MIGRATION 09: RPCs TRANSACIONAIS DO CATÁLOGO DE DEPARTAMENTOS E SANEAMENTO — SALDOARP 3.0
-- Arquivo: 20260918000009_department_authority.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P6 (Auditabilidade), P7 (Least Privilege)
-- Resolução: GAP-43E-01 (Merge Sanitization), GAP-43E-02 (RPC CRUD), GAP-43E-03 (FK Safety)
-- ==============================================================================

-- ==============================================================================
-- 1. FUNÇÃO RPC: save_internal_department_atomic
-- ==============================================================================
-- Cria ou atualiza um departamento no catálogo oficial com autorização RBAC,
-- normalização de sigla, validações de tamanho/obrigatoriedade e geração de ID no backend.
-- Se a sigla for alterada, o PostgreSQL propaga automaticamente para arp_allocations via ON UPDATE CASCADE.

CREATE OR REPLACE FUNCTION public.save_internal_department_atomic(
  p_id VARCHAR(50) DEFAULT NULL,
  p_sigla VARCHAR(30) DEFAULT NULL,
  p_nome_completo VARCHAR(255) DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(50);
  v_sigla VARCHAR(30);
  v_nome_completo VARCHAR(255);
  v_descricao TEXT;
  v_ativo BOOLEAN;
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
  v_sigla := TRIM(UPPER(COALESCE(p_sigla, '')));
  v_nome_completo := TRIM(COALESCE(p_nome_completo, ''));
  v_descricao := NULLIF(TRIM(COALESCE(p_descricao, '')), '');
  v_ativo := COALESCE(p_ativo, TRUE);

  IF v_sigla = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A sigla do departamento é obrigatória.'
      USING ERRCODE = '22023';
  END IF;

  IF LENGTH(v_sigla) > 30 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A sigla do departamento não pode exceder 30 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF v_nome_completo = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome completo do departamento é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF LENGTH(v_nome_completo) > 255 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome completo do departamento não pode exceder 255 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: EXECUÇÃO DE CRIAÇÃO (INSERT) OU ATUALIZAÇÃO (UPDATE)
  -- --------------------------------------------------------------------------
  v_id := NULLIF(TRIM(COALESCE(p_id, '')), '');

  IF v_id IS NULL THEN
    -- Inserção: Valida se a sigla já existe
    IF EXISTS (SELECT 1 FROM public.internal_departments WHERE sigla = v_sigla) THEN
      RAISE EXCEPTION 'DUPLICATE_DEPARTMENT: Já existe um departamento cadastrado com a sigla "%".', v_sigla
        USING ERRCODE = '23505';
    END IF;

    -- Gera ID determinístico no backend
    v_id := 'dep-' || gen_random_uuid()::text;

    INSERT INTO public.internal_departments (
      id,
      sigla,
      nome_completo,
      descricao,
      ativo,
      created_at,
      updated_at
    )
    VALUES (
      v_id,
      v_sigla,
      v_nome_completo,
      v_descricao,
      v_ativo,
      NOW(),
      NOW()
    )
    RETURNING id, sigla, nome_completo, descricao, ativo, created_at, updated_at
    INTO v_record;

  ELSE
    -- Atualização: Valida se o registro existe
    IF NOT EXISTS (SELECT 1 FROM public.internal_departments WHERE id = v_id) THEN
      RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND: Departamento com id "%" não encontrado.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Valida se a nova sigla colide com outro registro
    IF EXISTS (SELECT 1 FROM public.internal_departments WHERE sigla = v_sigla AND id <> v_id) THEN
      RAISE EXCEPTION 'DUPLICATE_DEPARTMENT: Já existe outro departamento cadastrado com a sigla "%".', v_sigla
        USING ERRCODE = '23505';
    END IF;

    -- Atualiza o departamento (ON UPDATE CASCADE propaga para arp_allocations automaticamente)
    UPDATE public.internal_departments
    SET
      sigla = v_sigla,
      nome_completo = v_nome_completo,
      descricao = v_descricao,
      ativo = v_ativo,
      updated_at = NOW()
    WHERE id = v_id
    RETURNING id, sigla, nome_completo, descricao, ativo, created_at, updated_at
    INTO v_record;

  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 4: RESPOSTA CANÔNICA ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'department', jsonb_build_object(
      'id', v_record.id,
      'sigla', v_record.sigla,
      'nome_completo', v_record.nome_completo,
      'descricao', v_record.descricao,
      'ativo', v_record.ativo,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

-- ==============================================================================
-- 2. FUNÇÃO RPC: delete_internal_department_atomic
-- ==============================================================================
-- Exclui ou desativa um departamento de forma atômica e segura contra violações de FK.
-- Se possuir vínculos em arp_allocations e p_force_deactivate for false, aborta com erro de negócio.
-- Se p_force_deactivate for true, realiza soft-delete (ativo = false).

CREATE OR REPLACE FUNCTION public.delete_internal_department_atomic(
  p_id VARCHAR(50),
  p_force_deactivate BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(50);
  v_dep RECORD;
  v_alloc_count INTEGER;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: VERIFICAÇÃO RIGOROSA DE AUTORIZAÇÃO (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: LOCALIZAÇÃO DO DEPARTAMENTO
  -- --------------------------------------------------------------------------
  v_id := TRIM(COALESCE(p_id, ''));
  IF v_id = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O identificador do departamento é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dep FROM public.internal_departments WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND: Departamento com ID "%" não encontrado.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: VERIFICAÇÃO DE INTEGRIDADE REFERENCIAL (VÍNCULOS COM ALOCAÇÕES)
  -- --------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_alloc_count
  FROM public.arp_allocations
  WHERE unit_name = v_dep.sigla;

  IF v_alloc_count > 0 THEN
    IF NOT COALESCE(p_force_deactivate, FALSE) THEN
      RAISE EXCEPTION 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS: O departamento "%" possui % alocação(ões) vinculada(s) e não pode ser excluído. Desative-o em vez de excluir.', v_dep.sigla, v_alloc_count
        USING ERRCODE = '23503';
    ELSE
      -- Soft delete (desativação)
      UPDATE public.internal_departments
      SET ativo = FALSE,
          updated_at = NOW()
      WHERE id = v_id;

      RETURN jsonb_build_object(
        'success', true,
        'deleted', false,
        'deactivated', true,
        'id', v_id,
        'sigla', v_dep.sigla,
        'allocations_count', v_alloc_count,
        'message', 'Departamento desativado com sucesso devido a vínculos existentes.'
      );
    END IF;
  ELSE
    -- Hard delete seguro (sem alocações atreladas)
    DELETE FROM public.internal_departments WHERE id = v_id;

    RETURN jsonb_build_object(
      'success', true,
      'deleted', true,
      'deactivated', false,
      'id', v_id,
      'sigla', v_dep.sigla,
      'allocations_count', 0,
      'message', 'Departamento excluído com sucesso.'
    );
  END IF;
END;
$$;

-- ==============================================================================
-- 3. FUNÇÃO RPC: merge_internal_department_allocations_atomic
-- ==============================================================================
-- Higienização e saneamento administrativo de nomes legados ou incorretos em arp_allocations.
-- Substitui exclusivamente o campo unit_name pela sigla oficial de destino ativa,
-- preservando estritamente quantidades, saldos, valores e vínculos de empenho.

CREATE OR REPLACE FUNCTION public.merge_internal_department_allocations_atomic(
  p_old_name VARCHAR(255),
  p_target_sigla VARCHAR(30)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_name VARCHAR(255);
  v_target_sigla VARCHAR(30);
  v_target_dep RECORD;
  v_rows_updated INTEGER := 0;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: VERIFICAÇÃO RIGOROSA DE AUTORIZAÇÃO (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: NORMALIZAÇÃO E VALIDAÇÕES
  -- --------------------------------------------------------------------------
  v_old_name := TRIM(COALESCE(p_old_name, ''));
  v_target_sigla := TRIM(UPPER(COALESCE(p_target_sigla, '')));

  IF v_old_name = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome de origem da unidade (p_old_name) é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF v_target_sigla = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A sigla de destino (p_target_sigla) é obrigatória.'
      USING ERRCODE = '22023';
  END IF;

  -- Verifica se o departamento de destino existe
  SELECT * INTO v_target_dep
  FROM public.internal_departments
  WHERE sigla = v_target_sigla;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_DEPARTMENT_NOT_FOUND: Departamento de destino com sigla "%" não encontrado.', v_target_sigla
      USING ERRCODE = 'P0002';
  END IF;

  -- Verifica se o departamento de destino está ativo
  IF NOT v_target_dep.ativo THEN
    RAISE EXCEPTION 'TARGET_DEPARTMENT_INACTIVE: Departamento de destino com sigla "%" está inativo.', v_target_sigla
      USING ERRCODE = '22023';
  END IF;

  -- Se origem e destino forem idênticos, nada a fazer
  IF v_old_name = v_target_sigla THEN
    RETURN jsonb_build_object(
      'success', true,
      'old_name', v_old_name,
      'target_sigla', v_target_sigla,
      'rows_updated', 0,
      'message', 'Origem e destino são idênticos. Nenhuma alteração realizada.'
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: ATUALIZAÇÃO ATÔMICA DAS ALOCAÇÕES
  -- --------------------------------------------------------------------------
  UPDATE public.arp_allocations
  SET
    unit_name = v_target_sigla,
    updated_at = NOW()
  WHERE unit_name = v_old_name;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- --------------------------------------------------------------------------
  -- PASSO 4: RETORNO DETERMINÍSTICO
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'old_name', v_old_name,
    'target_sigla', v_target_sigla,
    'rows_updated', v_rows_updated,
    'timestamp', NOW()
  );
END;
$$;
