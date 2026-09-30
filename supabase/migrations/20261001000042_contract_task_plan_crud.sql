-- ==============================================================================
-- MIGRATION 42: PLANO DE GESTÃO DO CONTRATO EDITÁVEL PELO GESTOR
-- Versão: 20261001000042_contract_task_plan_crud.sql
--
-- O Modelo de Gestão passa a ser apenas um FACILITADOR: o gestor pode iniciar
-- um plano vazio, criar/renomear/excluir etapas (macrotarefas) e tarefas, e
-- aplicar um modelo a qualquer momento (as tarefas do modelo são ACRESCENTADAS
-- ao plano existente, nunca sobrescrevem).
--
-- Responsável herdado: responsavel_nome NULL = "responsável é o gestor do
-- contrato" (contract_managers). O front resolve a herança na exibição, de modo
-- que a troca de gestor é acompanhada pelas tarefas sem reescrita de dados.
-- ==============================================================================

-- 1. ORIGEM DA TAREFA/ETAPA (rastreabilidade: veio do modelo ou foi criada pelo gestor)
ALTER TABLE public.contract_tasks
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'MODELO'
    CHECK (origem IN ('MODELO', 'PERSONALIZADA'));

ALTER TABLE public.contract_task_macrotasks
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'MODELO'
    CHECK (origem IN ('MODELO', 'PERSONALIZADA'));

-- 2. INICIAR PLANO VAZIO ("Começar do zero")
CREATE OR REPLACE FUNCTION public.start_contract_task_plan_atomic(
  p_uasg VARCHAR(10),
  p_numero VARCHAR(50),
  p_ano INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uasg VARCHAR(10);
  v_numero VARCHAR(50);
  v_contract_key VARCHAR(100);
  v_plan_id VARCHAR(60);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_uasg := TRIM(COALESCE(p_uasg, ''));
  v_numero := TRIM(COALESCE(p_numero, ''));
  IF v_uasg = '' OR v_numero = '' OR p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UASG, número e ano do contrato são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  v_contract_key := public.normalize_contract_key(v_uasg, v_numero, p_ano);

  IF EXISTS (SELECT 1 FROM public.contract_task_plans WHERE contract_key = v_contract_key) THEN
    RAISE EXCEPTION 'CONTRACT_PLAN_ALREADY_EXISTS: O contrato "%" já possui um plano de gestão aplicado.', v_contract_key
      USING ERRCODE = '23505';
  END IF;

  v_plan_id := 'plan-' || gen_random_uuid()::text;

  INSERT INTO public.contract_task_plans (id, contract_key, uasg, numero, ano, template_id, template_nome, applied_at)
  VALUES (v_plan_id, v_contract_key, v_uasg, v_numero, p_ano, NULL, 'Plano personalizado', NOW());

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'contract_key', v_contract_key,
    'template_nome', 'Plano personalizado',
    'timestamp', NOW()
  );
END;
$$;

-- 3. CRIAR / RENOMEAR ETAPA (macrotarefa) DO PLANO
CREATE OR REPLACE FUNCTION public.save_contract_task_macrotask_atomic(
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
    UPDATE public.contract_task_macrotasks SET nome = v_nome WHERE id = TRIM(p_id) RETURNING * INTO v_record;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Etapa com ID "%" não encontrada.', p_id USING ERRCODE = 'P0002';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_plans WHERE id = TRIM(COALESCE(p_plan_id, ''))) THEN
      RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Plano de gestão "%" não encontrado.', p_plan_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.contract_task_macrotasks (id, plan_id, nome, ordem, origem)
    VALUES (
      'ctmt-' || gen_random_uuid()::text,
      TRIM(p_plan_id),
      v_nome,
      COALESCE((SELECT MAX(ordem) + 1 FROM public.contract_task_macrotasks WHERE plan_id = TRIM(p_plan_id)), 0),
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

-- 4. EXCLUIR ETAPA (cascata remove as tarefas dela)
CREATE OR REPLACE FUNCTION public.delete_contract_task_macrotask_atomic(p_id VARCHAR(60))
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

  DELETE FROM public.contract_task_macrotasks WHERE id = TRIM(COALESCE(p_id, '')) RETURNING * INTO v_record;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Etapa com ID "%" não encontrada.', p_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_record.id, 'message', 'Etapa excluída com sucesso.');
END;
$$;

-- 5. CRIAR TAREFA AVULSA
CREATE OR REPLACE FUNCTION public.create_contract_task_atomic(
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

  IF NOT EXISTS (SELECT 1 FROM public.contract_task_macrotasks WHERE id = TRIM(COALESCE(p_macrotask_id, ''))) THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Etapa com ID "%" não encontrada.', p_macrotask_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.contract_tasks (
    id, macrotask_id, nome, ordem, status, responsavel_nome, prazo, observacao, origem, criado_em, atualizado_em
  )
  VALUES (
    'ctt-' || gen_random_uuid()::text,
    TRIM(p_macrotask_id),
    v_nome,
    COALESCE((SELECT MAX(ordem) + 1 FROM public.contract_tasks WHERE macrotask_id = TRIM(p_macrotask_id)), 0),
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

-- 6. EXCLUIR TAREFA
CREATE OR REPLACE FUNCTION public.delete_contract_task_atomic(p_id VARCHAR(60))
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

  DELETE FROM public.contract_tasks WHERE id = TRIM(COALESCE(p_id, '')) RETURNING * INTO v_record;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_record.id, 'message', 'Tarefa excluída com sucesso.');
END;
$$;

-- 7. update_contract_task_atomic: passa a aceitar p_nome (renomear) e a permitir
-- LIMPAR o responsável (p_responsavel_nome = '' volta a herdar o gestor do contrato).
-- NULL continua significando "manter valor atual".
DROP FUNCTION IF EXISTS public.update_contract_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID);

CREATE OR REPLACE FUNCTION public.update_contract_task_atomic(
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

  SELECT * INTO v_current FROM public.contract_tasks WHERE id = v_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', v_task_id
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

  UPDATE public.contract_tasks
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
      'responsavel_nome', v_record.responsavel_nome,
      'responsavel_user_id', v_record.responsavel_user_id,
      'prazo', v_record.prazo,
      'observacao', v_record.observacao,
      'execution_mode', v_record.execution_mode,
      'origem', v_record.origem,
      'criado_em', v_record.criado_em,
      'atualizado_em', v_record.atualizado_em,
      'concluido_em', v_record.concluido_em,
      'concluido_por', v_record.concluido_por
    )
  );
