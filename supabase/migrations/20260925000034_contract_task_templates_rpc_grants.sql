-- ==============================================================================
-- MIGRATION 20: RPCs E PERMISSÕES DE GESTÃO DE TEMPLATES DE TAREFAS
-- Versão: 20260925000020_contract_task_templates_rpc_grants.sql
-- Invariantes: P1 (SSOT), P2 (Idempotência), P3 (Database Integrity), P6 (Auditabilidade)
-- Garante a criação de RPCs atômicas para Macrotarefas e Tarefas e seus privilégios de execução.
-- ==============================================================================

-- 1. Excluir Template Atômico
CREATE OR REPLACE FUNCTION public.delete_contract_task_template_atomic(
  p_id VARCHAR(60)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(60);
  v_tpl RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_id := TRIM(COALESCE(p_id, ''));
  IF v_id = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O ID do template é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tpl FROM public.contract_task_templates WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.contract_task_templates WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'nome', v_tpl.nome,
    'message', 'Template excluído com sucesso.'
  );
END;
$$;

-- 2. Salvar Macrotarefa de Template Atômico
CREATE OR REPLACE FUNCTION public.save_contract_task_template_macrotask_atomic(
  p_id VARCHAR(60) DEFAULT NULL,
  p_template_id VARCHAR(60) DEFAULT NULL,
  p_nome VARCHAR(200) DEFAULT NULL,
  p_ordem INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(60);
  v_template_id VARCHAR(60);
  v_nome VARCHAR(200);
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_id := NULLIF(TRIM(COALESCE(p_id, '')), '');
  v_template_id := TRIM(COALESCE(p_template_id, ''));
  v_nome := TRIM(COALESCE(p_nome, ''));

  IF v_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome da macrotarefa é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF v_template_id = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O template_id é obrigatório ao criar uma macrotarefa.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_templates WHERE id = v_template_id) THEN
      RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', v_template_id
        USING ERRCODE = 'P0002';
    END IF;

    v_id := 'tplmt-' || gen_random_uuid()::text;

    INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at)
    VALUES (v_id, v_template_id, v_nome, COALESCE(p_ordem, 0), NOW(), NOW())
    RETURNING id, template_id, nome, ordem
    INTO v_record;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_macrotasks WHERE id = v_id) THEN
      RAISE EXCEPTION 'MACROTASK_NOT_FOUND: Macrotarefa com ID "%" não encontrada.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.contract_task_template_macrotasks
    SET nome = v_nome, ordem = COALESCE(p_ordem, ordem), updated_at = NOW()
    WHERE id = v_id
    RETURNING id, template_id, nome, ordem
    INTO v_record;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'macrotask', jsonb_build_object(
      'id', v_record.id,
      'template_id', v_record.template_id,
      'nome', v_record.nome,
      'ordem', v_record.ordem
    )
  );
END;
$$;

-- 3. Excluir Macrotarefa de Template Atômico
CREATE OR REPLACE FUNCTION public.delete_contract_task_template_macrotask_atomic(
  p_id VARCHAR(60)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(60);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_id := TRIM(COALESCE(p_id, ''));
  IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_macrotasks WHERE id = v_id) THEN
    RAISE EXCEPTION 'MACROTASK_NOT_FOUND: Macrotarefa com ID "%" não encontrada.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.contract_task_template_macrotasks WHERE id = v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'message', 'Macrotarefa excluída com sucesso.');
END;
$$;

-- 4. Salvar Tarefa de Template Atômico
CREATE OR REPLACE FUNCTION public.save_contract_task_template_task_atomic(
  p_id VARCHAR(60) DEFAULT NULL,
  p_macrotask_id VARCHAR(60) DEFAULT NULL,
  p_nome VARCHAR(300) DEFAULT NULL,
  p_ordem INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(60);
  v_macrotask_id VARCHAR(60);
  v_nome VARCHAR(300);
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_id := NULLIF(TRIM(COALESCE(p_id, '')), '');
  v_macrotask_id := TRIM(COALESCE(p_macrotask_id, ''));
  v_nome := TRIM(COALESCE(p_nome, ''));

  IF v_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome da tarefa é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF v_macrotask_id = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O macrotask_id é obrigatório ao criar uma tarefa.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_macrotasks WHERE id = v_macrotask_id) THEN
      RAISE EXCEPTION 'MACROTASK_NOT_FOUND: Macrotarefa com ID "%" não encontrada.', v_macrotask_id
        USING ERRCODE = 'P0002';
    END IF;

    v_id := 'tplt-' || gen_random_uuid()::text;

    INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, created_at, updated_at)
    VALUES (v_id, v_macrotask_id, v_nome, COALESCE(p_ordem, 0), NOW(), NOW())
    RETURNING id, macrotask_id, nome, ordem
    INTO v_record;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_tasks WHERE id = v_id) THEN
      RAISE EXCEPTION 'TEMPLATE_TASK_NOT_FOUND: Tarefa de template com ID "%" não encontrada.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.contract_task_template_tasks
    SET nome = v_nome, ordem = COALESCE(p_ordem, ordem), updated_at = NOW()
    WHERE id = v_id
    RETURNING id, macrotask_id, nome, ordem
    INTO v_record;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'task', jsonb_build_object(
      'id', v_record.id,
      'macrotask_id', v_record.macrotask_id,
      'nome', v_record.nome,
      'ordem', v_record.ordem
    )
  );
END;
$$;

-- 5. Excluir Tarefa de Template Atômico
CREATE OR REPLACE FUNCTION public.delete_contract_task_template_task_atomic(
  p_id VARCHAR(60)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(60);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_id := TRIM(COALESCE(p_id, ''));
  IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_tasks WHERE id = v_id) THEN
    RAISE EXCEPTION 'TEMPLATE_TASK_NOT_FOUND: Tarefa de template com ID "%" não encontrada.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.contract_task_template_tasks WHERE id = v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'message', 'Tarefa excluída com sucesso.');
END;
$$;

-- 6. Hardening e Permissões de Execução
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_atomic(VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_contract_task_template_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_macrotask_atomic(VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_contract_task_template_task_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_task_atomic(VARCHAR) TO anon, authenticated;
