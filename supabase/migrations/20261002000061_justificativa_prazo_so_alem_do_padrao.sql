-- ==============================================================================
-- MIGRATION 61: JUSTIFICATIVA DO PRAZO SÓ QUANDO PASSA DO PADRÃO
-- Versão: 20261002000061_justificativa_prazo_so_alem_do_padrao.sql
--
-- Na migration 58 a justificativa também era exigida quando o prazo passava do vencimento da fatura.
-- Com a fatura vencendo em poucos dias, isso impedia até o prazo padrão (o gestor não conseguia registrar
-- a conferência). A exigência passa a valer só para prazo maior que o padrão de Regras de Alertas; o
-- vencimento da fatura continua sendo acompanhado pelos alertas de vencimento.
-- ==============================================================================

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
    v_alongado := p_prazo_padrao IS NOT NULL AND p_prazo_conferencia_ate > p_prazo_padrao;
    IF v_alongado AND v_justificativa IS NULL THEN
      RAISE EXCEPTION 'PRAZO_JUSTIFICATIVA_REQUIRED: Prazo além do padrão exige justificativa.' USING ERRCODE = '22023';
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
    v_alongado := p_prazo_padrao IS NOT NULL AND p_prazo_novo > p_prazo_padrao;
    IF v_alongado AND v_marco IN ('CONFERIDO', 'ENVIADO_CGOFI') AND v_justificativa IS NULL THEN
      RAISE EXCEPTION 'PRAZO_JUSTIFICATIVA_REQUIRED: Prazo além do padrão exige justificativa.' USING ERRCODE = '22023';
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
