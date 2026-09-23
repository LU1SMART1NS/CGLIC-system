-- ==============================================================================
-- MIGRATION 14: RPCs TRANSACIONAIS DE GESTÃO DE CONTRATOS — SALDOARP 3.0
-- Versão: 20260922000014_rpc_contract_management.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P6 (Auditabilidade), P7 (Least Privilege)
-- ==============================================================================

-- ==============================================================================
-- 0. FUNÇÃO CANÔNICA: normalize_contract_key
-- ==============================================================================
-- Espelha, em SQL, EXATAMENTE a mesma regra de derivação de identidade de
-- contrato implementada em TypeScript em src/utils/contractKeyUtils.ts
-- (resolveContractKey). Ver esse arquivo para o raciocínio completo e para
-- a auditoria que motivou esta correção: o ano é derivado do NÚMERO do
-- contrato, nunca de data_assinatura/vigência — essa era a causa raiz de um
-- bug de identidade que afetava ~6% dos contratos reais da UG 200331
-- (ex.: "00052/2018" assinado em 2019-01-23 recebia incorretamente ano 2019).
--
-- Regras (idênticas ao TypeScript):
--   1. Nota de Empenho direta:   ^(\d{4})NE(\d+)$        -> {uasg}-NE{seq5}-{ano}
--   2. Contrato administrativo:  ^0*(\d{1,5})/(\d{2}|\d{4})$ -> {uasg}-{num5}-{ano4}
--      (ano de 2 dígitos é expandido para o século XXI: 2000-2099 — mesma
--      regra documentada em resolveContractKey/expandAno2Digitos)
--   3. Fallback: se nenhum padrão casar, usa p_ano_fallback (já validado
--      pelo chamador, ex.: p_ano das RPCs abaixo) e sanitiza o número
--      original (alfanumérico, maiúsculo, até 24 caracteres — sem
--      heurística de reagrupamento de dígitos).
--   4. Se nem o número nem p_ano_fallback permitirem montar uma chave,
--      levanta INVALID_CONTRACT_NUMBER (nunca inventa uma chave silenciosamente).
--
-- ATENÇÃO — assinatura NÃO é 1:1 com resolveContractKey (TypeScript):
-- p_ano_fallback é INTEGER (um ano já resolvido, ex.: 2000-2100), NUNCA uma
-- data bruta ("YYYY-MM-DD"). O equivalente TypeScript aceita OPCIONALMENTE
-- uma data ISO completa (fallbackDateRaw) porque também é usado em
-- contractService.ts para tentar aproveitar data_assinatura/vigencia_inicio
-- quando o número não basta. Aqui, ambas as RPCs que chamam esta função
-- (save_contract_manager_atomic, apply_contract_task_template_atomic) já
-- recebem `p_ano` como INTEGER validado (2000–2100) — nunca uma data — logo
-- não há necessidade (nem seria seguro) de fazer parsing de data em SQL.
-- Para o mesmo `numero`, com o mesmo ano já extraído, as duas
-- implementações produzem sempre a mesma chave final.
--
-- Função pura (sem acesso a tabelas), IMMUTABLE. Não recebe GRANT/REVOKE
-- explícitos — mesma convenção já usada para public.has_role() na migration 02.
-- Nota de segurança: por não ter REVOKE explícito, esta função É executável
-- por `anon` via PostgREST (assim como has_role()). Isso é seguro porque ela
-- não acessa nenhuma tabela e não expõe nenhum dado sensível — é apenas uma
-- transformação de string. As 9 RPCs de escrita que a chamam continuam
-- protegidas pelo próprio has_role(), verificado ANTES de qualquer uso desta
-- função (ver seções 1 e 8 abaixo).
CREATE OR REPLACE FUNCTION public.normalize_contract_key(
  p_uasg VARCHAR,
  p_numero VARCHAR,
  p_ano_fallback INTEGER DEFAULT NULL
)
RETURNS VARCHAR
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_uasg VARCHAR;
  v_numero VARCHAR;
  v_ne_match TEXT[];
  v_contrato_match TEXT[];
  v_ano VARCHAR;
  v_numero_canonico VARCHAR;
  v_seq INTEGER;
