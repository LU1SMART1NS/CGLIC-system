-- ==============================================================================
-- MIGRATION 58: CICLO DE PAGAMENTO EM QUATRO MARCOS COM PRAZOS POR ETAPA
-- Versão: 20261002000058_ciclo_pagamento_tres_marcos.sql
--
-- O ciclo deixa de ter 11 situações escolhidas à mão e passa a ser deduzido de marcos com data:
--   Recebido (início da contagem) -> Conferido -> Enviado à CGOFI -> Pago (ordem bancária).
-- Cada intervalo tem um dono e um prazo: conferir e enviar são da CGLIC; pagar é da CGOFI (a CGLIC
-- só acompanha, e o prazo registrado é o de cobrança).
--
-- 1. Colunas novas no ciclo: data de recebimento, data da conferência e as datas-alvo de cada etapa.
-- 2. Situações novas: RECEBIDO (em conferência), COM_PENDENCIA, CONFERIDO, ENVIADO_CGOFI, DEVOLVIDO,
--    PAGO e CANCELADO. As antigas são convertidas.
-- 3. contract_payment_cycle_documents: cada documento recebido (atesto, NF, fatura...) com número e SEI.
-- 4. contract_payment_cycle_events: histórico de marcos, pendências e prazos alongados (com motivo).
-- 5. RPCs: create_payment_cycle_atomic (vários documentos), register_payment_cycle_marco_atomic,
--    add/remove_payment_cycle_document_atomic e update_payment_cycle_info_atomic (substitui
--    update_payment_cycle_atomic, que escolhia a situação à mão).
-- 6. Template de tarefas dos NOVOS ciclos: 3 etapas só com trabalho humano. Os planos dos ciclos que já
--    existem não são tocados (têm tarefas concluídas).
--
-- Prazo alongado: passar do prazo padrão (informado pelo cliente a partir de Regras de Alertas) ou do
-- vencimento da fatura exige justificativa. Pendência e devolução usam o motivo como justificativa.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Colunas novas
-- ------------------------------------------------------------------------------
ALTER TABLE public.contract_payment_cycles
  ADD COLUMN IF NOT EXISTS data_recebimento DATE,
  ADD COLUMN IF NOT EXISTS data_conferencia DATE,
  ADD COLUMN IF NOT EXISTS prazo_conferencia_ate DATE,
  ADD COLUMN IF NOT EXISTS prazo_envio_ate DATE,
  ADD COLUMN IF NOT EXISTS cobrar_cgofi_ate DATE;

UPDATE public.contract_payment_cycles SET data_recebimento = data_assinatura_atesto WHERE data_recebimento IS NULL;
ALTER TABLE public.contract_payment_cycles ALTER COLUMN data_recebimento SET NOT NULL;

COMMENT ON COLUMN public.contract_payment_cycles.data_recebimento IS
  'Quando a CGLIC recebeu os documentos: início da contagem do prazo de conferência.';
COMMENT ON COLUMN public.contract_payment_cycles.prazo_conferencia_ate IS
  'Data-alvo vigente para concluir a conferência (CGLIC). Alongamentos ficam em contract_payment_cycle_events.';
COMMENT ON COLUMN public.contract_payment_cycles.prazo_envio_ate IS
  'Data-alvo vigente para enviar o processo à CGOFI depois de conferido (CGLIC).';
COMMENT ON COLUMN public.contract_payment_cycles.cobrar_cgofi_ate IS
  'Data a partir da qual a CGLIC cobra a CGOFI. Não é prazo da CGOFI: a CGLIC só acompanha.';

-- ------------------------------------------------------------------------------
-- 2. Situações
-- ------------------------------------------------------------------------------
ALTER TABLE public.contract_payment_cycles DROP CONSTRAINT IF EXISTS contract_payment_cycles_status_check;

