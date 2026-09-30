-- ==============================================================================
-- MIGRATION 43: PLANO DE GESTÃO DA ATA EDITÁVEL PELO GESTOR
-- Versão: 20261001000043_ata_task_plan_crud.sql
--
-- Espelho da migration 42 (contratos) para Atas: o Modelo de Gestão é apenas um
-- facilitador; o gestor cria/renomeia/exclui etapas e tarefas, pode iniciar o
-- plano do zero e aplicar modelos que são ACRESCENTADOS ao plano existente.
-- responsavel_nome NULL = responsável herdado (gestor da Ata, ata_managers).
-- ==============================================================================

ALTER TABLE public.ata_tasks
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'MODELO'
    CHECK (origem IN ('MODELO', 'PERSONALIZADA'));

ALTER TABLE public.ata_task_macrotasks
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'MODELO'
    CHECK (origem IN ('MODELO', 'PERSONALIZADA'));

-- 1. INICIAR PLANO VAZIO
CREATE OR REPLACE FUNCTION public.start_ata_task_plan_atomic(p_ata_key VARCHAR(50))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata_key VARCHAR(50);
  v_plan_id VARCHAR(60);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_ata_key := TRIM(COALESCE(p_ata_key, ''));
  IF v_ata_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número da Ata é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ata_task_plans WHERE ata_key = v_ata_key) THEN
    RAISE EXCEPTION 'ATA_PLAN_ALREADY_EXISTS: A Ata "%" já possui um plano de gestão aplicado.', v_ata_key
      USING ERRCODE = '23505';
  END IF;

  v_plan_id := 'ataplan-' || gen_random_uuid()::text;

  INSERT INTO public.ata_task_plans (id, ata_key, template_id, template_nome, applied_at)
  VALUES (v_plan_id, v_ata_key, NULL, 'Plano personalizado', NOW());

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'ata_key', v_ata_key,
    'template_nome', 'Plano personalizado',
    'timestamp', NOW()
  );
END;
$$;

-- 2. CRIAR / RENOMEAR ETAPA
CREATE OR REPLACE FUNCTION public.save_ata_task_macrotask_atomic(
  p_id VARCHAR(60) DEFAULT NULL,
  p_plan_id VARCHAR(60) DEFAULT NULL,
  p_nome VARCHAR(200) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome VARCHAR(200);
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_nome := TRIM(COALESCE(p_nome, ''));
  IF v_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome da etapa é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL AND TRIM(p_id) <> '' THEN
    UPDATE public.ata_task_macrotasks SET nome = v_nome WHERE id = TRIM(p_id) RETURNING * INTO v_record;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Etapa com ID "%" não encontrada.', p_id USING ERRCODE = 'P0002';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.ata_task_plans WHERE id = TRIM(COALESCE(p_plan_id, ''))) THEN
      RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Plano de gestão "%" não encontrado.', p_plan_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.ata_task_macrotasks (id, plan_id, nome, ordem, origem)
    VALUES (
      'atmt-' || gen_random_uuid()::text,
      TRIM(p_plan_id),
      v_nome,
      COALESCE((SELECT MAX(ordem) + 1 FROM public.ata_task_macrotasks WHERE plan_id = TRIM(p_plan_id)), 0),
      'PERSONALIZADA'
    )
    RETURNING * INTO v_record;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'macrotask', jsonb_build_object(
      'id', v_record.id, 'plan_id', v_record.plan_id, 'nome', v_record.nome,
      'ordem', v_record.ordem, 'origem', v_record.origem
    )
  );
END;
$$;

-- 3. EXCLUIR ETAPA (cascata remove as tarefas dela)
CREATE OR REPLACE FUNCTION public.delete_ata_task_macrotask_atomic(p_id VARCHAR(60))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.ata_task_macrotasks WHERE id = TRIM(COALESCE(p_id, '')) RETURNING * INTO v_record;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Etapa com ID "%" não encontrada.', p_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_record.id, 'message', 'Etapa excluída com sucesso.');
END;
$$;

