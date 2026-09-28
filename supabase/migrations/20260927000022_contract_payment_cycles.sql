-- ==============================================================================
-- MIGRATION 22: PERSISTÊNCIA CANÔNICA DO CICLO OPERACIONAL DE PAGAMENTOS/CGOFI
-- Versão: 20260927000022_contract_payment_cycles.sql
-- Fase: 10-A.2 — Implementação dos Pré-Requisitos de Automação
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade),
--              P6 (Auditabilidade), P7 (Least Privilege)
--
-- Contexto: até esta migration, o ciclo de acompanhamento de pagamento/
-- faturamento/CGOFI (PaymentFollowUpCycle) existia SOMENTE em localStorage do
-- navegador (useContractPaymentFollowUp.ts) — auditado e confirmado nas Fases
-- 10-A e 10-A.1. Esta tabela é o "acompanhamento operacional" (ciclo de
-- faturamento/atesto/pagamento) e NUNCA o fato financeiro oficial:
--
--   contract_payment_cycles  = acompanhamento operacional (este arquivo)
--   empenhos / v_empenhos_resumo (migration 16/18) = fato financeiro soberano
--
-- Esta tabela NÃO altera, não recalcula e não substitui empenhado/liquidado/
-- pago/saldo financeiro oficial — apenas referencia o empenho de lastro por
-- chave (empenho_canonical_key), sem nenhuma FK física para as tabelas de
-- empenho (que são fato soberano, fora do escopo de escrita desta RPC).
--
-- CHAVE DE IDEMPOTÊNCIA: cycle_key, computada por public.build_payment_cycle_key,
-- espelho exato (mesma sanitização, mesma ordem de operações) da função
-- TypeScript já existente e testada buildPaymentCycleKey
-- (src/services/paymentFollowUpService.ts). Formato:
--   {contractKeySanitizado}-PGTO-{competenciaAAAAMM}-{documentoAtestoSanitizado}
--
-- O documento de atesto FAZ parte da chave (não apenas contrato+competência):
-- confirmado que esta já era a convenção estabelecida no tipo
-- PaymentFollowUpCycle.cycleKey antes desta migration — necessário para
-- permitir reemissão de atesto (novo documento) dentro da mesma competência
-- sem colidir com o ciclo anterior.
-- ==============================================================================

-- 1. TABELA DO CICLO OPERACIONAL
CREATE TABLE IF NOT EXISTS public.contract_payment_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_key VARCHAR(180) NOT NULL UNIQUE,
  contract_key VARCHAR(150) NOT NULL,
  competencia VARCHAR(7) NOT NULL,

  -- Referência ao empenho de lastro por CHAVE (não FK física — empenhos são
  -- fato soberano gerido exclusivamente por empenhoSyncService/RPCs M17;
  -- esta tabela nunca escreve nem lê diretamente as tabelas de empenho).
  empenho_canonical_key VARCHAR(150),

  -- Referências reais a processos SEI já existentes (reaproveita a chave
  -- natural já usada por processos_sei, sem duplicar dado).
  numero_processo_pagamento_sei VARCHAR(50) REFERENCES public.processos_sei(numero_processo_sei),
  numero_processo_contrato_sei VARCHAR(50) REFERENCES public.processos_sei(numero_processo_sei),

  documento_atesto_sei VARCHAR(100) NOT NULL,
  documento_despacho_sei VARCHAR(100),
  numero_ordem_bancaria VARCHAR(60),
  numero_notas_fiscais INTEGER CHECK (numero_notas_fiscais IS NULL OR numero_notas_fiscais >= 0),
  valor_atesto NUMERIC(18, 4) NOT NULL CHECK (valor_atesto >= 0),

  data_assinatura_atesto DATE NOT NULL,
  data_vencimento_fatura DATE NOT NULL,
  data_envio_cgofi DATE,
  data_ordem_bancaria DATE,

  status VARCHAR(30) NOT NULL DEFAULT 'RECEBIDO'
    CHECK (status IN (
      'RECEBIDO', 'ATRIBUIDO', 'EM_INSTRUCAO', 'PENDENTE_DOCUMENTACAO',
      'DESPACHO_ELABORADO', 'ENVIADO_CGOFI', 'AGUARDANDO_CGOFI',
      'DEVOLVIDO_FISCAL', 'PAGAMENTO_CONFIRMADO', 'CONCLUIDO', 'CANCELADO'
    )),

  -- Identidade dos responsáveis: TEXTO LIVRE (compatibilidade/legado) +
  -- ponte de identidade opcional (Fase 10-A.2, ver Seção 9 do relatório).
  -- USER_ID é a identidade canônica quando preenchida; TEXT é informação
  -- legada/humana, sempre presente para os casos (hoje a maioria) em que o
  -- responsável não possui conta ativa no sistema.
  titular_nome VARCHAR(150),
  responsavel_nome VARCHAR(150),
  responsavel_user_id UUID REFERENCES auth.users(id),

  observacoes TEXT,

  -- Distingue fato registrado manualmente pelo servidor (hoje, sempre) de um
  -- eventual fato futuro capturado de fonte oficial — nunca presumir
  -- "OFICIAL" para dado hoje inserido manualmente pela RPC abaixo.
  origem_dado VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (origem_dado IN ('MANUAL', 'OFICIAL')),

  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  concluido_por VARCHAR(150)
);

