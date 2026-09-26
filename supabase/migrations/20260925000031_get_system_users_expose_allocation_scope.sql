-- ==============================================================================
-- MIGRATION 31: FASE 3A — EXPOR ESCOPO DE ALOCAÇÃO EM get_system_users()
-- ==============================================================================
-- Escopo estrito: SOMENTE get_system_users(). Necessário para a tela de
-- usuários poder exibir "quais scopes foram concedidos" a um Gestor de Saldo,
-- como pedido explicitamente na Fase 3A. Nenhuma regra de autorização muda
-- (a checagem has_permission/has_role no topo da função é preservada) — só a
-- projeção de colunas.
--
-- Como o tipo de retorno muda (novas colunas), é necessário DROP + CREATE
-- (CREATE OR REPLACE não permite alterar a assinatura de retorno). Não havia
-- nenhum GRANT/REVOKE explícito para esta função em nenhuma migration
-- anterior (confirmado por auditoria) — o comportamento de EXECUTE para
-- PUBLIC por padrão do Postgres é preservado, idêntico ao estado atual.
--
-- Se um usuário tiver mais de uma linha em user_scope_assignments para o
-- domínio 'allocations' (não ocorre hoje pelo fluxo de atribuição atual, que
-- substitui a atribuição anterior a cada nova atribuição), apenas uma é
-- retornada (a mais recente por created_at) — suficiente para o uso atual da
-- UI, que só edita uma atribuição por vez.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_system_users();

CREATE FUNCTION public.get_system_users()
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
