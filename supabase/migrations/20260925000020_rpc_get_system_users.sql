-- ==============================================================================
-- MIGRATION 20: RPC CONSULTA DE USUÁRIOS E STATUS DE AUTENTICAÇÃO — SALDOARP 3.0
-- Versão: 20260925000020_rpc_get_system_users.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_system_users()
RETURNS TABLE (
  id UUID,
  nome TEXT,
  email TEXT,
  perfil TEXT,
  status TEXT,
  ativo BOOLEAN,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    COALESCE(
      NULLIF(u.raw_user_meta_data->>'nome', ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      split_part(u.email, '@', 1)
    )::TEXT AS nome,
    u.email::TEXT,
    COALESCE(
      CASE ur.role
        WHEN 'admin' THEN 'coordenador'
        WHEN 'gestor' THEN 'gestor'
        WHEN 'leitor' THEN 'consulta'
        ELSE ur.role
      END,
      'gestor'
    )::TEXT AS perfil,
    CASE 
      WHEN u.banned_until IS NOT NULL OR u.deleted_at IS NOT NULL THEN 'inativo'
      WHEN u.last_sign_in_at IS NULL AND u.invited_at IS NOT NULL THEN 'pendente'
      ELSE 'ativo'
    END::TEXT AS status,
    (u.banned_until IS NULL AND u.deleted_at IS NULL)::BOOLEAN AS ativo,
    u.last_sign_in_at,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