-- 4. CRIAR TAREFA AVULSA
CREATE OR REPLACE FUNCTION public.create_ata_task_atomic(
  p_macrotask_id VARCHAR(60),
  p_nome VARCHAR(300),
  p_prazo DATE DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome VARCHAR(300);
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_nome := TRIM(COALESCE(p_nome, ''));
  IF v_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome da tarefa é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ata_task_macrotasks WHERE id = TRIM(COALESCE(p_macrotask_id, ''))) THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Etapa com ID "%" não encontrada.', p_macrotask_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.ata_tasks (
    id, macrotask_id, nome, ordem, status, responsavel_nome, prazo, observacao, origem, criado_em, atualizado_em
  )
  VALUES (
    'at-' || gen_random_uuid()::text,
    TRIM(p_macrotask_id),
    v_nome,
    COALESCE((SELECT MAX(ordem) + 1 FROM public.ata_tasks WHERE macrotask_id = TRIM(p_macrotask_id)), 0),
    'PENDENTE',
    NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''),
    p_prazo,
    NULLIF(TRIM(COALESCE(p_observacao, '')), ''),
    'PERSONALIZADA',
    NOW(),
    NOW()
  )
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'task', jsonb_build_object(
      'id', v_record.id, 'macrotask_id', v_record.macrotask_id, 'nome', v_record.nome,
      'ordem', v_record.ordem, 'status', v_record.status, 'origem', v_record.origem
    )
  );
END;
$$;

-- 5. EXCLUIR TAREFA
CREATE OR REPLACE FUNCTION public.delete_ata_task_atomic(p_id VARCHAR(60))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.ata_tasks WHERE id = TRIM(COALESCE(p_id, '')) RETURNING * INTO v_record;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_record.id, 'message', 'Tarefa excluída com sucesso.');
END;
$$;

-- 6. update_ata_task_atomic: aceita p_nome e permite limpar o responsável ('' = volta a herdar o gestor)
DROP FUNCTION IF EXISTS public.update_ata_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID);

CREATE OR REPLACE FUNCTION public.update_ata_task_atomic(
  p_task_id VARCHAR(60),
  p_status VARCHAR(20) DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_prazo DATE DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_concluido_por VARCHAR(150) DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL,
  p_nome VARCHAR(300) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task_id VARCHAR(60);
  v_status VARCHAR(20);
  v_current RECORD;
  v_record RECORD;
  v_clear_responsavel BOOLEAN;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_task_id := TRIM(COALESCE(p_task_id, ''));
  IF v_task_id = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O ID da tarefa é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current FROM public.ata_tasks WHERE id = v_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', v_task_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_nome IS NOT NULL AND TRIM(p_nome) = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome da tarefa não pode ficar vazio.' USING ERRCODE = '22023';
  END IF;

  v_status := TRIM(COALESCE(p_status, v_current.status));
  IF v_status NOT IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL') THEN
    RAISE EXCEPTION 'INVALID_TASK_STATUS: Status de tarefa inválido ("%"). Valores permitidos: PENDENTE, EM_ANDAMENTO, CONCLUIDA, NAO_APLICAVEL.', v_status
      USING ERRCODE = '22023';
  END IF;

  v_clear_responsavel := p_responsavel_nome IS NOT NULL AND TRIM(p_responsavel_nome) = '';

  UPDATE public.ata_tasks
  SET
    nome = COALESCE(NULLIF(TRIM(COALESCE(p_nome, '')), ''), nome),
    status = v_status,
    responsavel_nome = CASE
      WHEN p_responsavel_nome IS NULL THEN responsavel_nome
      ELSE NULLIF(TRIM(p_responsavel_nome), '')
    END,
    responsavel_user_id = CASE
      WHEN v_clear_responsavel THEN NULL
      ELSE COALESCE(p_responsavel_user_id, responsavel_user_id)
    END,
    prazo = COALESCE(p_prazo, prazo),
    observacao = CASE WHEN p_observacao IS NULL THEN observacao ELSE NULLIF(TRIM(p_observacao), '') END,
    atualizado_em = NOW(),
    concluido_em = CASE
      WHEN v_status = 'CONCLUIDA' AND v_current.status <> 'CONCLUIDA' THEN NOW()
      WHEN v_status <> 'CONCLUIDA' THEN NULL
      ELSE concluido_em
    END,
    concluido_por = CASE
      WHEN v_status = 'CONCLUIDA' AND v_current.status <> 'CONCLUIDA'
        THEN COALESCE(NULLIF(TRIM(COALESCE(p_concluido_por, '')), ''), NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), responsavel_nome)
      WHEN v_status <> 'CONCLUIDA' THEN NULL
      ELSE concluido_por
    END
  WHERE id = v_task_id
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'task', jsonb_build_object(
      'id', v_record.id,
      'macrotask_id', v_record.macrotask_id,
      'nome', v_record.nome,
      'ordem', v_record.ordem,
      'status', v_record.status,
      'execution_mode', v_record.execution_mode,
      'responsavel_nome', v_record.responsavel_nome,
      'responsavel_user_id', v_record.responsavel_user_id,
      'prazo', v_record.prazo,
      'observacao', v_record.observacao,
      'origem', v_record.origem,
      'criado_em', v_record.criado_em,
      'atualizado_em', v_record.atualizado_em,
      'concluido_em', v_record.concluido_em,
      'concluido_por', v_record.concluido_por
    )
  );
