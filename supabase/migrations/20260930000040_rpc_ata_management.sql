-- ==============================================================================
-- MIGRATION 40: RPCs TRANSACIONAIS DE MODELOS DE GESTÃO DE ATAS — CGLIC-system 3.0
-- Versão: 20260930000040_rpc_ata_management.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P6 (Auditabilidade), P7 (Least Privilege)
--
-- Espelha 1:1 a lógica de public.apply_contract_task_template_atomic e demais
-- RPCs de contract_task_templates (migration 14, consolidada com as correções
-- das migrations 21/23) para o domínio de Atas. Diferença: como ata_key já é
-- uma chave estável e natural (o próprio número da Ata — mesma convenção de
-- public.ata_managers, migration 38), NÃO há necessidade de nenhuma função
-- equivalente a normalize_contract_key — os RPCs recebem p_ata_key diretamente.
-- ==============================================================================

-- ==============================================================================
-- 1. FUNÇÃO RPC: save_ata_task_template_atomic
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_ata_task_template_atomic(
  p_id VARCHAR(60) DEFAULT NULL,
  p_nome VARCHAR(200) DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(60);
  v_nome VARCHAR(200);
  v_descricao TEXT;
  v_ativo BOOLEAN;
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_nome := TRIM(COALESCE(p_nome, ''));
  v_descricao := NULLIF(TRIM(COALESCE(p_descricao, '')), '');
  v_ativo := COALESCE(p_ativo, TRUE);

  IF v_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do template é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_nome) > 200 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do template não pode exceder 200 caracteres.' USING ERRCODE = '22023';
  END IF;

  v_id := NULLIF(TRIM(COALESCE(p_id, '')), '');

  IF v_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.ata_task_templates WHERE nome = v_nome) THEN
      RAISE EXCEPTION 'DUPLICATE_TEMPLATE: Já existe um template cadastrado com o nome "%".', v_nome
        USING ERRCODE = '23505';
    END IF;

    v_id := 'atatpl-' || gen_random_uuid()::text;

    INSERT INTO public.ata_task_templates (id, nome, descricao, ativo, created_at, updated_at)
    VALUES (v_id, v_nome, v_descricao, v_ativo, NOW(), NOW())
    RETURNING id, nome, descricao, ativo, created_at, updated_at
    INTO v_record;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.ata_task_templates WHERE id = v_id) THEN
      RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (SELECT 1 FROM public.ata_task_templates WHERE nome = v_nome AND id <> v_id) THEN
      RAISE EXCEPTION 'DUPLICATE_TEMPLATE: Já existe outro template cadastrado com o nome "%".', v_nome
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.ata_task_templates
    SET nome = v_nome, descricao = v_descricao, ativo = v_ativo, updated_at = NOW()
    WHERE id = v_id
    RETURNING id, nome, descricao, ativo, created_at, updated_at
    INTO v_record;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'template', jsonb_build_object(
      'id', v_record.id,
      'nome', v_record.nome,
      'descricao', v_record.descricao,
      'ativo', v_record.ativo,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

-- ==============================================================================
-- 2. FUNÇÃO RPC: delete_ata_task_template_atomic
-- ==============================================================================
-- Exclui um template e suas macrotarefas/tarefas (cascade). Planos já aplicados
-- a Atas não são afetados (template_id vira NULL via ON DELETE SET NULL).

CREATE OR REPLACE FUNCTION public.delete_ata_task_template_atomic(
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

  SELECT * INTO v_tpl FROM public.ata_task_templates WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.ata_task_templates WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'nome', v_tpl.nome,
    'message', 'Template excluído com sucesso.'
  );
END;
$$;

-- ==============================================================================
-- 3. FUNÇÃO RPC: save_ata_task_template_macrotask_atomic
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_ata_task_template_macrotask_atomic(
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
    IF NOT EXISTS (SELECT 1 FROM public.ata_task_templates WHERE id = v_template_id) THEN
      RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', v_template_id
        USING ERRCODE = 'P0002';
    END IF;

    v_id := 'atatplmt-' || gen_random_uuid()::text;

    INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at)
    VALUES (v_id, v_template_id, v_nome, COALESCE(p_ordem, 0), NOW(), NOW())
    RETURNING id, template_id, nome, ordem
    INTO v_record;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.ata_task_template_macrotasks WHERE id = v_id) THEN
      RAISE EXCEPTION 'MACROTASK_NOT_FOUND: Macrotarefa com ID "%" não encontrada.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.ata_task_template_macrotasks
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