BEGIN
  v_uasg := regexp_replace(TRIM(COALESCE(p_uasg, '')), '\D', '', 'g');
  IF v_uasg = '' THEN
    v_uasg := '200331';
  END IF;

  v_numero := TRIM(COALESCE(p_numero, ''));
  IF v_numero = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_NUMBER: número do contrato ausente ou vazio.'
      USING ERRCODE = '22023';
  END IF;

  -- Formato 2: Nota de Empenho direta (AAAANEnnnnnn). NUNCA tratada como
  -- contrato administrativo "00000/AAAA" — a NE preserva sua própria
  -- identidade (prefixo "NE" + sequência).
  v_ne_match := regexp_match(v_numero, '^(\d{4})NE(\d+)$', 'i');
  IF v_ne_match IS NOT NULL THEN
    v_ano := v_ne_match[1];
    v_seq := v_ne_match[2]::INTEGER;
    v_numero_canonico := 'NE' || LPAD(v_seq::TEXT, 5, '0');
    RETURN v_uasg || '-' || v_numero_canonico || '-' || v_ano;
  END IF;

  -- Formato 1: contrato administrativo padrão NNNNN/AAAA (ou N/AA).
  v_contrato_match := regexp_match(v_numero, '^0*(\d{1,5})/(\d{2}|\d{4})$');
  IF v_contrato_match IS NOT NULL THEN
    v_ano := v_contrato_match[2];
    IF LENGTH(v_ano) = 2 THEN
      v_ano := '20' || v_ano;
    END IF;
    v_numero_canonico := LPAD(v_contrato_match[1], 5, '0');
    RETURN v_uasg || '-' || v_numero_canonico || '-' || v_ano;
  END IF;

  -- Fallback: o número não permite derivar o ano deterministicamente.
  -- Usa p_ano_fallback (já validado pelo chamador, ex.: 2000-2100) apenas
  -- como último recurso.
  IF p_ano_fallback IS NOT NULL THEN
    v_numero_canonico := UPPER(LEFT(regexp_replace(v_numero, '[^a-zA-Z0-9]', '', 'g'), 24));
    IF v_numero_canonico = '' THEN
      v_numero_canonico := 'INDETERMINADO';
    END IF;
    RETURN v_uasg || '-' || v_numero_canonico || '-' || p_ano_fallback::TEXT;
  END IF;

  -- Nem o número nem um ano de fallback permitem montar uma chave. Não
  -- inventamos silenciosamente.
  RAISE EXCEPTION 'INVALID_CONTRACT_NUMBER: não foi possível derivar o ano a partir do número "%" e nenhum ano de fallback foi informado.', v_numero
    USING ERRCODE = '22023';
END;
$$;

-- ==============================================================================
-- 1. FUNÇÃO RPC: save_contract_manager_atomic
-- ==============================================================================
-- Cria ou atualiza o Gestor de um contrato (upsert por contract_key).

CREATE OR REPLACE FUNCTION public.save_contract_manager_atomic(
  p_uasg VARCHAR(10),
  p_numero VARCHAR(50),
  p_ano INTEGER,
  p_gestor_nome VARCHAR(150)
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
  v_gestor_nome VARCHAR(150);
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_uasg := TRIM(COALESCE(p_uasg, ''));
  v_numero := TRIM(COALESCE(p_numero, ''));
  v_gestor_nome := TRIM(COALESCE(p_gestor_nome, ''));

  IF v_uasg = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O código da UASG é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF v_numero = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número do contrato é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O ano do contrato deve estar entre 2000 e 2100 (recebido: %).', p_ano
      USING ERRCODE = '22023';
  END IF;
  IF v_gestor_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do gestor é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_gestor_nome) > 150 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do gestor não pode exceder 150 caracteres.' USING ERRCODE = '22023';
  END IF;

  -- Identidade canônica: o ano vem do próprio v_numero quando possível
  -- (p_ano só é usado como fallback). Ver public.normalize_contract_key
  -- (seção 0 desta migration) e src/utils/contractKeyUtils.ts.
  v_contract_key := public.normalize_contract_key(v_uasg, v_numero, p_ano);

  INSERT INTO public.contract_managers (contract_key, uasg, numero, ano, gestor_nome, created_at, updated_at)
  VALUES (v_contract_key, v_uasg, v_numero, p_ano, v_gestor_nome, NOW(), NOW())
  ON CONFLICT (contract_key) DO UPDATE SET
    gestor_nome = EXCLUDED.gestor_nome,
    updated_at = NOW()
  RETURNING contract_key, uasg, numero, ano, gestor_nome, created_at, updated_at
  INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'manager', jsonb_build_object(
      'contract_key', v_record.contract_key,
      'uasg', v_record.uasg,
      'numero', v_record.numero,
      'ano', v_record.ano,
      'gestor_nome', v_record.gestor_nome,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

-- ==============================================================================
-- 2. FUNÇÃO RPC: save_contract_task_template_atomic
-- ==============================================================================
-- Cria ou atualiza o cabeçalho de um Template de Gestão Contratual.

CREATE OR REPLACE FUNCTION public.save_contract_task_template_atomic(
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
    IF EXISTS (SELECT 1 FROM public.contract_task_templates WHERE nome = v_nome) THEN
      RAISE EXCEPTION 'DUPLICATE_TEMPLATE: Já existe um template cadastrado com o nome "%".', v_nome
        USING ERRCODE = '23505';
    END IF;

    v_id := 'tpl-' || gen_random_uuid()::text;

    INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, created_at, updated_at)
    VALUES (v_id, v_nome, v_descricao, v_ativo, NOW(), NOW())
    RETURNING id, nome, descricao, ativo, created_at, updated_at
    INTO v_record;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_templates WHERE id = v_id) THEN
      RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', v_id
        USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (SELECT 1 FROM public.contract_task_templates WHERE nome = v_nome AND id <> v_id) THEN
      RAISE EXCEPTION 'DUPLICATE_TEMPLATE: Já existe outro template cadastrado com o nome "%".', v_nome
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.contract_task_templates
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
-- 3. FUNÇÃO RPC: delete_contract_task_template_atomic
-- ==============================================================================
-- Exclui um template e suas macrotarefas/tarefas (cascade). Planos já aplicados
-- a contratos não são afetados (template_id vira NULL via ON DELETE SET NULL).

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

