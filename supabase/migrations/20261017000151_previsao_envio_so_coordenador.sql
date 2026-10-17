-- ==============================================================================
-- Envio da previsão do mês: só o coordenador registra
--
-- A previsão enviada à DGFNSP (Portaria DGFNSP 50/2025, art. 5º, § 2º, III) é
-- uma por mês, da CGLIC toda (previsao_pagamentos.mes é a chave). O gestor vê
-- só as linhas dos próprios contratos; se ele registrasse o envio, a previsão
-- do mês inteiro seria trocada só pelas linhas dele. Ajustar as linhas
-- (salvar_ajuste_previsao) continua com o gestor, conferido pela migration 126.
--
-- Mesma função da migration 90, só muda a conferência do perfil. CREATE OR
-- REPLACE com a mesma assinatura mantém as permissões (sem anon).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.registrar_envio_previsao(
  p_mes DATE,
  p_sei VARCHAR(100),
  p_enviado_em DATE,
  p_linhas JSONB,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
  v_total NUMERIC(18, 2);
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador registra o envio da previsão do mês.' USING ERRCODE = '42501';
  END IF;
  IF p_mes IS NULL OR NULLIF(TRIM(COALESCE(p_sei, '')), '') IS NULL OR p_enviado_em IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o mês, o SEI e a data do envio.' USING ERRCODE = '22023';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A previsão enviada precisa de ao menos uma linha.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(SUM((l->>'valor')::NUMERIC), 0) INTO v_total FROM jsonb_array_elements(p_linhas) l;
  INSERT INTO public.previsao_pagamentos (mes, situacao, sei, enviado_em, linhas, total, enviado_por, enviado_por_nome, atualizado_em)
  VALUES (v_mes, 'ENVIADA', TRIM(p_sei), p_enviado_em, p_linhas, v_total, auth.uid(), NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), ''), NOW())
  ON CONFLICT (mes) DO UPDATE SET
    sei = EXCLUDED.sei, enviado_em = EXCLUDED.enviado_em, linhas = EXCLUDED.linhas, total = EXCLUDED.total,
    enviado_por = EXCLUDED.enviado_por, enviado_por_nome = EXCLUDED.enviado_por_nome, atualizado_em = NOW();
  RETURN jsonb_build_object('success', true, 'mes', v_mes, 'total', v_total, 'linhas', jsonb_array_length(p_linhas));
END;
$$;