CREATE INDEX IF NOT EXISTS idx_contract_payment_cycles_contract_key ON public.contract_payment_cycles (contract_key);
CREATE INDEX IF NOT EXISTS idx_contract_payment_cycles_competencia ON public.contract_payment_cycles (competencia);
CREATE INDEX IF NOT EXISTS idx_contract_payment_cycles_status ON public.contract_payment_cycles (status);

-- 2. RLS — mais restritiva que o padrão legado ("Public Read ... USING (true)"
-- usado em contract_tasks/contract_managers/etc.): dado operacional de
-- pagamento é mais sensível, então a leitura é restrita a usuários
-- AUTENTICADOS com algum papel válido (leitor/gestor/admin), nunca a `anon`.
-- Escopo por contrato/unidade específico NÃO existe hoje em NENHUMA tabela do
-- sistema (GAP arquitetural já documentado na Fase 10-A/10-A.1) — não
-- inventamos aqui uma política de escopo que o restante do sistema não
-- suporta; a mitigação real (RLS por contrato) é um GAP explícito, não uma
-- falsa promessa de política permissiva copiada sem análise.
ALTER TABLE public.contract_payment_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated Read: contract_payment_cycles"
  ON public.contract_payment_cycles
  FOR SELECT
  TO authenticated
  USING (
    public.has_role('leitor') OR public.has_role('gestor') OR public.has_role('admin')
  );

-- 3. AUDITORIA — reaproveita o trigger genérico já existente
DROP TRIGGER IF EXISTS trg_audit_contract_payment_cycles ON public.contract_payment_cycles;
CREATE TRIGGER trg_audit_contract_payment_cycles
AFTER INSERT OR UPDATE OR DELETE ON public.contract_payment_cycles
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ==============================================================================
-- 4. FUNÇÃO: build_payment_cycle_key
-- ==============================================================================
-- Espelho EXATO, em SQL, de buildPaymentCycleKey (src/services/paymentFollowUpService.ts).
-- Mesma ordem de sanitização, mesmos fallbacks — ver comentário de topo desta
-- migration. Função pura (sem acesso a tabelas), IMMUTABLE.
CREATE OR REPLACE FUNCTION public.build_payment_cycle_key(
  p_contract_key VARCHAR,
  p_competencia VARCHAR,
  p_documento_atesto VARCHAR
)
RETURNS VARCHAR
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_contract VARCHAR;
  v_comp VARCHAR;
  v_doc VARCHAR;
BEGIN
  v_contract := regexp_replace(COALESCE(NULLIF(TRIM(p_contract_key), ''), 'UNKNOWN'), '[^a-zA-Z0-9_-]', '-', 'g');

  v_comp := LEFT(regexp_replace(COALESCE(NULLIF(TRIM(p_competencia), ''), 'GERAL'), '[^0-9]', '', 'g'), 6);
  IF v_comp = '' THEN
    v_comp := 'GERAL';
  END IF;

  v_doc := UPPER(regexp_replace(COALESCE(NULLIF(TRIM(p_documento_atesto), ''), 'ATESTO'), '[^a-zA-Z0-9]', '', 'g'));

  RETURN v_contract || '-PGTO-' || v_comp || '-' || v_doc;
END;
$$;