-- ==============================================================================
-- 4. FUNÇÃO RPC: save_contract_task_template_macrotask_atomic
-- ==============================================================================

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

-- ==============================================================================
-- 5. FUNÇÃO RPC: delete_contract_task_template_macrotask_atomic
-- ==============================================================================

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

-- ==============================================================================
-- 6. FUNÇÃO RPC: save_contract_task_template_task_atomic
-- ==============================================================================

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

-- ==============================================================================
-- 7. FUNÇÃO RPC: delete_contract_task_template_task_atomic
-- ==============================================================================

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

-- ==============================================================================
-- 8. FUNÇÃO RPC: apply_contract_task_template_atomic
-- ==============================================================================
-- Aplica um template a um contrato: cria o plano e copia (por valor) todas as
-- macrotarefas e tarefas do template para o contrato, de forma atômica.
-- Após esta operação, o plano do contrato é INDEPENDENTE do template de origem.

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

  -- Identidade canônica: o ano vem do próprio v_numero quando possível
  -- (p_ano só é usado como fallback). Ver public.normalize_contract_key
  -- (seção 0 desta migration) e src/utils/contractKeyUtils.ts.
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
      INSERT INTO public.contract_tasks (id, macrotask_id, nome, ordem, status, criado_em, atualizado_em)
      VALUES ('ctt-' || gen_random_uuid()::text, v_new_macrotask_id, v_task.nome, v_task.ordem, 'PENDENTE', NOW(), NOW());

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

-- ==============================================================================
-- 9. FUNÇÃO RPC: update_contract_task_atomic
-- ==============================================================================
-- Atualiza status, responsável, prazo e observação de UMA tarefa já aplicada a um
-- contrato. Ao transicionar para CONCLUIDA, registra concluido_em/concluido_por
-- automaticamente; ao sair de CONCLUIDA, limpa esses campos.

CREATE OR REPLACE FUNCTION public.update_contract_task_atomic(
  p_task_id VARCHAR(60),
  p_status VARCHAR(20) DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_prazo DATE DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_concluido_por VARCHAR(150) DEFAULT NULL
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

  SELECT * INTO v_current FROM public.contract_tasks WHERE id = v_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', v_task_id
      USING ERRCODE = 'P0002';
  END IF;

  v_status := TRIM(COALESCE(p_status, v_current.status));
  IF v_status NOT IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL') THEN
    RAISE EXCEPTION 'INVALID_TASK_STATUS: Status de tarefa inválido ("%"). Valores permitidos: PENDENTE, EM_ANDAMENTO, CONCLUIDA, NAO_APLICAVEL.', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.contract_tasks
  SET
    status = v_status,
    responsavel_nome = COALESCE(NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), responsavel_nome),
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
-- 10. HARDENING DE PRIVILÉGIOS DE ROTINA (EXECUTE GRANTS)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.save_contract_manager_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_contract_manager_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.save_contract_task_template_atomic(VARCHAR, VARCHAR, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_contract_task_template_atomic(VARCHAR, VARCHAR, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_contract_task_template_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.save_contract_task_template_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_contract_task_template_macrotask_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_contract_task_template_macrotask_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_macrotask_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.save_contract_task_template_task_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_contract_task_template_task_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_contract_task_template_task_atomic(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_contract_task_template_task_atomic(VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_contract_task_template_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.update_contract_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_contract_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR) TO authenticated;