END;
$$;

-- 7. apply_ata_task_template_atomic: com plano existente, ACRESCENTA as etapas/tarefas do modelo
CREATE OR REPLACE FUNCTION public.apply_ata_task_template_atomic(
  p_ata_key VARCHAR(50),
  p_template_id VARCHAR(60)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata_key VARCHAR(50);
  v_template RECORD;
  v_plan_id VARCHAR(60);
  v_plan_exists BOOLEAN;
  v_ordem_base INTEGER := 0;
  v_macrotask RECORD;
  v_new_macrotask_id VARCHAR(60);
  v_task RECORD;
  v_macrotasks_count INTEGER := 0;
  v_tasks_count INTEGER := 0;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_ata_key := TRIM(COALESCE(p_ata_key, ''));
  IF v_ata_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número da Ata é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_template FROM public.ata_task_templates WHERE id = TRIM(COALESCE(p_template_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', p_template_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_template.ativo THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" está desativado e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ata_task_template_macrotasks WHERE template_id = v_template.id) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" não possui nenhuma macrotarefa e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_plan_id FROM public.ata_task_plans WHERE ata_key = v_ata_key;
  v_plan_exists := FOUND;

  IF v_plan_exists THEN
    SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_ordem_base
    FROM public.ata_task_macrotasks WHERE plan_id = v_plan_id;
  ELSE
    v_plan_id := 'ataplan-' || gen_random_uuid()::text;
    INSERT INTO public.ata_task_plans (id, ata_key, template_id, template_nome, applied_at)
    VALUES (v_plan_id, v_ata_key, v_template.id, v_template.nome, NOW());
  END IF;

  FOR v_macrotask IN
    SELECT * FROM public.ata_task_template_macrotasks
    WHERE template_id = v_template.id
    ORDER BY ordem ASC, created_at ASC
  LOOP
    v_new_macrotask_id := 'atmt-' || gen_random_uuid()::text;

    INSERT INTO public.ata_task_macrotasks (id, plan_id, nome, ordem)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_ordem_base + v_macrotask.ordem);

    v_macrotasks_count := v_macrotasks_count + 1;

    FOR v_task IN
      SELECT * FROM public.ata_task_template_tasks
      WHERE macrotask_id = v_macrotask.id
      ORDER BY ordem ASC, created_at ASC
    LOOP
      INSERT INTO public.ata_tasks (id, macrotask_id, nome, ordem, status, execution_mode, criado_em, atualizado_em)
      VALUES ('at-' || gen_random_uuid()::text, v_new_macrotask_id, v_task.nome, v_task.ordem, 'PENDENTE', v_task.execution_mode, NOW(), NOW());

      v_tasks_count := v_tasks_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'ata_key', v_ata_key,
    'template_id', v_template.id,
    'template_nome', v_template.nome,
    'macrotasks_count', v_macrotasks_count,
    'tasks_count', v_tasks_count,
    'appended', v_plan_exists,
    'timestamp', NOW()
  );
END;
$$;

-- 8. GRANTS
REVOKE ALL ON FUNCTION public.start_ata_task_plan_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_ata_task_plan_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.save_ata_task_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ata_task_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_ata_task_macrotask_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ata_task_macrotask_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.create_ata_task_atomic(VARCHAR, VARCHAR, DATE, TEXT, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ata_task_atomic(VARCHAR, VARCHAR, DATE, TEXT, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_ata_task_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ata_task_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.update_ata_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ata_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_ata_task_template_atomic(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_ata_task_template_atomic(VARCHAR, VARCHAR) TO authenticated;