-- ==============================================================================
-- 4. FUNÇÃO RPC: delete_ata_task_template_macrotask_atomic
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_ata_task_template_macrotask_atomic(
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
  IF NOT EXISTS (SELECT 1 FROM public.ata_task_template_macrotasks WHERE id = v_id) THEN
    RAISE EXCEPTION 'MACROTASK_NOT_FOUND: Macrotarefa com ID "%" não encontrada.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.ata_task_template_macrotasks WHERE id = v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'message', 'Macrotarefa excluída com sucesso.');
END;
$$;

-- ==============================================================================
-- 5. FUNÇÃO RPC: save_ata_task_template_task_atomic
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_ata_task_template_task_atomic(
  p_id VARCHAR(60) DEFAULT NULL,
  p_macrotask_id VARCHAR(60) DEFAULT NULL,
  p_nome VARCHAR(300) DEFAULT NULL,
  p_ordem INTEGER DEFAULT 0,
  p_execution_mode VARCHAR(20) DEFAULT NULL
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
  v_execution_mode VARCHAR(20);
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_id := NULLIF(TRIM(COALESCE(p_id, '')), '');
  v_macrotask_id := TRIM(COALESCE(p_macrotask_id, ''));
  v_nome := TRIM(COALESCE(p_nome, ''));
  v_execution_mode := NULLIF(TRIM(COALESCE(p_execution_mode, '')), '');

  IF v_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome da tarefa é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF v_execution_mode IS NOT NULL AND v_execution_mode NOT IN ('INTERNA', 'EXTERNA', 'AUTOMATICA', 'CONFIRMACAO') THEN
    RAISE EXCEPTION 'INVALID_EXECUTION_MODE: Modo de execução inválido ("%"). Valores permitidos: INTERNA, EXTERNA, AUTOMATICA, CONFIRMACAO.', v_execution_mode
      USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF v_macrotask_id = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O macrotask_id é obrigatório ao criar uma tarefa.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ata_task_template_macrotasks WHERE id = v_macrotask_id) THEN
      RAISE EXCEPTION 'MACROTASK_NOT_FOUND: Macrotarefa com ID "%" não encontrada.', v_macrotask_id
        USING ERRCODE = 'P0002';
    END IF;

    v_id := 'atatplt-' || gen_random_uuid()::text;

    INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, created_at, updated_at)
    VALUES (v_id, v_macrotask_id, v_nome, COALESCE(p_ordem, 0), v_execution_mode, NOW(), NOW())
    RETURNING id, macrotask_id, nome, ordem, execution_mode
    INTO v_record;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.ata_task_template_tasks WHERE id = v_id) THEN
      RAISE EXCEPTION 'TEMPLATE_TASK_NOT_FOUND: Tarefa de template com ID "%" não encontrada.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.ata_task_template_tasks
    SET nome = v_nome, ordem = COALESCE(p_ordem, ordem), execution_mode = COALESCE(v_execution_mode, execution_mode), updated_at = NOW()
    WHERE id = v_id
    RETURNING id, macrotask_id, nome, ordem, execution_mode
    INTO v_record;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'task', jsonb_build_object(
      'id', v_record.id,
      'macrotask_id', v_record.macrotask_id,
      'nome', v_record.nome,
      'ordem', v_record.ordem,
      'execution_mode', v_record.execution_mode
    )
  );
END;
$$;

