-- ==============================================================================
-- REGRESSÃO — 20261014000124_perfil_canonico_e_usuario_desativado.sql
-- Garante que:
--   1) toda tabela do schema public com RLS tem a política restritiva
--      "Somente usuario ativo" (quem foi desativado ou está sem perfil não lê
--      nem grava nada pelo navegador);
--   2) has_role lê o perfil de user_roles.role_id, e não a coluna legada `role`.
--
-- Tabela nova com RLS: criar a política no mesmo padrão da migration 124:
--   CREATE POLICY "Somente usuario ativo" ON public.<tabela> AS RESTRICTIVE
--     FOR ALL TO authenticated
--     USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
--
-- Uso (Postgres local do `supabase start`, nunca contra o projeto remoto):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/usuario_ativo_regression.sql
-- ==============================================================================

BEGIN;

-- Caso 1: nenhuma tabela com RLS sem a política restritiva.
DO $$
DECLARE
  v_faltando TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_faltando
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND c.relrowsecurity
     AND NOT EXISTS (
       SELECT 1
         FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = c.relname
          AND p.policyname = 'Somente usuario ativo'
          AND p.permissive = 'RESTRICTIVE'
          AND p.cmd = 'ALL'
     );

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA caso 1: tabelas sem "Somente usuario ativo": %', v_faltando;
  END IF;
  RAISE NOTICE 'OK caso 1: todas as tabelas com RLS exigem usuário ativo';
END
$$;

-- Caso 2: has_role não lê mais a coluna legada `role`.
DO $$
DECLARE
  v_def TEXT := pg_get_functiondef('public.has_role(text)'::regprocedure);
BEGIN
  IF v_def NOT LIKE '%role_id = required_role%' OR v_def NOT LIKE '%usuario_ativo()%' THEN
    RAISE EXCEPTION 'FALHA caso 2: has_role não usa role_id e usuario_ativo()';
  END IF;
  RAISE NOTICE 'OK caso 2: has_role usa role_id e usuario_ativo()';
END
$$;

ROLLBACK;
