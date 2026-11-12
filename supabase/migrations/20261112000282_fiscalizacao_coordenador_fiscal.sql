-- O coordenador também pode ser fiscal (12/11/2026). Até aqui só o perfil Gestor de Fiscalização era aceito como
-- fiscal nas RPCs (definir_fiscalizacao_contrato, transferências), embora a carga da planilha já tivesse posto o
-- coordenador como fiscal de contratos. Agora aceita Gestor de Fiscalização ou Coordenador (role admin), ativo.
CREATE OR REPLACE FUNCTION public.fisc_nome_do_fiscal(p_user UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_nome TEXT;
BEGIN
  SELECT COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'nome'), ''), NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
    INTO v_nome
    FROM auth.users u
   WHERE u.id = p_user
     AND (u.banned_until IS NULL OR u.banned_until <= NOW())
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role_id IN ('gestor_fiscalizacao', 'admin'));
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha um servidor ativo com o perfil Gestor de Fiscalização ou Coordenador.' USING ERRCODE = '22023';
  END IF;
  RETURN left(v_nome, 150);
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_nome_do_fiscal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_nome_do_fiscal(UUID) TO service_role;
