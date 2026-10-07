-- ==============================================================================
-- MIGRATION 88: ESCOLHER (OU TROCAR) A FATURA DE UM CICLO JÁ ENVIADO À CGOFI
-- Versão: 20261007000088_ciclo_escolher_fatura.sql
--
-- A conciliação (migration 87) só liga sozinha quando há uma única fatura candidata. Com mais de uma (ou quando
-- a fatura foi cadastrada depois do envio), a equipe escolhe na tela: ligar_faturas_ciclo substitui as faturas do
-- ciclo, com as mesmas conferências do envio (do contrato, não cancelada, fora de outro ciclo, valor igual ou
-- justificado), registra no histórico e roda a conciliação na hora (a liquidação e a OB já aparecem, se existirem).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.ligar_faturas_ciclo(
  p_cycle_key VARCHAR(180),
  p_faturas BIGINT[],
  p_justificativa TEXT DEFAULT NULL,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle RECORD;
  v_fatura BIGINT;
  v_soma NUMERIC(18, 2);
  v_numeros TEXT;
  v_justificativa TEXT := NULLIF(TRIM(COALESCE(p_justificativa, '')), '');
  v_nome VARCHAR(150) := NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), '');
  v_conciliacao JSONB;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores.' USING ERRCODE = '42501';
  END IF;
  IF p_faturas IS NULL OR array_length(p_faturas, 1) IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha ao menos uma fatura.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cycle FROM public.contract_payment_cycles WHERE cycle_key = TRIM(COALESCE(p_cycle_key, '')) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_NOT_FOUND: Ciclo de pagamento "%" não encontrado.', p_cycle_key USING ERRCODE = 'P0002';
  END IF;
  IF v_cycle.status NOT IN ('ENVIADO_CGOFI', 'LIQUIDADO') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: A fatura se escolhe depois do envio à CGOFI e antes do pagamento (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
  END IF;

  FOREACH v_fatura IN ARRAY p_faturas LOOP
    IF NOT EXISTS (SELECT 1 FROM public.contrato_faturas WHERE id_fatura = v_fatura AND contract_key = v_cycle.contract_key AND NOT cancelada) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A fatura % não é deste contrato ou está cancelada.', v_fatura USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.contract_payment_cycle_faturas WHERE id_fatura = v_fatura AND cycle_id <> v_cycle.id) THEN
      RAISE EXCEPTION 'FATURA_EM_OUTRO_CICLO: A fatura % já está em outro ciclo de pagamento.', v_fatura USING ERRCODE = '23505';
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(valor_liquido), 0), string_agg(COALESCE(numero, id_fatura::TEXT), ', ' ORDER BY numero)
    INTO v_soma, v_numeros
    FROM public.contrato_faturas WHERE id_fatura = ANY (p_faturas);
  IF abs(v_soma - v_cycle.valor_atesto) >= 0.01 AND v_justificativa IS NULL THEN
    RAISE EXCEPTION 'VALOR_DIVERGENTE: As faturas somam % e o ciclo % : justifique a diferença.', v_soma, v_cycle.valor_atesto USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.contract_payment_cycle_faturas WHERE cycle_id = v_cycle.id;
  INSERT INTO public.contract_payment_cycle_faturas (cycle_id, id_fatura, vinculado_por)
  SELECT v_cycle.id, f, 'USUARIO' FROM unnest(p_faturas) f;

  -- Trocar a fatura de um ciclo já liquidado: a liquidação passa a ser a das faturas novas (a conciliação refaz).
  IF v_cycle.status = 'LIQUIDADO' THEN
    UPDATE public.contract_payment_cycles
       SET status = 'ENVIADO_CGOFI', data_liquidacao = NULL, numero_np = NULL, atualizado_em = NOW()
     WHERE id = v_cycle.id;
  END IF;

  INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, motivo, justificativa, registrado_por_nome)
  VALUES (v_cycle.id, 'FATURA_VINCULADA', CURRENT_DATE, 'Fatura ' || v_numeros || ' escolhida para o ciclo.', v_justificativa, v_nome);

  v_conciliacao := public.conciliar_ciclos_pagamento();

  RETURN jsonb_build_object(
    'success', true,
    'cycle_key', v_cycle.cycle_key,
    'status', (SELECT status FROM public.contract_payment_cycles WHERE id = v_cycle.id),
    'conciliacao', v_conciliacao
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ligar_faturas_ciclo(VARCHAR, BIGINT[], TEXT, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ligar_faturas_ciclo(VARCHAR, BIGINT[], TEXT, VARCHAR) TO authenticated;

-- ------------------------------------------------------------------------------
-- Limite do art. 75, II da Lei 14.133 por ano (IN 77, art. 7º, § 2º: até ele, prazos de liquidação e pagamento
-- pela metade). É valor da lei, atualizado todo ano por decreto (art. 182): o coordenador cadastra o ano novo em
-- Regras de Alertas. Leitura para logados; escrita só pela RPC (coordenador).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.limites_lei_14133_art75 (
  ano INTEGER PRIMARY KEY CHECK (ano BETWEEN 2021 AND 2100),
  valor NUMERIC(14, 2) NOT NULL CHECK (valor > 0),
  decreto TEXT NOT NULL CHECK (length(trim(decreto)) > 0),
  updated_by UUID DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.limites_lei_14133_art75 (ano, valor, decreto) VALUES
  (2024, 59906.02, 'Decreto 11.871/2023'),
  (2025, 62725.59, 'Decreto 12.343/2024'),
  (2026, 65492.11, 'Decreto 12.807/2025')
ON CONFLICT (ano) DO NOTHING;

ALTER TABLE public.limites_lei_14133_art75 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: limites_lei_14133_art75" ON public.limites_lei_14133_art75;
CREATE POLICY "Authenticated Read: limites_lei_14133_art75" ON public.limites_lei_14133_art75 FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.limites_lei_14133_art75 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.limites_lei_14133_art75 TO authenticated;
DROP TRIGGER IF EXISTS trg_audit_limites_lei_14133_art75 ON public.limites_lei_14133_art75;
CREATE TRIGGER trg_audit_limites_lei_14133_art75 AFTER INSERT OR UPDATE OR DELETE ON public.limites_lei_14133_art75
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

CREATE OR REPLACE FUNCTION public.salvar_limite_art75(p_ano INTEGER, p_valor NUMERIC, p_decreto TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Somente o coordenador altera o limite do art. 75, II.' USING ERRCODE = '42501';
  END IF;
  IF p_ano IS NULL OR p_ano NOT BETWEEN 2021 AND 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Ano inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o valor do limite.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_decreto, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o decreto que fixou o valor.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.limites_lei_14133_art75 (ano, valor, decreto, updated_by, updated_at)
  VALUES (p_ano, ROUND(p_valor, 2), TRIM(p_decreto), auth.uid(), NOW())
  ON CONFLICT (ano) DO UPDATE SET valor = EXCLUDED.valor, decreto = EXCLUDED.decreto, updated_by = EXCLUDED.updated_by, updated_at = NOW();
  RETURN jsonb_build_object('success', true, 'ano', p_ano);
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_limite_art75(INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_limite_art75(INTEGER, NUMERIC, TEXT) TO authenticated;