-- ==============================================================================
-- 5. FUNÇÃO INTERNA REAPROVEITÁVEL: apply_contract_task_template_to_key_atomic
-- ==============================================================================
-- Mesma lógica de cópia (por valor) de apply_contract_task_template_atomic
-- (migration 14/21), mas recebendo o contract_key diretamente em vez de
-- derivá-lo via normalize_contract_key — necessário porque a chave de um
-- ciclo de pagamento (cycle_key) não segue o formato de número de contrato
-- (NNNNN/AAAA) que normalize_contract_key sabe interpretar.
--
-- NÃO cria um segundo sistema de tarefas: reutiliza integralmente
-- contract_task_plans/contract_task_macrotasks/contract_tasks. Reutilizada
-- por create_payment_cycle_atomic (seção 6) e exposta também de forma
-- independente para permitir, no futuro, aplicar QUALQUER template ativo a
-- uma chave arbitrária (não apenas o template padrão de pagamento).
CREATE OR REPLACE FUNCTION public.apply_contract_task_template_to_key_atomic(
  p_contract_key VARCHAR(100),
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

  v_contract_key := TRIM(COALESCE(p_contract_key, ''));
  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chave do plano é obrigatória.' USING ERRCODE = '22023';
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

  IF EXISTS (SELECT 1 FROM public.contract_task_plans WHERE contract_key = v_contract_key) THEN
    RAISE EXCEPTION 'CONTRACT_PLAN_ALREADY_EXISTS: A chave "%" já possui um plano de gestão aplicado.', v_contract_key
      USING ERRCODE = '23505';
  END IF;

  v_plan_id := 'plan-' || gen_random_uuid()::text;

  INSERT INTO public.contract_task_plans (id, contract_key, uasg, numero, ano, template_id, template_nome, applied_at)
  VALUES (v_plan_id, v_contract_key, TRIM(COALESCE(p_uasg, '')), TRIM(COALESCE(p_numero, '')), p_ano, v_template.id, v_template.nome, NOW());

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

-- ==============================================================================
-- 6. FUNÇÃO RPC: create_payment_cycle_atomic
-- ==============================================================================
-- Cria um ciclo operacional de pagamento e, por padrão, aplica automaticamente
-- o template padrão de acompanhamento de pagamento (mesmo comportamento hoje
-- existente no cliente — registerPaymentCycle/buildPaymentFollowUpTemplate —
-- porém agora persistido). Idempotente por cycle_key: uma segunda chamada com
-- os mesmos contrato+competência+documento retorna erro claro em vez de criar
-- um ciclo duplicado.
CREATE OR REPLACE FUNCTION public.create_payment_cycle_atomic(
  p_contract_key VARCHAR(150),
  p_competencia VARCHAR(7),
  p_documento_atesto_sei VARCHAR(100),
  p_data_assinatura_atesto DATE,
  p_data_vencimento_fatura DATE,
  p_valor_atesto NUMERIC(18, 4),
  p_empenho_canonical_key VARCHAR(150) DEFAULT NULL,
  p_numero_processo_pagamento_sei VARCHAR(50) DEFAULT NULL,
  p_numero_processo_contrato_sei VARCHAR(50) DEFAULT NULL,
  p_numero_notas_fiscais INTEGER DEFAULT NULL,
  p_titular_nome VARCHAR(150) DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_apply_task_template BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150);
  v_competencia VARCHAR(7);
  v_documento VARCHAR(100);
  v_cycle_key VARCHAR(180);
  v_id UUID;
  v_uasg VARCHAR(10);
  v_ano INTEGER;
  v_plan_result JSONB;
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_contract_key := TRIM(COALESCE(p_contract_key, ''));
  v_competencia := TRIM(COALESCE(p_competencia, ''));
  v_documento := TRIM(COALESCE(p_documento_atesto_sei, ''));

  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chave do contrato (contract_key) é obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF v_competencia !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A competência deve estar no formato YYYY-MM ("%" informado).', p_competencia
      USING ERRCODE = '22023';
  END IF;
  IF v_documento = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O documento de atesto SEI é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF p_data_assinatura_atesto IS NULL OR p_data_vencimento_fatura IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Data de assinatura do atesto e data de vencimento da fatura são obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF p_valor_atesto IS NULL OR p_valor_atesto < 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O valor do atesto é obrigatório e não pode ser negativo.' USING ERRCODE = '22023';
  END IF;

  IF p_numero_processo_pagamento_sei IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.processos_sei WHERE numero_processo_sei = TRIM(p_numero_processo_pagamento_sei)
  ) THEN
    RAISE EXCEPTION 'PROCESS_SEI_NOT_FOUND: Processo SEI de pagamento "%" não encontrado.', p_numero_processo_pagamento_sei
      USING ERRCODE = 'P0002';
  END IF;
  IF p_numero_processo_contrato_sei IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.processos_sei WHERE numero_processo_sei = TRIM(p_numero_processo_contrato_sei)
  ) THEN
    RAISE EXCEPTION 'PROCESS_SEI_NOT_FOUND: Processo SEI de contrato "%" não encontrado.', p_numero_processo_contrato_sei
      USING ERRCODE = 'P0002';
  END IF;

  v_cycle_key := public.build_payment_cycle_key(v_contract_key, v_competencia, v_documento);

  IF EXISTS (SELECT 1 FROM public.contract_payment_cycles WHERE cycle_key = v_cycle_key) THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_ALREADY_EXISTS: Já existe um ciclo de pagamento para este contrato, competência e documento de atesto ("%").', v_cycle_key
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.contract_payment_cycles (
    cycle_key, contract_key, competencia, empenho_canonical_key,
    numero_processo_pagamento_sei, numero_processo_contrato_sei,
    documento_atesto_sei, numero_notas_fiscais, valor_atesto,
    data_assinatura_atesto, data_vencimento_fatura,
    titular_nome, responsavel_nome, responsavel_user_id, observacoes,
    origem_dado, status
  ) VALUES (
    v_cycle_key, v_contract_key, v_competencia, NULLIF(TRIM(COALESCE(p_empenho_canonical_key, '')), ''),
    NULLIF(TRIM(COALESCE(p_numero_processo_pagamento_sei, '')), ''), NULLIF(TRIM(COALESCE(p_numero_processo_contrato_sei, '')), ''),
    v_documento, p_numero_notas_fiscais, p_valor_atesto,
    p_data_assinatura_atesto, p_data_vencimento_fatura,
    NULLIF(TRIM(COALESCE(p_titular_nome, '')), ''), NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), p_responsavel_user_id, NULLIF(TRIM(COALESCE(p_observacoes, '')), ''),
    'MANUAL', 'RECEBIDO'
  )
  RETURNING * INTO v_record;

  v_plan_result := NULL;
  IF COALESCE(p_apply_task_template, TRUE) THEN
    -- Deriva uasg/ano apenas para preenchimento descritivo de contract_task_plans
    -- (colunas NOT NULL da tabela compartilhada) — não é usado para nenhuma
    -- regra de negócio; a identidade real do plano é o cycle_key.
    -- LEFT(...,10): contract_task_plans.uasg é VARCHAR(10) — truncar em vez de
    -- falhar caso o contract_key não siga o formato {uasg}-{numero}-{ano}
    -- (ex.: uma chave de contrato malformada/atípica). uasg aqui é só metadado
    -- descritivo do plano de tarefas, nunca usado em regra de negócio.
    v_uasg := LEFT(COALESCE(NULLIF(split_part(v_contract_key, '-', 1), ''), '000000'), 10);
    v_ano := COALESCE(NULLIF(LEFT(v_competencia, 4), '')::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER);

    IF EXISTS (SELECT 1 FROM public.contract_task_templates WHERE id = 'tpl-acompanhamento-pagamento-14133' AND ativo) THEN
      v_plan_result := public.apply_contract_task_template_to_key_atomic(
        v_cycle_key, v_uasg, v_documento, v_ano, 'tpl-acompanhamento-pagamento-14133'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_record.id,
      'cycle_key', v_record.cycle_key,
      'contract_key', v_record.contract_key,
      'competencia', v_record.competencia,
      'status', v_record.status,
      'criado_em', v_record.criado_em
    ),
    'task_plan', v_plan_result
  );
