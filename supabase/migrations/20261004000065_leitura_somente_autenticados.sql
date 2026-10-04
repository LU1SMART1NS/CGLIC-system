-- ==============================================================================
-- 20261004000065 — Leitura de dados somente para usuários autenticados
--
-- PROBLEMA: dezenas de políticas SELECT foram criadas como `USING (true)` sem
-- cláusula TO (vale para PUBLIC, inclusive o papel `anon`) ou explicitamente
-- `TO anon` / `TO public`. Como a chave pública (anon/publishable) vai embutida
-- no site, qualquer pessoa na internet conseguia consultar essas tabelas direto
-- pela API REST, sem passar pela tela de login.
--
-- CORREÇÃO: toda política SELECT permissiva (`USING (true)`) aberta a `public`
-- ou `anon` passa a valer só para `authenticated`. A migration varre o catálogo
-- (pg_policies) em vez de listar nomes, para cobrir também as políticas criadas
-- em migrations posteriores. É idempotente: rodar de novo não altera nada.
--
-- NÃO MUDA: políticas de escrita, RPCs, regras por perfil (has_role etc.) e o
-- acesso de usuários logados. As Edge Functions usam a service_role, que ignora
-- RLS, e não são afetadas.
-- ==============================================================================

DO $$
DECLARE
  pol RECORD;
  v_convertidas INTEGER := 0;
  v_removidas INTEGER := 0;
  v_restantes INTEGER;
  v_sem_rls TEXT;
BEGIN
  FOR pol IN
    SELECT p.schemaname, p.tablename, p.policyname, p.roles
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.permissive = 'PERMISSIVE'
      AND p.cmd = 'SELECT'
      AND btrim(COALESCE(p.qual, ''), '() ') = 'true'
      AND (p.roles && ARRAY['public', 'anon']::name[])
    ORDER BY p.tablename, p.policyname
  LOOP
    IF pol.roles = ARRAY['anon']::name[]
       AND EXISTS (
         SELECT 1 FROM pg_policies o
         WHERE o.schemaname = pol.schemaname
           AND o.tablename = pol.tablename
           AND o.policyname <> pol.policyname
           AND o.permissive = 'PERMISSIVE'
           AND o.cmd IN ('SELECT', 'ALL')
           AND btrim(COALESCE(o.qual, ''), '() ') = 'true'
           AND o.roles && ARRAY['authenticated']::name[]
       )
    THEN
      -- Política exclusiva de anon e a tabela já tem a equivalente para
      -- authenticated: basta remover a de anon.
      EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
      v_removidas := v_removidas + 1;
      RAISE NOTICE 'removida: % em %', pol.policyname, pol.tablename;
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', pol.policyname, pol.schemaname, pol.tablename);
      v_convertidas := v_convertidas + 1;
      RAISE NOTICE 'restrita a authenticated: % em %', pol.policyname, pol.tablename;
    END IF;
  END LOOP;

  -- Trava: nada permissivo `USING (true)` pode continuar aberto a public/anon.
  SELECT count(*) INTO v_restantes
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.permissive = 'PERMISSIVE'
    AND p.cmd IN ('SELECT', 'ALL')
    AND btrim(COALESCE(p.qual, ''), '() ') = 'true'
    AND (p.roles && ARRAY['public', 'anon']::name[]);

  IF v_restantes > 0 THEN
    RAISE EXCEPTION 'Ainda restam % política(s) aberta(s) a public/anon; migration revertida.', v_restantes;
  END IF;

  -- Aviso (não bloqueia): tabelas do schema public sem RLS ficam abertas a anon.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_sem_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  IF v_sem_rls IS NOT NULL THEN
    RAISE WARNING 'Tabelas em public SEM RLS (abertas a anon): %', v_sem_rls;
  END IF;

  RAISE NOTICE 'Leitura restrita a authenticated: % política(s) convertida(s), % removida(s).', v_convertidas, v_removidas;
END
$$;