UPDATE public.contract_payment_cycles SET status = CASE status
  WHEN 'RECEBIDO' THEN 'RECEBIDO'
  WHEN 'ATRIBUIDO' THEN 'RECEBIDO'
  WHEN 'EM_INSTRUCAO' THEN 'RECEBIDO'
  WHEN 'PENDENTE_DOCUMENTACAO' THEN 'COM_PENDENCIA'
  WHEN 'DESPACHO_ELABORADO' THEN 'CONFERIDO'
  WHEN 'ENVIADO_CGOFI' THEN 'ENVIADO_CGOFI'
  WHEN 'AGUARDANDO_CGOFI' THEN 'ENVIADO_CGOFI'
  WHEN 'DEVOLVIDO_FISCAL' THEN 'DEVOLVIDO'
  WHEN 'PAGAMENTO_CONFIRMADO' THEN 'PAGO'
  WHEN 'CONCLUIDO' THEN 'PAGO'
  ELSE status
END;

ALTER TABLE public.contract_payment_cycles
  ADD CONSTRAINT contract_payment_cycles_status_check
  CHECK (status IN ('RECEBIDO', 'COM_PENDENCIA', 'CONFERIDO', 'ENVIADO_CGOFI', 'DEVOLVIDO', 'PAGO', 'CANCELADO'));

-- ------------------------------------------------------------------------------
-- 3. Documentos recebidos
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_payment_cycle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.contract_payment_cycles(id) ON DELETE CASCADE,
  tipo VARCHAR(60) NOT NULL,
  numero VARCHAR(60),
  sei VARCHAR(100) NOT NULL,
  valor NUMERIC(18, 4) CHECK (valor IS NULL OR valor >= 0),
  data_recebimento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid(),
  UNIQUE (cycle_id, sei)
);
CREATE INDEX IF NOT EXISTS idx_payment_cycle_documents_cycle ON public.contract_payment_cycle_documents (cycle_id);

-- ------------------------------------------------------------------------------
-- 4. Histórico (marcos, pendências e prazos alongados)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_payment_cycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.contract_payment_cycles(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
    'RECEBIDO', 'CONFERIDO', 'PENDENCIA', 'ENVIADO_CGOFI', 'DEVOLVIDO', 'PAGO', 'CANCELADO', 'PRAZO_ALONGADO'
  )),
  data_evento DATE NOT NULL,
  sei VARCHAR(100),
  numero_ob VARCHAR(60),
  motivo TEXT,
  origem_pendencia VARCHAR(12) CHECK (origem_pendencia IS NULL OR origem_pendencia IN ('FORNECEDOR', 'FISCAL')),
  prazo_anterior DATE,
  prazo_novo DATE,
  justificativa TEXT,
  registrado_por UUID DEFAULT auth.uid(),
  registrado_por_nome VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_cycle_events_cycle ON public.contract_payment_cycle_events (cycle_id, created_at);

ALTER TABLE public.contract_payment_cycle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_payment_cycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated Read: contract_payment_cycle_documents"
  ON public.contract_payment_cycle_documents FOR SELECT TO authenticated
  USING (public.has_role('leitor') OR public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Authenticated Read: contract_payment_cycle_events"
  ON public.contract_payment_cycle_events FOR SELECT TO authenticated
  USING (public.has_role('leitor') OR public.has_role('gestor') OR public.has_role('admin'));

DROP TRIGGER IF EXISTS trg_audit_contract_payment_cycle_documents ON public.contract_payment_cycle_documents;
CREATE TRIGGER trg_audit_contract_payment_cycle_documents
AFTER INSERT OR UPDATE OR DELETE ON public.contract_payment_cycle_documents
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_contract_payment_cycle_events ON public.contract_payment_cycle_events;
CREATE TRIGGER trg_audit_contract_payment_cycle_events
AFTER INSERT OR UPDATE OR DELETE ON public.contract_payment_cycle_events
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- Ciclos que já existem: o atesto vira o primeiro documento e o histórico começa no recebimento.
INSERT INTO public.contract_payment_cycle_documents (cycle_id, tipo, sei, valor, data_recebimento)
SELECT c.id, 'Termo de Atesto', c.documento_atesto_sei, c.valor_atesto, c.data_recebimento
FROM public.contract_payment_cycles c
ON CONFLICT (cycle_id, sei) DO NOTHING;

INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, sei, registrado_por_nome)
SELECT c.id, 'RECEBIDO', c.data_recebimento, c.documento_atesto_sei, 'Migração'
FROM public.contract_payment_cycles c
WHERE NOT EXISTS (SELECT 1 FROM public.contract_payment_cycle_events e WHERE e.cycle_id = c.id AND e.tipo = 'RECEBIDO');

INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, sei, registrado_por_nome)
SELECT c.id, 'ENVIADO_CGOFI', c.data_envio_cgofi, c.documento_despacho_sei, 'Migração'
FROM public.contract_payment_cycles c
WHERE c.data_envio_cgofi IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.contract_payment_cycle_events e WHERE e.cycle_id = c.id AND e.tipo = 'ENVIADO_CGOFI');

INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, numero_ob, registrado_por_nome)
SELECT c.id, 'PAGO', c.data_ordem_bancaria, c.numero_ordem_bancaria, 'Migração'
FROM public.contract_payment_cycles c
WHERE c.data_ordem_bancaria IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.contract_payment_cycle_events e WHERE e.cycle_id = c.id AND e.tipo = 'PAGO');

-- ------------------------------------------------------------------------------
-- 5. RPCs
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_payment_cycle_atomic(
  VARCHAR, VARCHAR, VARCHAR, DATE, DATE, NUMERIC, VARCHAR, VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR, UUID, TEXT, BOOLEAN
);
DROP FUNCTION IF EXISTS public.update_payment_cycle_atomic(
  VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, DATE, VARCHAR, UUID, TEXT, VARCHAR
);

-- Cria o ciclo com os documentos recebidos. O atesto (tipo "Termo de Atesto") dá o Id. SEI da chave do ciclo.
CREATE OR REPLACE FUNCTION public.create_payment_cycle_atomic(
  p_contract_key VARCHAR(150),
  p_competencia VARCHAR(7),
  p_data_recebimento DATE,
  p_data_vencimento_fatura DATE,
  p_valor_atesto NUMERIC(18, 4),
  p_documentos JSONB,
  p_prazo_conferencia_ate DATE DEFAULT NULL,
  p_prazo_padrao DATE DEFAULT NULL,
  p_justificativa_prazo TEXT DEFAULT NULL,
  p_data_assinatura_atesto DATE DEFAULT NULL,
  p_empenho_canonical_key VARCHAR(150) DEFAULT NULL,
  p_numero_processo_pagamento_sei VARCHAR(50) DEFAULT NULL,
  p_numero_processo_contrato_sei VARCHAR(50) DEFAULT NULL,
  p_titular_nome VARCHAR(150) DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL,
  p_apply_task_template BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_competencia VARCHAR(7) := TRIM(COALESCE(p_competencia, ''));
  v_doc JSONB;
  v_atesto_sei VARCHAR(100);
  v_cycle_key VARCHAR(180);
  v_record RECORD;
  v_plan_result JSONB;
  v_uasg VARCHAR(10);
  v_ano INTEGER;
  v_justificativa TEXT := NULLIF(TRIM(COALESCE(p_justificativa_prazo, '')), '');
  v_alongado BOOLEAN := FALSE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chave do contrato (contract_key) é obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF v_competencia !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A competência deve estar no formato YYYY-MM ("%" informado).', p_competencia USING ERRCODE = '22023';
  END IF;
  IF p_data_recebimento IS NULL OR p_data_vencimento_fatura IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data de recebimento e o vencimento da fatura são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF p_valor_atesto IS NULL OR p_valor_atesto < 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O valor do atesto é obrigatório e não pode ser negativo.' USING ERRCODE = '22023';
  END IF;
  IF p_documentos IS NULL OR jsonb_typeof(p_documentos) <> 'array' OR jsonb_array_length(p_documentos) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe ao menos o Termo de Atesto recebido, com o número do SEI.' USING ERRCODE = '22023';
  END IF;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documentos) LOOP
    IF NULLIF(TRIM(COALESCE(v_doc->>'tipo', '')), '') IS NULL OR NULLIF(TRIM(COALESCE(v_doc->>'sei', '')), '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Todo documento recebido precisa de tipo e número do SEI.' USING ERRCODE = '22023';
    END IF;
    IF v_atesto_sei IS NULL AND lower(TRIM(v_doc->>'tipo')) = 'termo de atesto' THEN
      v_atesto_sei := TRIM(v_doc->>'sei');
    END IF;
  END LOOP;
  IF v_atesto_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Entre os documentos deve haver o Termo de Atesto.' USING ERRCODE = '22023';
  END IF;

  IF p_prazo_conferencia_ate IS NOT NULL THEN
    IF p_prazo_conferencia_ate < p_data_recebimento THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O prazo de conferência não pode ser anterior ao recebimento.' USING ERRCODE = '22023';
    END IF;
    v_alongado := (p_prazo_padrao IS NOT NULL AND p_prazo_conferencia_ate > p_prazo_padrao)
      OR p_prazo_conferencia_ate > p_data_vencimento_fatura;
    IF v_alongado AND v_justificativa IS NULL THEN
      RAISE EXCEPTION 'PRAZO_JUSTIFICATIVA_REQUIRED: Prazo além do padrão ou do vencimento da fatura exige justificativa.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_numero_processo_pagamento_sei IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.processos_sei WHERE numero_processo_sei = TRIM(p_numero_processo_pagamento_sei)
  ) THEN
    RAISE EXCEPTION 'PROCESS_SEI_NOT_FOUND: Processo SEI de pagamento "%" não encontrado.', p_numero_processo_pagamento_sei USING ERRCODE = 'P0002';
  END IF;
  IF p_numero_processo_contrato_sei IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.processos_sei WHERE numero_processo_sei = TRIM(p_numero_processo_contrato_sei)
  ) THEN
    RAISE EXCEPTION 'PROCESS_SEI_NOT_FOUND: Processo SEI de contrato "%" não encontrado.', p_numero_processo_contrato_sei USING ERRCODE = 'P0002';
  END IF;

  v_cycle_key := public.build_payment_cycle_key(v_contract_key, v_competencia, v_atesto_sei);
  IF EXISTS (SELECT 1 FROM public.contract_payment_cycles WHERE cycle_key = v_cycle_key) THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_ALREADY_EXISTS: Já existe um ciclo de pagamento para este contrato, competência e Termo de Atesto ("%").', v_cycle_key USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.contract_payment_cycles (
    cycle_key, contract_key, competencia, empenho_canonical_key,
    numero_processo_pagamento_sei, numero_processo_contrato_sei,
    documento_atesto_sei, numero_notas_fiscais, valor_atesto,
    data_assinatura_atesto, data_recebimento, data_vencimento_fatura, prazo_conferencia_ate,
    titular_nome, responsavel_nome, responsavel_user_id, observacoes, origem_dado, status
  ) VALUES (
    v_cycle_key, v_contract_key, v_competencia, NULLIF(TRIM(COALESCE(p_empenho_canonical_key, '')), ''),
    NULLIF(TRIM(COALESCE(p_numero_processo_pagamento_sei, '')), ''), NULLIF(TRIM(COALESCE(p_numero_processo_contrato_sei, '')), ''),
    v_atesto_sei,
    (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(p_documentos) d WHERE lower(TRIM(d->>'tipo')) LIKE 'nota fiscal%'),
    p_valor_atesto,
    COALESCE(p_data_assinatura_atesto, p_data_recebimento), p_data_recebimento, p_data_vencimento_fatura, p_prazo_conferencia_ate,
    NULLIF(TRIM(COALESCE(p_titular_nome, '')), ''), NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), p_responsavel_user_id,
    NULLIF(TRIM(COALESCE(p_observacoes, '')), ''), 'MANUAL', 'RECEBIDO'
  )
  RETURNING * INTO v_record;

  INSERT INTO public.contract_payment_cycle_documents (cycle_id, tipo, numero, sei, valor, data_recebimento)
  SELECT v_record.id,
         TRIM(d->>'tipo'),
         NULLIF(TRIM(COALESCE(d->>'numero', '')), ''),
         TRIM(d->>'sei'),
         NULLIF(d->>'valor', '')::NUMERIC,
         p_data_recebimento
  FROM jsonb_array_elements(p_documentos) d;

  INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, sei, registrado_por_nome)
  VALUES (v_record.id, 'RECEBIDO', p_data_recebimento, v_atesto_sei, NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), ''));

  IF v_alongado THEN
    INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, prazo_anterior, prazo_novo, justificativa, registrado_por_nome)
    VALUES (v_record.id, 'PRAZO_ALONGADO', p_data_recebimento, p_prazo_padrao, p_prazo_conferencia_ate, v_justificativa,
            NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), ''));
  END IF;

  v_plan_result := NULL;
  IF COALESCE(p_apply_task_template, TRUE) THEN
    v_uasg := LEFT(COALESCE(NULLIF(split_part(v_contract_key, '-', 1), ''), '000000'), 10);
    v_ano := COALESCE(NULLIF(LEFT(v_competencia, 4), '')::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER);
    IF EXISTS (SELECT 1 FROM public.contract_task_templates WHERE id = 'tpl-acompanhamento-pagamento-14133' AND ativo) THEN
      v_plan_result := public.apply_contract_task_template_to_key_atomic(
        v_cycle_key, v_uasg, v_atesto_sei, v_ano, 'tpl-acompanhamento-pagamento-14133'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_record.id, 'cycle_key', v_record.cycle_key, 'contract_key', v_record.contract_key,
      'competencia', v_record.competencia, 'status', v_record.status, 'criado_em', v_record.criado_em
    ),
    'task_plan', v_plan_result
  );
