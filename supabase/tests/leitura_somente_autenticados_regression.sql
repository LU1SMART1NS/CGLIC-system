-- ==============================================================================
-- REGRESSÃO — 20261004000065_leitura_somente_autenticados.sql
-- Garante que nenhuma política de leitura `USING (true)` volte a ficar aberta
-- para `public`/`anon` e que o papel `anon` não consiga ler dados do schema public.
--
-- Uso (Postgres local do `supabase start`, nunca contra o projeto remoto):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/leitura_somente_autenticados_regression.sql
-- ==============================================================================

BEGIN;

-- Caso 1: nenhuma política permissiva `USING (true)` aberta a public/anon.
DO $$
DECLARE
  v_abertas TEXT;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_abertas
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND cmd IN ('SELECT', 'ALL')
    AND btrim(COALESCE(qual, ''), '() ') = 'true'
    AND roles && ARRAY['public', 'anon']::name[];

  IF v_abertas IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA caso 1: políticas abertas a public/anon: %', v_abertas;
  END IF;
  RAISE NOTICE 'OK caso 1: nenhuma política aberta a public/anon';
END
$$;

-- Caso 2: como anon, nenhuma tabela do schema public devolve linhas.
DO $$
DECLARE
  t RECORD;
  v_linhas BIGINT;
  v_vazando TEXT := '';
BEGIN
  SET LOCAL ROLE anon;
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t.relname) INTO v_linhas;
      IF v_linhas > 0 THEN
        v_vazando := v_vazando || t.relname || ' ';
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- sem permissão de SELECT para anon: também é uma negação válida
    END;
  END LOOP;
  RESET ROLE;

  IF v_vazando <> '' THEN
    RAISE EXCEPTION 'FALHA caso 2: anon lê dados de: %', v_vazando;
  END IF;
  RAISE NOTICE 'OK caso 2: anon não lê dados de nenhuma tabela com RLS';
END
$$;

ROLLBACK;
