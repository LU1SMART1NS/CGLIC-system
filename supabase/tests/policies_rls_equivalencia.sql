-- Equivalência de acesso das policies de RLS (migration 20261006000075).
--
-- Roda como cada identidade (admin, gestor, outro usuário logado, anônimo), conta o que ela
-- enxerga em user_roles, user_scope_assignments, atas_registro_preco e itens_ata e testa
-- INSERT/UPDATE/DELETE em user_roles. Termina SEMPRE com uma exceção que reverte a transação
-- inteira; o relatório vai na mensagem ("EQUIV_REPORT"). Nenhum dado é alterado.
--
-- Uso: rode antes e depois da migration e compare os relatórios (tem de ser idênticos):
--   supabase db query --linked -f supabase/tests/policies_rls_equivalencia.sql
-- Para testar a migration sem aplicá-la, concatene o SQL dela antes deste arquivo.

DO $equiv$
DECLARE
  admin_id uuid;
  gestor_id uuid;
  outro_id uuid := '00000000-0000-4000-8000-00000000f00d';
  ident record;
  tabela text;
  n bigint;
  rows_affected bigint;
  rep text := '';
  linha text;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1;
  SELECT user_id INTO gestor_id FROM public.user_roles WHERE role = 'gestor' ORDER BY user_id LIMIT 1;

  FOR ident IN
    SELECT * FROM (VALUES
      ('admin',  'authenticated', admin_id),
      ('gestor', 'authenticated', gestor_id),
      ('outro',  'authenticated', outro_id),
      ('anon',   'anon',          NULL::uuid)
    ) v(nome, papel, uid)
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', ident.uid, 'role', ident.papel)::text, true);
    EXECUTE format('SET LOCAL ROLE %I', ident.papel);

    -- Leitura: quantas linhas a identidade enxerga.
    FOREACH tabela IN ARRAY ARRAY['user_roles', 'user_scope_assignments', 'atas_registro_preco', 'itens_ata']
    LOOP
      BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I', tabela) INTO n;
        linha := format('%s | le %s = %s', ident.nome, tabela, n);
      EXCEPTION WHEN OTHERS THEN
        linha := format('%s | le %s = ERRO %s', ident.nome, tabela, SQLSTATE);
      END;
      rep := rep || linha || E'\n';
    END LOOP;

    -- Escrita em user_roles (cada tentativa é desfeita pelo bloco: a exceção final reverte).
    BEGIN
      UPDATE public.user_roles SET role_id = role_id WHERE user_id = gestor_id;
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      linha := format('%s | UPDATE user_roles = %s linha(s)', ident.nome, rows_affected);
      RAISE EXCEPTION 'desfazer';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'desfazer' THEN linha := format('%s | UPDATE user_roles = ERRO %s', ident.nome, SQLSTATE); END IF;
    END;
    rep := rep || linha || E'\n';

    BEGIN
      DELETE FROM public.user_roles WHERE user_id = gestor_id AND role = 'gestor';
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      linha := format('%s | DELETE user_roles = %s linha(s)', ident.nome, rows_affected);
      RAISE EXCEPTION 'desfazer';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'desfazer' THEN linha := format('%s | DELETE user_roles = ERRO %s', ident.nome, SQLSTATE); END IF;
    END;
    rep := rep || linha || E'\n';

    BEGIN
      INSERT INTO public.user_roles (user_id, role, role_id) VALUES (gestor_id, 'leitor', 'leitor');
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      linha := format('%s | INSERT user_roles = %s linha(s)', ident.nome, rows_affected);
      RAISE EXCEPTION 'desfazer';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'desfazer' THEN linha := format('%s | INSERT user_roles = ERRO %s', ident.nome, SQLSTATE); END IF;
    END;
    rep := rep || linha || E'\n';

    RESET ROLE;
  END LOOP;

  RAISE EXCEPTION 'EQUIV_REPORT%', E'\n' || rep;
END
$equiv$;
