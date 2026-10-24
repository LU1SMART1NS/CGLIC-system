-- ==============================================================================
-- MIGRATION 179: EMENDAS PARLAMENTARES — A ATA ACEITA MAIS DE UMA SOLICITAÇÃO DE EMPENHO (UMA POR RODADA)
-- Versão: 20261024000179_emendas_solicitacao_por_rodada.sql
--
-- Decisão de 24/10/2026. Nos pedidos 416, 418 e 528 a mesma ata tem duas solicitações de autorização de empenho,
-- ambas assinadas pela Diretora do FNSP, meses uma da outra: a segunda é de uma nova rodada (o pedido tem duas linhas
-- do mesmo item). A migration 178 só aceitava uma solicitação por ata.
--
-- 1) Sai a trava de uma solicitação por ata no pedido (ux_emenda_pedido_documentos_sei_ata); fica um índice comum.
-- 2) informar_solicitacao_da_ata ganha p_substitui: o número que a solicitação informada troca (sai da ata e fica no
--    pedido, sem ata). Sem ele, a solicitação entra a mais na ata, sem tirar as outras. O pedido de uma ata só continua
--    ligando sozinho a solicitação registrada pela tela, se a ata ainda não tem nenhuma (migration 178).
-- ==============================================================================

-- 1) Mais de uma solicitação por ata ------------------------------------------------
DROP INDEX IF EXISTS public.ux_emenda_pedido_documentos_sei_ata;
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_documentos_sei_ata
  ON public.emenda_pedido_documentos_sei (pedido_id, ata_key) WHERE ata_key IS NOT NULL;
COMMENT ON COLUMN public.emenda_pedido_documentos_sei.ata_key IS
  'Ata que a solicitação de autorização de empenho cobre (numero_ata-uasg, como o começo de item_key). Uma por rodada: a ata pode ter mais de uma.';

-- 2) Informar a solicitação: a mais ou trocando uma ----------------------------------------
DROP FUNCTION IF EXISTS public.informar_solicitacao_da_ata(UUID, TEXT, TEXT, DATE);
CREATE OR REPLACE FUNCTION public.informar_solicitacao_da_ata(
  p_id UUID, p_ata TEXT, p_documento_sei TEXT, p_assinada_em DATE DEFAULT NULL, p_substitui TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_etapa  TEXT;
  v_sei    TEXT := regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g');
  v_antigo TEXT := NULLIF(regexp_replace(COALESCE(p_substitui, ''), '\D', '', 'g'), '');
  v_outra  TEXT;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram as etapas.' USING ERRCODE = '42501';
  END IF;
  SELECT etapa INTO v_etapa FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_etapa NOT IN ('SOLICITADO', 'AUTORIZADO', 'CGOFI', 'EMPENHADO', 'CONTRATACAO') THEN
    RAISE EXCEPTION 'INVALID_STATE: A solicitação de empenho vem depois da conferência no SIOP.' USING ERRCODE = '22023';
  END IF;
  IF v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Documento SEI: só números, 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.emendas_atas_do_pedido(p_id) a WHERE a = p_ata) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A ata % não está nas linhas do pedido.', split_part(p_ata, '-', 1) USING ERRCODE = '22023';
  END IF;
  IF p_assinada_em IS NOT NULL AND p_assinada_em > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data da assinatura não pode ser depois de hoje.' USING ERRCODE = '22023';
  END IF;
  SELECT ata_key INTO v_outra FROM public.emenda_pedido_documentos_sei
   WHERE pedido_id = p_id AND etapa = 'AUTORIZACAO' AND documento_sei = v_sei;
  IF v_outra IS NOT NULL AND v_outra <> p_ata THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O documento SEI % já é a solicitação da ata %.', v_sei, split_part(v_outra, '-', 1) USING ERRCODE = '22023';
  END IF;
  IF v_antigo IS NOT NULL AND v_antigo <> v_sei AND NOT EXISTS (
       SELECT 1 FROM public.emenda_pedido_documentos_sei
        WHERE pedido_id = p_id AND etapa = 'AUTORIZACAO' AND documento_sei = v_antigo AND ata_key = p_ata) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O documento SEI % não é uma solicitação da ata %.', v_antigo, split_part(p_ata, '-', 1) USING ERRCODE = '22023';
  END IF;

  -- Troca: a solicitação anterior sai da ata e fica no pedido, sem ata.
  IF v_antigo IS NOT NULL AND v_antigo <> v_sei THEN
    UPDATE public.emenda_pedido_documentos_sei
       SET ata_key = NULL
     WHERE pedido_id = p_id AND etapa = 'AUTORIZACAO' AND documento_sei = v_antigo AND ata_key = p_ata;
  END IF;
  INSERT INTO public.emenda_pedido_documentos_sei (pedido_id, etapa, documento_sei, ata_key, assinado_em, origem)
  VALUES (p_id, 'AUTORIZACAO', v_sei, p_ata,
          CASE WHEN p_assinada_em IS NULL THEN NULL ELSE (p_assinada_em + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo' END, 'SISTEMA')
  ON CONFLICT (pedido_id, etapa, documento_sei) DO UPDATE
     SET ata_key = EXCLUDED.ata_key,
         assinado_em = COALESCE(EXCLUDED.assinado_em, emenda_pedido_documentos_sei.assinado_em);
  RETURN jsonb_build_object('ata', p_ata, 'documento_sei', v_sei, 'trocou', CASE WHEN v_antigo <> v_sei THEN v_antigo END);
END;
$$;
REVOKE ALL ON FUNCTION public.informar_solicitacao_da_ata(UUID, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_solicitacao_da_ata(UUID, TEXT, TEXT, DATE, TEXT) TO authenticated;
