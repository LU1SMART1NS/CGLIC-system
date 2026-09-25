-- ==============================================================================
-- MIGRATION 27: FASE 2B-3 — MIGRAÇÃO DE save_internal_department_atomic E
-- delete_internal_department_atomic PARA has_permission()
-- ==============================================================================
-- Escopo estrito desta migration: SOMENTE estas duas RPCs de administração do
-- catálogo de departamentos. Nenhuma outra RPC é tocada —
-- merge_internal_department_allocations_atomic (que também mexe em
-- departamentos, mas cuja responsabilidade é de alocação de saldo, não de
-- administração do catálogo de unidades) permanece em has_role() e será
-- migrada separadamente, para allocations.manage, não aqui.
-- save_allocations_atomic, save_empenho_links_atomic, contratos, financeiro
-- e SEI também não são tocados.
--
-- O QUE MUDA: só a autorização, e só a de permission — SEM escopo adicional.
--   ANTES: has_role('gestor') OR has_role('admin')
--   DEPOIS: has_permission('departments.manage')
--
-- Por que sem escopo (auditoria da seção 2 desta fase): a Fase 1
-- (20260925000023_rbac_foundation_phase1.sql) definiu role_domain_scopes
-- apenas para os domínios 'contracts' e 'allocations' — departments nunca
-- teve um role_domain_scopes, e isso foi deliberado (administrar o catálogo
-- de departamentos afeta o compartilhado inteiro, não faz sentido restringir
-- por unidade/ATA). Confirmado também no comportamento atual das duas RPCs:
-- nenhuma delas jamais filtrou por unidade/ATA do chamador — apenas
-- has_role('gestor' OR 'admin'), tudo ou nada. has_permission('departments.manage')
-- reproduz exatamente esse "tudo ou nada" sem inventar um scope novo, uma
-- tabela nova ou uma role nova, como pedido.
--
-- `financial.manage` e `allocations.manage` NÃO são aceitos como
-- autorização suficiente para estas duas RPCs (testado explicitamente).
--
-- Todo o restante de cada função (validações, unicidade de sigla,
-- integridade referencial com arp_allocations, INSERT/UPDATE, soft-delete
-- vs. hard-delete, retorno) é cópia exata de
-- 20260918000009_department_authority.sql, sem alteração de negócio.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. save_internal_department_atomic
-- ------------------------------------------------------------------------------
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
  -- PASSO 1: AUTORIZAÇÃO — permission (Fase 2B-3: a checagem antiga baseada
  -- em roles foi substituída por has_permission('departments.manage'); sem
  -- escopo adicional nesta fase — ver justificativa no cabeçalho da migration)
  -- --------------------------------------------------------------------------
  IF NOT public.has_permission('departments.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a usuários com a permissão departments.manage.'
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

REVOKE ALL ON FUNCTION public.save_internal_department_atomic(VARCHAR, VARCHAR, VARCHAR, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_internal_department_atomic(VARCHAR, VARCHAR, VARCHAR, TEXT, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. delete_internal_department_atomic
-- ------------------------------------------------------------------------------
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
  -- PASSO 1: AUTORIZAÇÃO — permission (Fase 2B-3: mesma substituição de
  -- save_internal_department_atomic, sem escopo adicional)
  -- --------------------------------------------------------------------------
  IF NOT public.has_permission('departments.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a usuários com a permissão departments.manage.'
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

REVOKE ALL ON FUNCTION public.delete_internal_department_atomic(VARCHAR, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_internal_department_atomic(VARCHAR, BOOLEAN) TO authenticated;
