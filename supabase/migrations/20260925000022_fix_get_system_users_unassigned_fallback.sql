-- ==============================================================================
-- MIGRATION 22: FASE 0.2 — CORRIGIR REPRESENTAÇÃO DE USUÁRIO SEM ROLE
-- ==============================================================================
-- Achado da auditoria da Fase 0.1: get_system_users() usava
--   COALESCE(CASE ur.role ... END, 'gestor')
-- Um usuário sem nenhuma linha em public.user_roles (inclusive os que passam
-- a ficar sem role por causa do fail-closed da Fase 0.1) era exibido pela
-- camada administrativa como se fosse "gestor" — incompatível com o
-- princípio "ausência de autoridade = ausência de role".
--
-- Esta migration troca apenas o valor padrão do COALESCE por 'sem_perfil'
-- (id estável, mapeado para o rótulo "Não atribuído" no frontend via
-- getPerfilDisplayLabel em src/types/user.ts). Nenhuma outra regra de
-- autorização é alterada: a checagem has_role('gestor' OR 'admin') no topo
-- da função permanece idêntica, e a função continua somente leitura.
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
      'sem_perfil'
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