END;
$$;

-- ==============================================================================
-- 7. FUNÇÃO RPC: update_payment_cycle_atomic
-- ==============================================================================
-- Atualiza campos operacionais e/ou status de um ciclo já existente
-- (identificado por cycle_key). Ao transicionar para CONCLUIDO, registra
-- concluido_em/concluido_por automaticamente — mesmo padrão de
-- update_contract_task_atomic (migration 14).
CREATE OR REPLACE FUNCTION public.update_payment_cycle_atomic(
  p_cycle_key VARCHAR(180),
  p_status VARCHAR(30) DEFAULT NULL,
  p_documento_despacho_sei VARCHAR(100) DEFAULT NULL,
  p_data_envio_cgofi DATE DEFAULT NULL,
  p_numero_ordem_bancaria VARCHAR(60) DEFAULT NULL,
  p_data_ordem_bancaria DATE DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_concluido_por VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle_key VARCHAR(180);
  v_status VARCHAR(30);
  v_current RECORD;
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_cycle_key := TRIM(COALESCE(p_cycle_key, ''));
  IF v_cycle_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chave do ciclo (cycle_key) é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current FROM public.contract_payment_cycles WHERE cycle_key = v_cycle_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_NOT_FOUND: Ciclo de pagamento "%" não encontrado.', v_cycle_key
      USING ERRCODE = 'P0002';
  END IF;

  v_status := TRIM(COALESCE(p_status, v_current.status));
  IF v_status NOT IN (
    'RECEBIDO', 'ATRIBUIDO', 'EM_INSTRUCAO', 'PENDENTE_DOCUMENTACAO',
    'DESPACHO_ELABORADO', 'ENVIADO_CGOFI', 'AGUARDANDO_CGOFI',
    'DEVOLVIDO_FISCAL', 'PAGAMENTO_CONFIRMADO', 'CONCLUIDO', 'CANCELADO'
  ) THEN
    RAISE EXCEPTION 'INVALID_CYCLE_STATUS: Status de ciclo inválido ("%").', v_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.contract_payment_cycles
  SET
    status = v_status,
    documento_despacho_sei = COALESCE(NULLIF(TRIM(COALESCE(p_documento_despacho_sei, '')), ''), documento_despacho_sei),
    data_envio_cgofi = COALESCE(p_data_envio_cgofi, data_envio_cgofi),
    numero_ordem_bancaria = COALESCE(NULLIF(TRIM(COALESCE(p_numero_ordem_bancaria, '')), ''), numero_ordem_bancaria),
    data_ordem_bancaria = COALESCE(p_data_ordem_bancaria, data_ordem_bancaria),
    responsavel_nome = COALESCE(NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), responsavel_nome),
    responsavel_user_id = COALESCE(p_responsavel_user_id, responsavel_user_id),
    observacoes = CASE WHEN p_observacoes IS NULL THEN observacoes ELSE NULLIF(TRIM(p_observacoes), '') END,
    atualizado_em = NOW(),
    concluido_em = CASE
      WHEN v_status IN ('CONCLUIDO', 'CANCELADO') AND v_current.status NOT IN ('CONCLUIDO', 'CANCELADO') THEN NOW()
      WHEN v_status NOT IN ('CONCLUIDO', 'CANCELADO') THEN NULL
      ELSE concluido_em
    END,
    concluido_por = CASE
      WHEN v_status IN ('CONCLUIDO', 'CANCELADO') AND v_current.status NOT IN ('CONCLUIDO', 'CANCELADO')
        THEN COALESCE(NULLIF(TRIM(COALESCE(p_concluido_por, '')), ''), NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), responsavel_nome)
      WHEN v_status NOT IN ('CONCLUIDO', 'CANCELADO') THEN NULL
      ELSE concluido_por
    END
  WHERE cycle_key = v_cycle_key
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_record.id,
      'cycle_key', v_record.cycle_key,
      'contract_key', v_record.contract_key,
      'competencia', v_record.competencia,
      'status', v_record.status,
      'documento_despacho_sei', v_record.documento_despacho_sei,
      'data_envio_cgofi', v_record.data_envio_cgofi,
      'numero_ordem_bancaria', v_record.numero_ordem_bancaria,
      'data_ordem_bancaria', v_record.data_ordem_bancaria,
      'responsavel_nome', v_record.responsavel_nome,
      'responsavel_user_id', v_record.responsavel_user_id,
      'observacoes', v_record.observacoes,
      'atualizado_em', v_record.atualizado_em,
      'concluido_em', v_record.concluido_em,
      'concluido_por', v_record.concluido_por
    )
  );
