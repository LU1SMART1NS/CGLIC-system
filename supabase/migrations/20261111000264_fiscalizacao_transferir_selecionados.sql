-- ==============================================================================
-- Fiscalização › Distribuição › Equipe: transferir só os contratos marcados (11/11/2026).
-- transferir_contratos_fiscal ganha p_contract_keys. Sem lista (NULL), passa todos os contratos do fiscal, como antes.
-- Com lista, mexe só nesses contratos e só onde a origem é o fiscal ou o substituto.
-- A função antiga (2 parâmetros) sai para não haver duas versões com o mesmo nome no PostgREST.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.transferir_contratos_fiscal(UUID, UUID);

CREATE OR REPLACE FUNCTION public.transferir_contratos_fiscal(
  p_origem_user_id UUID,
  p_destino_user_id UUID,
  p_contract_keys TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_destino TEXT;
  v_nome    TEXT := left(public.nome_do_usuario_logado(), 200);
  v_titular INTEGER := 0;
  v_subst   INTEGER := 0;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador transfere os contratos do fiscal.' USING ERRCODE = '42501';
  END IF;
  IF p_origem_user_id IS NULL OR p_destino_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe de quem e para quem.' USING ERRCODE = '22023';
  END IF;
  IF p_origem_user_id = p_destino_user_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha outra pessoa para receber os contratos.' USING ERRCODE = '22023';
  END IF;
  IF p_contract_keys IS NOT NULL AND cardinality(p_contract_keys) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Marque ao menos um contrato.' USING ERRCODE = '22023';
  END IF;
  v_destino := public.fisc_nome_do_fiscal(p_destino_user_id);
  PERFORM public.fisc_destino_presente(p_destino_user_id);
  PERFORM pg_advisory_xact_lock(hashtext('fisc_transferencia:' || p_origem_user_id::text));
  IF EXISTS (SELECT 1 FROM public.fisc_transferencias_temporarias WHERE ausente_user_id = p_origem_user_id AND desfeita_em IS NULL) THEN
    RAISE EXCEPTION 'JA_AUSENTE: Este fiscal tem uma ausência em curso. Desfaça antes de transferir.' USING ERRCODE = '22023';
  END IF;

  -- Fiscal titular: o destino assume; se era o substituto, o contrato fica sem substituto.
  UPDATE public.fisc_contratos f
     SET fiscal_user_id = p_destino_user_id, fiscal_nome = v_destino,
         substituto_user_id = CASE WHEN f.substituto_user_id = p_destino_user_id THEN NULL ELSE f.substituto_user_id END,
         substituto_nome = CASE WHEN f.substituto_user_id = p_destino_user_id THEN NULL ELSE f.substituto_nome END,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE f.fiscal_user_id = p_origem_user_id
     AND (p_contract_keys IS NULL OR f.contract_key = ANY (p_contract_keys));
  GET DIAGNOSTICS v_titular = ROW_COUNT;

  -- Substituto: o destino passa a substituto, salvo onde ele já é o fiscal.
  UPDATE public.fisc_contratos f
     SET substituto_user_id = CASE WHEN f.fiscal_user_id = p_destino_user_id THEN NULL ELSE p_destino_user_id END,
         substituto_nome = CASE WHEN f.fiscal_user_id = p_destino_user_id THEN NULL ELSE v_destino END,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE f.substituto_user_id = p_origem_user_id
     AND (p_contract_keys IS NULL OR f.contract_key = ANY (p_contract_keys));
  GET DIAGNOSTICS v_subst = ROW_COUNT;

  IF v_titular + v_subst = 0 THEN
    IF p_contract_keys IS NULL THEN
      RAISE EXCEPTION 'NADA_A_TRANSFERIR: Este fiscal não tem contratos.' USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'NADA_A_TRANSFERIR: Nenhum dos contratos marcados é deste fiscal.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('fiscal', v_titular, 'substituto', v_subst, 'destino', v_destino);
END;
$$;
REVOKE ALL ON FUNCTION public.transferir_contratos_fiscal(UUID, UUID, TEXT[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transferir_contratos_fiscal(UUID, UUID, TEXT[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
