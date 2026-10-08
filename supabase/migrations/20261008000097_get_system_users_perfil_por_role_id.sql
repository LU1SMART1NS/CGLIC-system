-- ==============================================================================
-- MIGRATION 97: get_system_users() PASSA A LER O PERFIL DE user_roles.role_id
-- Versão: 20261008000097_get_system_users_perfil_por_role_id.sql
--
-- Defeito (relatado em 08/10/2026): na tela Usuários e Servidores, ao trocar o perfil de um
-- servidor para "Gestor de Saldo" e salvar, a função manage-user gravava corretamente
-- (role = 'leitor' como marcador legado, role_id = 'gestor_saldos'), mas a lista voltava a
-- mostrar "Consulta / Auditoria". Causa: get_system_users() montava o perfil a partir da
-- coluna legada `role`, onde o Gestor de Saldo é só o marcador 'leitor'. A referência
-- canônica do perfil é `role_id`.
--
-- Correção: a lista lê `role_id` (admin -> coordenador, gestor -> gestor, leitor -> consulta,
-- demais ids saem como estão, ex.: gestor_saldos). Só muda a origem do perfil; assinatura,
-- checagem de acesso (has_role gestor/admin) e grants ficam como estavam.
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
      WHEN u.last_sign_in_at IS NULL AND u.invited_at IS NOT NULL THEN 'pendente'
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