END;
$$;

-- ==============================================================================
-- 8. GRANTS
-- ==============================================================================
REVOKE ALL ON FUNCTION public.build_payment_cycle_key(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.build_payment_cycle_key(VARCHAR, VARCHAR, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_contract_task_template_to_key_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_contract_task_template_to_key_atomic(VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.create_payment_cycle_atomic(
  VARCHAR, VARCHAR, VARCHAR, DATE, DATE, NUMERIC, VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR, UUID, TEXT, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_cycle_atomic(
  VARCHAR, VARCHAR, VARCHAR, DATE, DATE, NUMERIC, VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR, UUID, TEXT, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.update_payment_cycle_atomic(
  VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, DATE, VARCHAR, UUID, TEXT, VARCHAR
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_payment_cycle_atomic(
  VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, DATE, VARCHAR, UUID, TEXT, VARCHAR
) TO authenticated;

-- ==============================================================================
-- 9. SEED: TEMPLATE PADRÃO DE ACOMPANHAMENTO DE PAGAMENTO (COM execution_mode)
-- ==============================================================================
-- Espelho 1:1 de buildPaymentFollowUpTemplate
-- (src/services/paymentFollowUpTemplateService.ts) — única fonte determinística
-- usada para backfill de execution_mode nesta fase (ver migration 21).
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, created_at, updated_at)
VALUES (
  'tpl-acompanhamento-pagamento-14133',
  'Workflow de Acompanhamento de Pagamento (Faturamento)',
  'Roteiro instrutório e checklist operacional de conferência de atesto, envio à CGOFI e monitoramento de prazos.',
  true, NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  ativo = EXCLUDED.ativo,
  updated_at = NOW();

INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at)
VALUES
  ('macro-pgto-1', 'tpl-acompanhamento-pagamento-14133', '1. Recepção e Atribuição do Atesto', 1, NOW(), NOW()),
  ('macro-pgto-2', 'tpl-acompanhamento-pagamento-14133', '2. Instrução Processual e Conformidade Fiscal', 2, NOW(), NOW()),
  ('macro-pgto-3', 'tpl-acompanhamento-pagamento-14133', '3. Encaminhamento à CGOFI', 3, NOW(), NOW()),
  ('macro-pgto-4', 'tpl-acompanhamento-pagamento-14133', '4. Acompanhamento e Controle de Prazos', 4, NOW(), NOW()),
  ('macro-pgto-5', 'tpl-acompanhamento-pagamento-14133', '5. Confirmação e Encerramento', 5, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  template_id = EXCLUDED.template_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();

INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, created_at, updated_at)
VALUES
  ('task-pgto-1-1', 'macro-pgto-1', 'Conferir conformidade formal do Termo de Atesto e dados das Notas Fiscais', 1, 'INTERNA', NOW(), NOW()),
  ('task-pgto-1-2', 'macro-pgto-1', 'Designar servidor responsável pela instrução e confecção do despacho', 2, 'INTERNA', NOW(), NOW()),

  ('task-pgto-2-1', 'macro-pgto-2', 'Verificar regularidade fiscal e trabalhista do credor (SICAF / CNDs)', 1, 'EXTERNA', NOW(), NOW()),
  ('task-pgto-2-2', 'macro-pgto-2', 'Conferir saldo disponível no empenho de lastro do contrato', 2, 'AUTOMATICA', NOW(), NOW()),
  ('task-pgto-2-3', 'macro-pgto-2', 'Elaborar e assinar minuta do Despacho de Instrução de Pagamento no SEI', 3, 'EXTERNA', NOW(), NOW()),

  ('task-pgto-3-1', 'macro-pgto-3', 'Inserir Despacho no Processo de Pagamento e tramitar para a CGOFI', 1, 'EXTERNA', NOW(), NOW()),
  ('task-pgto-3-2', 'macro-pgto-3', 'Registrar data de envio e calcular margem de dias úteis para o vencimento', 2, 'AUTOMATICA', NOW(), NOW()),

  ('task-pgto-4-1', 'macro-pgto-4', 'Monitorar contador de dias úteis sem resposta da CGOFI', 1, 'AUTOMATICA', NOW(), NOW()),
  ('task-pgto-4-2', 'macro-pgto-4', 'Efetuar cobrança setorial caso excedido o prazo padrão de resposta', 2, 'INTERNA', NOW(), NOW()),

  ('task-pgto-5-1', 'macro-pgto-5', 'Registrar/conciliar número da Ordem Bancária (OB) emitida', 1, 'CONFIRMACAO', NOW(), NOW()),
  ('task-pgto-5-2', 'macro-pgto-5', 'Concluir e arquivar o ciclo operacional da competência', 2, 'INTERNA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  macrotask_id = EXCLUDED.macrotask_id,
  nome = EXCLUDED.nome,
  ordem = EXCLUDED.ordem,
  execution_mode = EXCLUDED.execution_mode,
  updated_at = NOW();