-- ==============================================================================
-- 6. FUNÇÃO RPC: delete_ata_task_template_task_atomic
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_ata_task_template_task_atomic(
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
  IF NOT EXISTS (SELECT 1 FROM public.ata_task_template_tasks WHERE id = v_id) THEN
    RAISE EXCEPTION 'TEMPLATE_TASK_NOT_FOUND: Tarefa de template com ID "%" não encontrada.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.ata_task_template_tasks WHERE id = v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'message', 'Tarefa excluída com sucesso.');
END;
$$;

-- ==============================================================================
-- 7. FUNÇÃO RPC: apply_ata_task_template_atomic
-- ==============================================================================
-- Aplica um template a uma Ata: cria o plano e copia (por valor) todas as
-- macrotarefas e tarefas do template para a Ata, de forma atômica. Após esta
-- operação, o plano da Ata é INDEPENDENTE do template de origem.
--
-- Diferença em relação a apply_contract_task_template_atomic: recebe p_ata_key
-- diretamente (o número da Ata já É a chave estável — mesma convenção de
-- ata_managers), sem nenhuma função de normalização de identidade.

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

  IF EXISTS (SELECT 1 FROM public.ata_task_plans WHERE ata_key = v_ata_key) THEN
    RAISE EXCEPTION 'ATA_PLAN_ALREADY_EXISTS: A Ata "%" já possui um plano de gestão aplicado.', v_ata_key
      USING ERRCODE = '23505';
  END IF;

  v_plan_id := 'ataplan-' || gen_random_uuid()::text;

  INSERT INTO public.ata_task_plans (id, ata_key, template_id, template_nome, applied_at)
  VALUES (v_plan_id, v_ata_key, v_template.id, v_template.nome, NOW());

  FOR v_macrotask IN
    SELECT * FROM public.ata_task_template_macrotasks
    WHERE template_id = v_template.id
    ORDER BY ordem ASC, created_at ASC
  LOOP
    v_new_macrotask_id := 'atmt-' || gen_random_uuid()::text;

    INSERT INTO public.ata_task_macrotasks (id, plan_id, nome, ordem)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_macrotask.ordem);

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

  IF v_macrotasks_count = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" não possui nenhuma macrotarefa e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'ata_key', v_ata_key,
    'template_id', v_template.id,
    'template_nome', v_template.nome,
    'macrotasks_count', v_macrotasks_count,
    'tasks_count', v_tasks_count,
    'timestamp', NOW()
  );
END;
$$;

-- ==============================================================================
-- 8. FUNÇÃO RPC: update_ata_task_atomic
-- ==============================================================================
-- Atualiza status, responsável, prazo e observação de UMA tarefa já aplicada a
-- uma Ata. Ao transicionar para CONCLUIDA, registra concluido_em/concluido_por
-- automaticamente; ao sair de CONCLUIDA, limpa esses campos.

CREATE OR REPLACE FUNCTION public.update_ata_task_atomic(
  p_task_id VARCHAR(60),
  p_status VARCHAR(20) DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_prazo DATE DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_concluido_por VARCHAR(150) DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL
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

  v_status := TRIM(COALESCE(p_status, v_current.status));
  IF v_status NOT IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL') THEN
    RAISE EXCEPTION 'INVALID_TASK_STATUS: Status de tarefa inválido ("%"). Valores permitidos: PENDENTE, EM_ANDAMENTO, CONCLUIDA, NAO_APLICAVEL.', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.ata_tasks
  SET
    status = v_status,
    responsavel_nome = COALESCE(NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), responsavel_nome),
    responsavel_user_id = COALESCE(p_responsavel_user_id, responsavel_user_id),
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
      'criado_em', v_record.criado_em,
      'atualizado_em', v_record.atualizado_em,
      'concluido_em', v_record.concluido_em,
      'concluido_por', v_record.concluido_por
    )
  );
END;
$$;

-- ==============================================================================
-- 9. HARDENING DE PRIVILÉGIOS DE ROTINA (EXECUTE GRANTS)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.save_ata_task_template_atomic(VARCHAR, VARCHAR, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ata_task_template_atomic(VARCHAR, VARCHAR, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_ata_task_template_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ata_task_template_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.save_ata_task_template_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ata_task_template_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_ata_task_template_macrotask_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ata_task_template_macrotask_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.save_ata_task_template_task_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ata_task_template_task_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_ata_task_template_task_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ata_task_template_task_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_ata_task_template_atomic(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_ata_task_template_atomic(VARCHAR, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.update_ata_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ata_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID) TO authenticated;
