-- ==============================================================================
-- MIGRATION 153: get_system_users() MOSTRA COMO PENDENTE QUEM NÃO CONFIRMOU O E-MAIL
-- Versão: 20261022000153_usuario_email_nao_confirmado_pendente.sql
--
-- Defeito (relatado em 22/10/2026): na tela Usuários e Servidores, três servidores apareciam
-- como "Ativo", mas o login respondia "Conta ainda não ativada". As contas tinham sido criadas
-- direto no painel do Supabase, sem convite e sem confirmar o e-mail; o Supabase Auth não deixa
-- entrar quem tem e-mail não confirmado (email_confirmed_at nulo). A lista só tratava como
-- pendente quem recebeu convite e nunca entrou, e por isso mostrava essas contas como ativas.
--
-- Correção: e-mail não confirmado também sai como 'pendente' ("Convite pendente", com o botão
-- "Reenviar convite"). Só muda essa regra; assinatura, checagem de acesso e grants ficam como
-- estavam (CREATE OR REPLACE mantém as permissões).
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
  created_at TIMESTAMPTZ,
  allocation_scope_type TEXT,
  allocation_scope_value TEXT
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
      CASE ur.role_id
        WHEN 'admin' THEN 'coordenador'
        WHEN 'gestor' THEN 'gestor'
        WHEN 'leitor' THEN 'consulta'
        ELSE ur.role_id
      END,
      'sem_perfil'
    )::TEXT AS perfil,
    CASE
      WHEN u.banned_until IS NOT NULL OR u.deleted_at IS NOT NULL THEN 'inativo'
      WHEN u.email_confirmed_at IS NULL
        OR (u.last_sign_in_at IS NULL AND u.invited_at IS NOT NULL) THEN 'pendente'
      ELSE 'ativo'
    END::TEXT AS status,
    (u.banned_until IS NULL AND u.deleted_at IS NULL)::BOOLEAN AS ativo,
    u.last_sign_in_at,
    u.created_at,
    usa.scope_type::TEXT AS allocation_scope_type,
    usa.scope_value::TEXT AS allocation_scope_value
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT usa_inner.scope_type, usa_inner.scope_value
      FROM public.user_scope_assignments usa_inner
     WHERE usa_inner.user_id = u.id AND usa_inner.domain = 'allocations'
     ORDER BY usa_inner.created_at DESC
     LIMIT 1
  ) usa ON TRUE
  ORDER BY u.created_at DESC;
END;
$$;
