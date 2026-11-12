-- Fiscalização: trocar o beneficiário de um item que não veio de emenda.
--
-- O item da planilha da SFC (ou incluído à mão) pode ter sido ligado ao beneficiário errado. O fiscal do contrato ou o
-- coordenador escolhe outro do cadastro, com motivo e número SEI; a troca fica no histórico do item (tipo BENEFICIARIO,
-- que já existe desde a migration 272). Item de emenda não troca aqui: o beneficiário vem da linha do pedido, e a
-- correção é no Pedido 360.

CREATE OR REPLACE FUNCTION public.trocar_beneficiario_entrega(p_id uuid, p_beneficiario_id uuid, p_motivo text, p_documento_sei text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_sei    TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI');
  v_nome   TEXT := left(public.nome_do_usuario_logado(), 200);
  e        public.fisc_entregas%ROWTYPE;
  v_novo   public.emenda_beneficiarios%ROWTYPE;
  v_antes  TEXT;
BEGIN
  -- Permissão (fiscal do contrato ou coordenador), item existe, não está encerrado; trava a linha.
  PERFORM public.fisc_conferir_entregas(ARRAY[p_id]);
  SELECT * INTO e FROM public.fisc_entregas WHERE id = p_id;

  IF e.emenda_linha_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este item veio de emenda: o beneficiário é o da linha do pedido, e a troca é no Pedido 360.' USING ERRCODE = '22023';
  END IF;
  IF p_beneficiario_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha o beneficiário do cadastro.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo da troca (10 letras ou mais).' USING ERRCODE = '22023';
  END IF;
  IF v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número SEI do documento que pede a troca.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_novo FROM public.emenda_beneficiarios WHERE id = p_beneficiario_id;
  IF NOT FOUND OR NOT v_novo.ativo THEN
    RAISE EXCEPTION 'NOT_FOUND: Beneficiário não encontrado no cadastro (ou desativado).' USING ERRCODE = 'P0002';
  END IF;
  IF e.beneficiario_id = p_beneficiario_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O item já é deste beneficiário.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(b.nome, b.nome_curto) || COALESCE(' · ' || NULLIF(b.sigla, ''), '') INTO v_antes
    FROM public.emenda_beneficiarios b WHERE b.id = e.beneficiario_id;
  v_antes := COALESCE(v_antes, NULLIF(btrim(COALESCE(e.beneficiario_texto, '')), '') || ' (sem cadastro)', 'sem beneficiário');

  UPDATE public.fisc_entregas
     SET beneficiario_id = p_beneficiario_id, atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, documento_sei, observacao, criado_por, criado_por_nome)
  VALUES (p_id, 'BENEFICIARIO', v_sei,
          left('Trocado de ' || v_antes || ' para ' || COALESCE(v_novo.nome, v_novo.nome_curto) || COALESCE(' · ' || NULLIF(v_novo.sigla, ''), '')
               || '. Motivo: ' || v_motivo, 1000),
          auth.uid(), v_nome);

  RETURN jsonb_build_object('id', p_id, 'antes', v_antes, 'beneficiario', COALESCE(v_novo.nome, v_novo.nome_curto));
END;
$function$;
REVOKE ALL ON FUNCTION public.trocar_beneficiario_entrega(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trocar_beneficiario_entrega(uuid, uuid, text, text) TO authenticated;
