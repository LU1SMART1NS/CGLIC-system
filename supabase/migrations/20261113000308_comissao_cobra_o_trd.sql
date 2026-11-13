-- ==============================================================================
-- Versão: 20261113000308_comissao_cobra_o_trd.sql
-- Comissão de recebimento também no TRD (decisão do usuário em 13/11/2026): o item enviado à comissão para o TRP
-- continua com ela até o TRD. Registrado o TRP, a conta dos 10 dias (alert_settings fiscalizacao.cobrarComissaoDias)
-- recomeça do TRP; sem o TRD, o fiscal cobra de novo. A contagem de cobranças é da fase (a primeira do TRD é a 1ª).
-- registrar_comissao_recebimento passa a aceitar a cobrança de itens no TRP (o envio continua só de itens entregues).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.registrar_comissao_recebimento(p_ids UUID[], p_tipo TEXT, p_data DATE, p_documento_sei TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_sei  TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI');
  v_n    INTEGER;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF p_tipo NOT IN ('ENVIO', 'COBRANCA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Tipo inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR p_data > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Data até hoje.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids)
              AND (responsavel <> 'SFC' OR entregue_em IS NULL OR encerrada_em IS NOT NULL
                   OR NOT (etapa = 'ENTREGUE' OR (p_tipo = 'COBRANCA' AND etapa = 'TRP')))) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Envio só de itens entregues e sem o TRP; cobrança de itens sem o TRP ou sem o TRD.' USING ERRCODE = '22023';
  END IF;
  -- Cobrança do TRD: o item foi à comissão, e a cobrança vem depois do TRP.
  IF p_tipo = 'COBRANCA' AND EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND etapa = 'TRP' AND etapa_em IS NOT NULL AND p_data < etapa_em) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A cobrança do TRD vem depois do TRP.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND p_data < entregue_em) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data não pode ser antes da entrega.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'COBRANCA' AND EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids)
                                       AND (comissao_enviada_em IS NULL OR p_data < comissao_enviada_em)) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A cobrança vem depois do envio à comissão.' USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'ENVIO' THEN
    UPDATE public.fisc_entregas
       SET comissao_enviada_em = p_data, comissao_cobrada_em = NULL, comissao_cobrancas = 0, atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = ANY (p_ids);
  ELSE
    -- A contagem é da fase: a primeira cobrança do TRD (depois do TRP) recomeça em 1.
    UPDATE public.fisc_entregas
       SET comissao_cobrancas = CASE WHEN etapa = 'TRP' AND (comissao_cobrada_em IS NULL OR comissao_cobrada_em < COALESCE(etapa_em, comissao_enviada_em))
                                     THEN 1 ELSE comissao_cobrancas + 1 END,
           comissao_cobrada_em = p_data, atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = ANY (p_ids);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, documento_sei, observacao, criado_por, criado_por_nome)
  SELECT e.id, CASE WHEN p_tipo = 'ENVIO' THEN 'COMISSAO' ELSE 'COBRANCA' END, p_data, v_sei,
         CASE WHEN p_tipo = 'ENVIO' THEN 'enviado à comissão de recebimento para o TRP'
              ELSE format('%sª cobrança à comissão de recebimento (%s)', e.comissao_cobrancas, CASE WHEN e.etapa = 'TRP' THEN 'TRD' ELSE 'TRP' END) END,
         auth.uid(), v_nome
    FROM public.fisc_entregas e WHERE e.id = ANY (p_ids);
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_comissao_recebimento(UUID[], TEXT, DATE, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_comissao_recebimento(UUID[], TEXT, DATE, TEXT) TO authenticated;
