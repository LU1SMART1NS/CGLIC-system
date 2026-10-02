-- ==============================================================================
-- MIGRATION 63: PAGAMENTOS SEM CHECKLIST — SÓ OS MARCOS; REGULARIDADE FISCAL NA CONFERÊNCIA
-- Versão: 20261002000063_pagamentos_sem_checklist.sql
--
-- O checklist de tarefas do ciclo duplicava os marcos (conferir, enviar, pagar) e não gerava alerta nem
-- aparecia nas Ações do contrato. O acompanhamento de pagamento passa a ser só os 4 marcos; tarefas de
-- gestão ficam apenas no Plano de gestão.
--
-- 1. A verificação de SICAF / CNDs vira confirmação obrigatória ao registrar a conferência "em ordem"
--    (coluna regularidade_verificada no histórico).
-- 2. O modelo de acompanhamento de pagamento é desativado: sai da lista de modelos do Plano de gestão e os
--    ciclos novos não recebem plano de tarefas. Módulos já aplicados a planos existentes continuam.
-- 3. Os checklists dos ciclos que já existem são removidos (todos pendentes, criados na recriação do modelo).
-- ==============================================================================

ALTER TABLE public.contract_payment_cycle_events
  ADD COLUMN IF NOT EXISTS regularidade_verificada BOOLEAN;

COMMENT ON COLUMN public.contract_payment_cycle_events.regularidade_verificada IS
  'Na conferência: o gestor confirmou a regularidade fiscal e trabalhista do credor (SICAF / CNDs).';

UPDATE public.contract_payment_cycle_events SET regularidade_verificada = TRUE WHERE tipo = 'CONFERIDO' AND regularidade_verificada IS NULL;

DROP FUNCTION IF EXISTS public.register_payment_cycle_marco_atomic(
  VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, VARCHAR, DATE, DATE, TEXT, VARCHAR
);

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
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL,
  p_regularidade_verificada BOOLEAN DEFAULT NULL
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
    IF p_regularidade_verificada IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Confirme a verificação da regularidade fiscal e trabalhista do credor (SICAF / CNDs).' USING ERRCODE = '22023';
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
    cycle_id, tipo, data_evento, sei, numero_ob, motivo, origem_pendencia, prazo_anterior, prazo_novo, justificativa, registrado_por_nome,
    regularidade_verificada
  ) VALUES (
    v_cycle.id, v_marco, p_data, v_sei, v_ob, v_motivo, NULLIF(TRIM(COALESCE(p_origem_pendencia, '')), ''),
    v_prazo_anterior, p_prazo_novo, v_justificativa, v_nome,
    CASE WHEN v_marco = 'CONFERIDO' THEN TRUE ELSE NULL END
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


REVOKE ALL ON FUNCTION public.register_payment_cycle_marco_atomic(
  VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, VARCHAR, DATE, DATE, TEXT, VARCHAR, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_payment_cycle_marco_atomic(
  VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, VARCHAR, DATE, DATE, TEXT, VARCHAR, BOOLEAN
) TO authenticated;

UPDATE public.contract_task_templates SET ativo = FALSE, updated_at = NOW() WHERE id = 'tpl-acompanhamento-pagamento-14133';

DELETE FROM public.contract_task_plans WHERE contract_key IN (SELECT cycle_key FROM public.contract_payment_cycles);