END;
$$;

-- 8. apply_contract_task_template_atomic: se o contrato já possui plano, as
-- etapas/tarefas do modelo são ACRESCENTADAS ao final (antes: erro
-- CONTRACT_PLAN_ALREADY_EXISTS). Sem plano, cria-o como antes.
CREATE OR REPLACE FUNCTION public.apply_contract_task_template_atomic(
  p_uasg VARCHAR(10),
  p_numero VARCHAR(50),
  p_ano INTEGER,
  p_template_id VARCHAR(60)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100);
  v_uasg VARCHAR(10);
  v_numero VARCHAR(50);
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

  v_uasg := TRIM(COALESCE(p_uasg, ''));
  v_numero := TRIM(COALESCE(p_numero, ''));

  IF v_uasg = '' OR v_numero = '' OR p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UASG, número e ano do contrato são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_template FROM public.contract_task_templates WHERE id = TRIM(COALESCE(p_template_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', p_template_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_template.ativo THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" está desativado e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_macrotasks WHERE template_id = v_template.id) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" não possui nenhuma macrotarefa e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  v_contract_key := public.normalize_contract_key(v_uasg, v_numero, p_ano);

  SELECT id INTO v_plan_id FROM public.contract_task_plans WHERE contract_key = v_contract_key;
  v_plan_exists := FOUND;

  IF v_plan_exists THEN
    SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_ordem_base
    FROM public.contract_task_macrotasks WHERE plan_id = v_plan_id;
  ELSE
    v_plan_id := 'plan-' || gen_random_uuid()::text;
    INSERT INTO public.contract_task_plans (id, contract_key, uasg, numero, ano, template_id, template_nome, applied_at)
    VALUES (v_plan_id, v_contract_key, v_uasg, v_numero, p_ano, v_template.id, v_template.nome, NOW());
  END IF;

  FOR v_macrotask IN
    SELECT * FROM public.contract_task_template_macrotasks
    WHERE template_id = v_template.id
    ORDER BY ordem ASC, created_at ASC
  LOOP
    v_new_macrotask_id := 'ctmt-' || gen_random_uuid()::text;

    INSERT INTO public.contract_task_macrotasks (id, plan_id, nome, ordem)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_ordem_base + v_macrotask.ordem);

    v_macrotasks_count := v_macrotasks_count + 1;

    FOR v_task IN
      SELECT * FROM public.contract_task_template_tasks
      WHERE macrotask_id = v_macrotask.id
      ORDER BY ordem ASC, created_at ASC
    LOOP
      INSERT INTO public.contract_tasks (id, macrotask_id, nome, ordem, status, execution_mode, criado_em, atualizado_em)
      VALUES ('ctt-' || gen_random_uuid()::text, v_new_macrotask_id, v_task.nome, v_task.ordem, 'PENDENTE', v_task.execution_mode, NOW(), NOW());

      v_tasks_count := v_tasks_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'contract_key', v_contract_key,
    'template_id', v_template.id,
    'template_nome', v_template.nome,
    'macrotasks_count', v_macrotasks_count,
    'tasks_count', v_tasks_count,
    'appended', v_plan_exists,
    'timestamp', NOW()
  );
END;
$$;

-- 9. GRANTS
REVOKE ALL ON FUNCTION public.start_contract_task_plan_atomic(VARCHAR, VARCHAR, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_contract_task_plan_atomic(VARCHAR, VARCHAR, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.save_contract_task_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_contract_task_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_contract_task_macrotask_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_macrotask_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.create_contract_task_atomic(VARCHAR, VARCHAR, DATE, TEXT, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contract_task_atomic(VARCHAR, VARCHAR, DATE, TEXT, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_contract_task_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.update_contract_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_contract_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR) TO authenticated;