END;
$$;

-- Registra um marco do ciclo. A situação e as datas-alvo vêm daqui; ninguém escolhe a situação.
CREATE OR REPLACE FUNCTION public.register_payment_cycle_marco_atomic(
  p_cycle_key VARCHAR(180),
  p_marco VARCHAR(30),
  p_data DATE,
  p_sei VARCHAR(100) DEFAULT NULL,
  p_numero_ob VARCHAR(60) DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_origem_pendencia VARCHAR(12) DEFAULT NULL,
  p_prazo_novo DATE DEFAULT NULL,
  p_prazo_padrao DATE DEFAULT NULL,
  p_justificativa TEXT DEFAULT NULL,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle_key VARCHAR(180) := TRIM(COALESCE(p_cycle_key, ''));
  v_marco VARCHAR(30) := TRIM(COALESCE(p_marco, ''));
  v_cycle RECORD;
  v_record RECORD;
  v_sei VARCHAR(100) := NULLIF(TRIM(COALESCE(p_sei, '')), '');
  v_ob VARCHAR(60) := NULLIF(TRIM(COALESCE(p_numero_ob, '')), '');
  v_motivo TEXT := NULLIF(TRIM(COALESCE(p_motivo, '')), '');
  v_justificativa TEXT := NULLIF(TRIM(COALESCE(p_justificativa, '')), '');
  v_prazo_anterior DATE;
  v_alongado BOOLEAN := FALSE;
  v_nome VARCHAR(150) := NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), '');
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  IF v_marco NOT IN ('CONFERIDO', 'PENDENCIA', 'ENVIADO_CGOFI', 'DEVOLVIDO', 'PAGO', 'CANCELADO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Marco inválido ("%").', v_marco USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data do marco é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cycle FROM public.contract_payment_cycles WHERE cycle_key = v_cycle_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_NOT_FOUND: Ciclo de pagamento "%" não encontrado.', v_cycle_key USING ERRCODE = 'P0002';
  END IF;
  IF v_cycle.status IN ('PAGO', 'CANCELADO') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: O ciclo já está encerrado (%).', v_cycle.status USING ERRCODE = '22023';
  END IF;
  IF p_data < v_cycle.data_recebimento THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data do marco não pode ser anterior ao recebimento (%).', v_cycle.data_recebimento USING ERRCODE = '22023';
  END IF;

  -- Alongamento: prazo novo além do padrão (ou do vencimento da fatura, nas etapas da CGLIC) exige justificativa.
  IF p_prazo_novo IS NOT NULL THEN
    IF p_prazo_novo < p_data THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O prazo novo não pode ser anterior à data do marco.' USING ERRCODE = '22023';
    END IF;
    v_alongado := (p_prazo_padrao IS NOT NULL AND p_prazo_novo > p_prazo_padrao)
      OR (v_marco IN ('CONFERIDO', 'PENDENCIA', 'DEVOLVIDO') AND p_prazo_novo > v_cycle.data_vencimento_fatura);
    IF v_alongado AND v_marco IN ('CONFERIDO', 'ENVIADO_CGOFI') AND v_justificativa IS NULL THEN
      RAISE EXCEPTION 'PRAZO_JUSTIFICATIVA_REQUIRED: Prazo além do padrão ou do vencimento da fatura exige justificativa.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_marco = 'CONFERIDO' THEN
    IF v_cycle.status NOT IN ('RECEBIDO', 'COM_PENDENCIA', 'DEVOLVIDO') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Só é possível registrar a conferência de um ciclo em conferência (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    v_prazo_anterior := v_cycle.prazo_envio_ate;
    UPDATE public.contract_payment_cycles
       SET status = 'CONFERIDO', data_conferencia = p_data, prazo_envio_ate = p_prazo_novo, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'PENDENCIA' THEN
    IF v_cycle.status NOT IN ('RECEBIDO', 'COM_PENDENCIA', 'DEVOLVIDO') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Pendência só se registra durante a conferência (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_motivo IS NULL OR p_origem_pendencia IS NULL OR p_prazo_novo IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Pendência exige motivo, origem (FORNECEDOR ou FISCAL) e o novo prazo de conferência.' USING ERRCODE = '22023';
    END IF;
    v_prazo_anterior := v_cycle.prazo_conferencia_ate;
    UPDATE public.contract_payment_cycles
       SET status = 'COM_PENDENCIA', prazo_conferencia_ate = p_prazo_novo, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'ENVIADO_CGOFI' THEN
    IF v_cycle.status <> 'CONFERIDO' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: O envio à CGOFI exige o ciclo conferido (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_sei IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do SEI do despacho.' USING ERRCODE = '22023';
    END IF;
    IF v_cycle.data_conferencia IS NOT NULL AND p_data < v_cycle.data_conferencia THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O envio não pode ser anterior à conferência (%).', v_cycle.data_conferencia USING ERRCODE = '22023';
    END IF;
    v_prazo_anterior := v_cycle.cobrar_cgofi_ate;
    UPDATE public.contract_payment_cycles
       SET status = 'ENVIADO_CGOFI', documento_despacho_sei = v_sei, data_envio_cgofi = p_data,
           cobrar_cgofi_ate = p_prazo_novo, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'DEVOLVIDO' THEN
    IF v_cycle.status <> 'ENVIADO_CGOFI' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Só um ciclo enviado à CGOFI pode ser devolvido (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_motivo IS NULL OR p_prazo_novo IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A devolução exige o motivo e o novo prazo de conferência.' USING ERRCODE = '22023';
    END IF;
    v_prazo_anterior := v_cycle.prazo_conferencia_ate;
    -- O envio anterior continua no histórico; o ciclo volta à conferência sem ele.
    UPDATE public.contract_payment_cycles
       SET status = 'DEVOLVIDO', documento_despacho_sei = NULL, data_envio_cgofi = NULL, data_conferencia = NULL,
           prazo_conferencia_ate = p_prazo_novo, prazo_envio_ate = NULL, cobrar_cgofi_ate = NULL, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'PAGO' THEN
    IF v_cycle.status <> 'ENVIADO_CGOFI' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: O pagamento só se confirma depois do envio à CGOFI (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_ob IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número da ordem bancária.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.contract_payment_cycles
       SET status = 'PAGO', numero_ordem_bancaria = v_ob, data_ordem_bancaria = p_data,
           concluido_em = NOW(), concluido_por = COALESCE(v_nome, responsavel_nome), atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSE -- CANCELADO
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O cancelamento exige o motivo.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.contract_payment_cycles
       SET status = 'CANCELADO', concluido_em = NOW(), concluido_por = COALESCE(v_nome, responsavel_nome), atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;
  END IF;

  INSERT INTO public.contract_payment_cycle_events (
    cycle_id, tipo, data_evento, sei, numero_ob, motivo, origem_pendencia, prazo_anterior, prazo_novo, justificativa, registrado_por_nome
  ) VALUES (
    v_cycle.id, v_marco, p_data, v_sei, v_ob, v_motivo, NULLIF(TRIM(COALESCE(p_origem_pendencia, '')), ''),
    v_prazo_anterior, p_prazo_novo, v_justificativa, v_nome
  );

  -- Prazo alongado com justificativa (e fora de pendência/devolução, onde o motivo já a faz) vira evento próprio.
  IF v_alongado AND v_justificativa IS NOT NULL AND v_marco IN ('CONFERIDO', 'ENVIADO_CGOFI') THEN
    INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, prazo_anterior, prazo_novo, justificativa, registrado_por_nome)
    VALUES (v_cycle.id, 'PRAZO_ALONGADO', p_data, p_prazo_padrao, p_prazo_novo, v_justificativa, v_nome);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_record.id, 'cycle_key', v_record.cycle_key, 'status', v_record.status,
      'data_conferencia', v_record.data_conferencia, 'data_envio_cgofi', v_record.data_envio_cgofi,
      'documento_despacho_sei', v_record.documento_despacho_sei,
      'numero_ordem_bancaria', v_record.numero_ordem_bancaria, 'data_ordem_bancaria', v_record.data_ordem_bancaria,
      'prazo_conferencia_ate', v_record.prazo_conferencia_ate, 'prazo_envio_ate', v_record.prazo_envio_ate,
      'cobrar_cgofi_ate', v_record.cobrar_cgofi_ate, 'atualizado_em', v_record.atualizado_em
    )
  );
END;
$$;

-- Documentos: adicionar depois da criação (a NF pode chegar depois do atesto) enquanto o ciclo está na CGLIC.
CREATE OR REPLACE FUNCTION public.add_payment_cycle_document_atomic(
  p_cycle_key VARCHAR(180),
  p_tipo VARCHAR(60),
  p_sei VARCHAR(100),
  p_numero VARCHAR(60) DEFAULT NULL,
  p_valor NUMERIC(18, 4) DEFAULT NULL,
  p_data_recebimento DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle RECORD;
  v_doc RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_tipo, '')), '') IS NULL OR NULLIF(TRIM(COALESCE(p_sei, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o tipo do documento e o número do SEI.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_cycle FROM public.contract_payment_cycles WHERE cycle_key = TRIM(COALESCE(p_cycle_key, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_NOT_FOUND: Ciclo de pagamento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_cycle.status NOT IN ('RECEBIDO', 'COM_PENDENCIA', 'DEVOLVIDO', 'CONFERIDO') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Documentos só podem ser incluídos enquanto o ciclo está na CGLIC (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contract_payment_cycle_documents WHERE cycle_id = v_cycle.id AND sei = TRIM(p_sei)) THEN
    RAISE EXCEPTION 'DOCUMENT_ALREADY_EXISTS: O SEI % já está registrado neste ciclo.', TRIM(p_sei) USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.contract_payment_cycle_documents (cycle_id, tipo, numero, sei, valor, data_recebimento)
  VALUES (v_cycle.id, TRIM(p_tipo), NULLIF(TRIM(COALESCE(p_numero, '')), ''), TRIM(p_sei), p_valor, COALESCE(p_data_recebimento, CURRENT_DATE))
  RETURNING * INTO v_doc;
  RETURN jsonb_build_object('success', true, 'document_id', v_doc.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_payment_cycle_document_atomic(p_document_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc RECORD;
  v_cycle RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_doc FROM public.contract_payment_cycle_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Documento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_cycle FROM public.contract_payment_cycles WHERE id = v_doc.cycle_id;
  IF v_cycle.status NOT IN ('RECEBIDO', 'COM_PENDENCIA', 'DEVOLVIDO', 'CONFERIDO') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Documentos só podem ser removidos enquanto o ciclo está na CGLIC (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
  END IF;
  IF v_doc.sei = v_cycle.documento_atesto_sei THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O Termo de Atesto identifica o ciclo e não pode ser removido.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.contract_payment_cycle_documents WHERE id = p_document_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Responsável e observações (a situação não se edita à mão).
CREATE OR REPLACE FUNCTION public.update_payment_cycle_info_atomic(
  p_cycle_key VARCHAR(180),
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.contract_payment_cycles
     SET responsavel_nome = COALESCE(NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), responsavel_nome),
         responsavel_user_id = COALESCE(p_responsavel_user_id, responsavel_user_id),
         observacoes = CASE WHEN p_observacoes IS NULL THEN observacoes ELSE NULLIF(TRIM(p_observacoes), '') END,
         atualizado_em = NOW()
   WHERE cycle_key = TRIM(COALESCE(p_cycle_key, ''))
   RETURNING * INTO v_record;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_NOT_FOUND: Ciclo de pagamento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('success', true, 'cycle_key', v_record.cycle_key);
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_cycle_atomic(
  VARCHAR, VARCHAR, DATE, DATE, NUMERIC, JSONB, DATE, DATE, TEXT, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, VARCHAR, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_cycle_atomic(
  VARCHAR, VARCHAR, DATE, DATE, NUMERIC, JSONB, DATE, DATE, TEXT, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, VARCHAR, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.register_payment_cycle_marco_atomic(
  VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, VARCHAR, DATE, DATE, TEXT, VARCHAR
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_payment_cycle_marco_atomic(
  VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, VARCHAR, DATE, DATE, TEXT, VARCHAR
) TO authenticated;

REVOKE ALL ON FUNCTION public.add_payment_cycle_document_atomic(VARCHAR, VARCHAR, VARCHAR, VARCHAR, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_payment_cycle_document_atomic(VARCHAR, VARCHAR, VARCHAR, VARCHAR, NUMERIC, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_payment_cycle_document_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_payment_cycle_document_atomic(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.update_payment_cycle_info_atomic(VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_payment_cycle_info_atomic(VARCHAR, VARCHAR, UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Template dos NOVOS ciclos: 3 etapas, só trabalho humano
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_tid CONSTANT VARCHAR := 'tpl-acompanhamento-pagamento-14133';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contract_task_templates WHERE id = v_tid) THEN
    RETURN;
  END IF;

  DELETE FROM public.contract_task_template_tasks
   WHERE macrotask_id IN (SELECT id FROM public.contract_task_template_macrotasks WHERE template_id = v_tid);
  DELETE FROM public.contract_task_template_macrotasks
   WHERE template_id = v_tid AND id IN ('macro-pgto-4', 'macro-pgto-5');

  UPDATE public.contract_task_template_macrotasks SET nome = '1. Recepção e conferência', ordem = 1, updated_at = NOW() WHERE id = 'macro-pgto-1' AND template_id = v_tid;
  UPDATE public.contract_task_template_macrotasks SET nome = '2. Envio à CGOFI', ordem = 2, updated_at = NOW() WHERE id = 'macro-pgto-2' AND template_id = v_tid;
  UPDATE public.contract_task_template_macrotasks SET nome = '3. Acompanhamento do pagamento', ordem = 3, updated_at = NOW() WHERE id = 'macro-pgto-3' AND template_id = v_tid;

  INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode) VALUES
    ('task-pgto-1-1', 'macro-pgto-1', 'Conferir a conformidade formal do Termo de Atesto e das notas fiscais', 1, 'INTERNA'),
    ('task-pgto-1-2', 'macro-pgto-1', 'Verificar a regularidade fiscal e trabalhista do credor (SICAF / CNDs)', 2, 'EXTERNA'),
    ('task-pgto-2-1', 'macro-pgto-2', 'Elaborar o Despacho de Instrução de Pagamento e tramitar à CGOFI pelo SEI', 1, 'EXTERNA'),
    ('task-pgto-3-1', 'macro-pgto-3', 'Cobrar a CGOFI quando o prazo de acompanhamento for excedido', 1, 'INTERNA'),
    ('task-pgto-3-2', 'macro-pgto-3', 'Registrar a Ordem Bancária e concluir o ciclo', 2, 'CONFIRMACAO');
END
$$;
