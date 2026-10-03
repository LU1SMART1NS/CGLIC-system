-- ==============================================================================
-- MIGRATION 64: NOME DO MÓDULO DO PLANO DE GESTÃO (contratos e atas)
-- Versão: 20261003000064_task_plan_module_nome.sql
--
-- O nome do módulo já é gravado por valor em modulo_nome (migration 44). Esta migration:
--   1. permite informar o nome do módulo ao aplicar um modelo (p_modulo_nome, opcional;
--      sem ele vale o nome do modelo, como antes). Serve para reaplicar o mesmo modelo
--      com nome próprio, ex.: "2º Termo aditivo";
--   2. cria a RPC de renomear um módulo já aplicado.
-- A assinatura das RPCs de aplicação muda (parâmetro novo): a antiga é removida para não
-- deixar duas versões ambíguas.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR);
DROP FUNCTION IF EXISTS public.apply_ata_task_template_atomic(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.apply_contract_task_template_atomic(
  p_uasg VARCHAR(10),
  p_numero VARCHAR(50),
  p_ano INTEGER,
  p_template_id VARCHAR(60),
  p_modulo_nome VARCHAR(200) DEFAULT NULL
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
  v_modulo_id VARCHAR(60) := 'mod-' || gen_random_uuid()::text;
  v_modulo_nome VARCHAR(200);
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

  v_modulo_nome := COALESCE(NULLIF(TRIM(COALESCE(p_modulo_nome, '')), ''), v_template.nome);

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

    INSERT INTO public.contract_task_macrotasks (id, plan_id, nome, ordem, modulo_id, modulo_template_id, modulo_nome, modulo_applied_at)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_ordem_base + v_macrotask.ordem, v_modulo_id, v_template.id, v_modulo_nome, NOW());

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
    'modulo_id', v_modulo_id,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_ata_task_template_atomic(
  p_ata_key VARCHAR(50),
  p_template_id VARCHAR(60),
  p_modulo_nome VARCHAR(200) DEFAULT NULL
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
  v_modulo_id VARCHAR(60) := 'mod-' || gen_random_uuid()::text;
  v_modulo_nome VARCHAR(200);
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

  v_modulo_nome := COALESCE(NULLIF(TRIM(COALESCE(p_modulo_nome, '')), ''), v_template.nome);

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

    INSERT INTO public.ata_task_macrotasks (id, plan_id, nome, ordem, modulo_id, modulo_template_id, modulo_nome, modulo_applied_at)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_ordem_base + v_macrotask.ordem, v_modulo_id, v_template.id, v_modulo_nome, NOW());

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
    'modulo_id', v_modulo_id,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ata_task_template_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_ata_task_template_atomic(VARCHAR, VARCHAR, VARCHAR) TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_contract_task_module_atomic(p_plan_id VARCHAR(60), p_modulo_id VARCHAR(60), p_nome VARCHAR(200))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_nome VARCHAR(200) := TRIM(COALESCE(p_nome, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF TRIM(COALESCE(p_plan_id, '')) = '' OR TRIM(COALESCE(p_modulo_id, '')) = '' OR v_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Plano, módulo e nome são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contract_task_macrotasks
  SET modulo_nome = v_nome
  WHERE plan_id = TRIM(p_plan_id) AND modulo_id = TRIM(p_modulo_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Módulo "%" não encontrado neste plano.', p_modulo_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', TRIM(p_modulo_id), 'nome', v_nome,
    'message', 'Módulo renomeado com sucesso.');
END;
$$;

REVOKE ALL ON FUNCTION public.rename_contract_task_module_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_contract_task_module_atomic(VARCHAR, VARCHAR, VARCHAR) TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_ata_task_module_atomic(p_plan_id VARCHAR(60), p_modulo_id VARCHAR(60), p_nome VARCHAR(200))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_nome VARCHAR(200) := TRIM(COALESCE(p_nome, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF TRIM(COALESCE(p_plan_id, '')) = '' OR TRIM(COALESCE(p_modulo_id, '')) = '' OR v_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Plano, módulo e nome são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ata_task_macrotasks
  SET modulo_nome = v_nome
  WHERE plan_id = TRIM(p_plan_id) AND modulo_id = TRIM(p_modulo_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Módulo "%" não encontrado neste plano.', p_modulo_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', TRIM(p_modulo_id), 'nome', v_nome,
    'message', 'Módulo renomeado com sucesso.');
END;
$$;

REVOKE ALL ON FUNCTION public.rename_ata_task_module_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_ata_task_module_atomic(VARCHAR, VARCHAR, VARCHAR) TO authenticated;
