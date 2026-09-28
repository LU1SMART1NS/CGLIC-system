-- ==============================================================================
-- MIGRATION 21: PERSISTÊNCIA DE TaskExecutionMode — CGLIC-system 3.0
-- Versão: 20260927000021_task_execution_mode.sql
-- Fase: 10-A.2 — Implementação dos Pré-Requisitos de Automação
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P6 (Auditabilidade)
--
-- Contexto: TaskExecutionMode (INTERNA/EXTERNA/AUTOMATICA/CONFIRMACAO) já existia
-- como tipo TypeScript (src/types/index.ts) e nos catálogos em memória dos
-- workflows, mas nunca era persistido — a única via real de inserção em
-- contract_tasks (apply_contract_task_template_atomic, migration 14) nunca
-- gravava esse campo. Auditado e confirmado na Fase 10-A / 10-A.1.
--
-- Esta migration adiciona o campo canônico em contract_task_template_tasks
-- (origem, definida uma vez por template) e em contract_tasks (cópia feita no
-- momento da aplicação do template, exatamente como já se copia nome/ordem).
--
-- BACKFILL: aplicado SOMENTE ao novo template de pagamento (migration 22),
-- cuja fonte determinística 1:1 existe em
-- src/services/paymentFollowUpTemplateService.ts. Os 8 templates contratuais
-- já seedados (migration 19 — prorrogação/acréscimo/supressão/reajuste/
-- repactuação/alteração/encerramento/rescisão) permanecem com execution_mode
-- NULL: os nomes de tarefa seedados no banco não têm correspondência 1:1
-- determinística com os catálogos em memória usados nos cards de workflow
-- (contractProrrogationService.ts, contractAmendmentWorkflowService.ts etc. —
-- os textos divergem), então popular esses valores exigiria uma decisão de
-- negócio tarefa-a-tarefa, fora do escopo mecânico autorizado nesta fase.
-- GAP documentado no relatório de homologação da Fase 10-A.2.
-- ==============================================================================

-- 1. COLUNA CANÔNICA DE ORIGEM (template)
ALTER TABLE public.contract_task_template_tasks
  ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(20)
    CHECK (execution_mode IN ('INTERNA', 'EXTERNA', 'AUTOMATICA', 'CONFIRMACAO'));

-- 2. COLUNA CANÔNICA DE DESTINO (instância aplicada a um contrato/ciclo)
ALTER TABLE public.contract_tasks
  ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(20)
    CHECK (execution_mode IN ('INTERNA', 'EXTERNA', 'AUTOMATICA', 'CONFIRMACAO'));

-- 3. save_contract_task_template_task_atomic — aceita execution_mode opcional
-- (parâmetro novo acrescentado ao FINAL da assinatura, com DEFAULT NULL;
-- chamadas existentes via PostgREST usam argumentos nomeados, então nenhuma
-- chamada pré-existente quebra).
--
-- IMPORTANTE: um novo parâmetro muda a ASSINATURA (número de tipos) da
-- função — CREATE OR REPLACE por si só criaria um segundo overload em vez de
-- substituir a versão antiga. A antiga (4 parâmetros) é removida explicitamente
-- para não deixar duas versões coexistindo (evita ambiguidade de overload).
DROP FUNCTION IF EXISTS public.save_contract_task_template_task_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER);

CREATE OR REPLACE FUNCTION public.save_contract_task_template_task_atomic(
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
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_macrotasks WHERE id = v_macrotask_id) THEN
      RAISE EXCEPTION 'MACROTASK_NOT_FOUND: Macrotarefa com ID "%" não encontrada.', v_macrotask_id
        USING ERRCODE = 'P0002';
    END IF;

    v_id := 'tplt-' || gen_random_uuid()::text;

    INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, created_at, updated_at)
    VALUES (v_id, v_macrotask_id, v_nome, COALESCE(p_ordem, 0), v_execution_mode, NOW(), NOW())
    RETURNING id, macrotask_id, nome, ordem, execution_mode
    INTO v_record;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_tasks WHERE id = v_id) THEN
      RAISE EXCEPTION 'TEMPLATE_TASK_NOT_FOUND: Tarefa de template com ID "%" não encontrada.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.contract_task_template_tasks
    SET nome = v_nome,
        ordem = COALESCE(p_ordem, ordem),
        execution_mode = COALESCE(v_execution_mode, execution_mode),
        updated_at = NOW()
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

-- 4. apply_contract_task_template_atomic — passa a copiar execution_mode do
-- template para a instância (única alteração de comportamento: um SELECT/INSERT
-- a mais por campo; nenhuma regra de negócio pré-existente é alterada).
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

  v_contract_key := public.normalize_contract_key(v_uasg, v_numero, p_ano);

  IF EXISTS (SELECT 1 FROM public.contract_task_plans WHERE contract_key = v_contract_key) THEN
    RAISE EXCEPTION 'CONTRACT_PLAN_ALREADY_EXISTS: O contrato "%" já possui um plano de gestão aplicado.', v_contract_key
      USING ERRCODE = '23505';
  END IF;

  v_plan_id := 'plan-' || gen_random_uuid()::text;

  INSERT INTO public.contract_task_plans (id, contract_key, uasg, numero, ano, template_id, template_nome, applied_at)
  VALUES (v_plan_id, v_contract_key, v_uasg, v_numero, p_ano, v_template.id, v_template.nome, NOW());

  FOR v_macrotask IN
    SELECT * FROM public.contract_task_template_macrotasks
    WHERE template_id = v_template.id
    ORDER BY ordem ASC, created_at ASC
  LOOP
    v_new_macrotask_id := 'ctmt-' || gen_random_uuid()::text;

    INSERT INTO public.contract_task_macrotasks (id, plan_id, nome, ordem)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_macrotask.ordem);

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

  IF v_macrotasks_count = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" não possui nenhuma macrotarefa e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'contract_key', v_contract_key,
    'template_id', v_template.id,
    'template_nome', v_template.nome,
    'macrotasks_count', v_macrotasks_count,
    'tasks_count', v_tasks_count,
    'timestamp', NOW()
  );
END;
$$;

-- 5. GRANTS (repete o padrão já estabelecido na migration 14 — nenhuma
-- permissão nova é concedida além do que já existia para estas duas funções)
REVOKE ALL ON FUNCTION public.save_contract_task_template_task_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_contract_task_template_task_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR) TO authenticated;
