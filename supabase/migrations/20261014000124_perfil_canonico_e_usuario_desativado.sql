-- ==============================================================================
-- Perfil pelo role_id e acesso cortado na hora para quem foi desativado
--
-- 1) has_role passa a ler user_roles.role_id (o perfil de verdade), e não mais a
--    coluna legada `role`. A coluna legada só aceita admin/gestor/leitor, e o
--    manage-user grava 'leitor' nela para o gestor de saldo. Com isso:
--      - has_role('gestor_saldos') era sempre falso: o gestor de saldo recebia
--        "sem permissão" ao marcar ou reexibir aviso (migrations 101 e 113);
--      - has_role('leitor') era verdadeiro para o gestor de saldo.
--    A leitura do gestor de saldo nas tabelas de pagamento dependia desse
--    segundo efeito. Para não mudar o que ele vê hoje, as políticas de leitura
--    com has_role('leitor') passam a aceitar também has_role('gestor_saldos').
--
-- 2) Quem foi desativado (bloqueio no Supabase Auth) perde o acesso na hora.
--    Antes, a sessão aberta continuava valendo até o token expirar (até 1 h),
--    lendo tudo e chamando as RPCs com o perfil que tinha.
--      - usuario_ativo(): logado, não bloqueado e com perfil em user_roles;
--      - has_role e has_permission devolvem falso para quem não está ativo;
--      - toda tabela do schema public com RLS ganha a política restritiva
--        "Somente usuario ativo" para authenticated. Ela vale junto com as
--        demais: quem não está ativo não lê nem grava nada pelo navegador.
--    O servidor (service_role) e o cron não passam por RLS e não mudam.
--
-- Tabela nova: criar a mesma política restritiva (ver
-- supabase/tests/usuario_ativo_regression.sql).
-- ==============================================================================

-- 1. Usuário ativo ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_ativo()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
     AND NOT EXISTS (
       SELECT 1
         FROM auth.users u
        WHERE u.id = auth.uid()
          AND u.banned_until IS NOT NULL
          AND u.banned_until > now()
     );
$$;

REVOKE ALL ON FUNCTION public.usuario_ativo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_ativo() TO authenticated, service_role;

-- 2. has_role pelo role_id ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT public.usuario_ativo() THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = auth.uid()
       AND (role_id = required_role OR role_id = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. has_permission recusa quem não está ativo ----------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.usuario_ativo() THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
     WHERE ur.user_id = auth.uid()
       AND rp.permission_key = p_permission_key
  );
END;
$$;

-- 4. Gestor de saldo mantém a leitura que já tinha ------------------------------
DO $$
DECLARE
  p RECORD;
  v_n INT := 0;
BEGIN
  FOR p IN
    SELECT tablename, policyname, qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND qual LIKE '%has_role(''leitor''::text)%'
       AND qual NOT LIKE '%has_role(''gestor_saldos''::text)%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING ((%s) OR public.has_role(''gestor_saldos''))',
      p.policyname, p.tablename, p.qual
    );
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'Políticas de leitura com gestor_saldos: %', v_n;
END
$$;

-- 5. Política restritiva em todas as tabelas com RLS -----------------------------
DO $$
DECLARE
  t RECORD;
  v_n INT := 0;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Somente usuario ativo', t.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))',
      'Somente usuario ativo', t.relname
    );
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'Tabelas com a política "Somente usuario ativo": %', v_n;
END
$$;
