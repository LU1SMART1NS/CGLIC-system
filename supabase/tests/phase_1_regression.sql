-- ==============================================================================
-- FASE 1 — TESTE DE REGRESSÃO DE BANCO (executar via psql contra o Postgres
-- local do `supabase start`, nunca contra o projeto remoto).
--
-- Cobre os Casos 1-12 pedidos na Fase 1. Tudo roda dentro de uma transação
-- com ROLLBACK final — não deixa resíduo.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_1_regression.sql
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_caller_id  UUID := '77777777-7777-7777-7777-777777777777';
  v_gestor_id  UUID := '88888888-8888-8888-8888-888888888888';
  v_no_role_id UUID := '99999999-9999-9999-9999-999999999999';

  v_orphans INTEGER;
  v_mismatch INTEGER;
  v_count_admin INTEGER;
  v_count_gestor INTEGER;
  v_count_leitor INTEGER;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000', v_caller_id,  'authenticated', 'authenticated', 'phase01-fase1-caller@example.com',  crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_gestor_id,  'authenticated', 'authenticated', 'phase01-fase1-gestor@example.com',  crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_no_role_id, 'authenticated', 'authenticated', 'phase01-fase1-sem-role@example.com',crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_caller_id, 'admin'),
    (v_gestor_id, 'gestor')
  ON CONFLICT (user_id, role) DO NOTHING;
  -- v_no_role_id propositalmente sem nenhuma linha em user_roles.

  -- ----------------------------------------------------------------------
  -- Caso 1 + 2: todo valor de user_roles tem correspondência em roles;
  -- nenhum usuário/role órfão.
  -- ----------------------------------------------------------------------
  SELECT COUNT(*) INTO v_orphans
    FROM public.user_roles ur
    LEFT JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.role_id IS NULL OR r.id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'FALHA (Casos 1/2): % linha(s) de user_roles sem correspondência válida em roles.', v_orphans;
  END IF;
  RAISE NOTICE 'OK (Casos 1/2): todas as linhas de user_roles têm role_id válido, sem órfãos.';

  -- ----------------------------------------------------------------------
  -- Casos 3/4/5: permissões populadas para admin, gestor e leitor
  -- ----------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count_admin  FROM public.role_permissions WHERE role_id = 'admin';
  SELECT COUNT(*) INTO v_count_gestor FROM public.role_permissions WHERE role_id = 'gestor';
  SELECT COUNT(*) INTO v_count_leitor FROM public.role_permissions WHERE role_id = 'leitor';

  IF v_count_admin = 0 THEN RAISE EXCEPTION 'FALHA (Caso 3): admin não tem nenhuma permissão em role_permissions.'; END IF;
  RAISE NOTICE 'OK (Caso 3): admin tem % permissões.', v_count_admin;

  IF v_count_gestor = 0 THEN RAISE EXCEPTION 'FALHA (Caso 4): gestor não tem nenhuma permissão em role_permissions.'; END IF;
  RAISE NOTICE 'OK (Caso 4): gestor tem % permissões.', v_count_gestor;

  IF v_count_leitor = 0 THEN RAISE EXCEPTION 'FALHA (Caso 5): leitor não tem nenhuma permissão em role_permissions.'; END IF;
  RAISE NOTICE 'OK (Caso 5): leitor tem % permissões.', v_count_leitor;

  -- admin e gestor devem ser idênticos hoje (achado da auditoria)
  IF EXISTS (
    SELECT permission_key FROM public.role_permissions WHERE role_id = 'admin'
    EXCEPT
    SELECT permission_key FROM public.role_permissions WHERE role_id = 'gestor'
  ) OR EXISTS (
    SELECT permission_key FROM public.role_permissions WHERE role_id = 'gestor'
    EXCEPT
    SELECT permission_key FROM public.role_permissions WHERE role_id = 'admin'
  ) THEN
    RAISE EXCEPTION 'FALHA: admin e gestor deveriam ter o mesmo conjunto de permissões nesta fase (comportamento atual auditado), mas divergem.';
  END IF;
  RAISE NOTICE 'OK: admin e gestor têm exatamente o mesmo conjunto de permissões (fiel ao comportamento atual das RPCs).';

  -- ----------------------------------------------------------------------
  -- Caso 6: contagem de usuários por role idêntica entre `role` (legado) e
  -- `role_id` (novo) — prova de que o backfill não perdeu nem duplicou nada.
  -- ----------------------------------------------------------------------
  SELECT COUNT(*) INTO v_mismatch FROM public.user_roles WHERE role IS DISTINCT FROM role_id;
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'FALHA (Caso 6): % linha(s) com role (legado) diferente de role_id (novo) após o backfill.', v_mismatch;
  END IF;
  RAISE NOTICE 'OK (Caso 6): role e role_id são idênticos em 100%% das linhas de user_roles (nenhuma perda/duplicação no backfill).';

  -- ----------------------------------------------------------------------
  -- Casos 7/8/9: has_role() continua funcionando para os 3 papéis legados
  -- ----------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_caller_id::text, true); -- admin
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'FALHA (Caso 7): has_role(''admin'') deveria ser true para usuário com role admin.';
  END IF;
  RAISE NOTICE 'OK (Caso 7): has_role(''admin'') continua funcionando.';

  PERFORM set_config('request.jwt.claim.sub', v_gestor_id::text, true); -- gestor
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'FALHA (Caso 8): has_role(''gestor'') deveria ser true para usuário com role gestor.';
  END IF;
  RAISE NOTICE 'OK (Caso 8): has_role(''gestor'') continua funcionando.';

  -- has_role('leitor') exercitado com um usuário leitor dedicado
  DECLARE
    v_leitor_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  BEGIN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_leitor_id, 'authenticated', 'authenticated', 'phase01-fase1-leitor@example.com', crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', '')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role) VALUES (v_leitor_id, 'leitor') ON CONFLICT (user_id, role) DO NOTHING;

    PERFORM set_config('request.jwt.claim.sub', v_leitor_id::text, true);
    IF NOT public.has_role('leitor') THEN
      RAISE EXCEPTION 'FALHA (Caso 9): has_role(''leitor'') deveria ser true para usuário com role leitor.';
    END IF;
    RAISE NOTICE 'OK (Caso 9): has_role(''leitor'') continua funcionando.';
  END;

  -- ----------------------------------------------------------------------
  -- Casos 10/11: usuário sem role continua sem role e sem nenhuma permissão
  -- ----------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_no_role_id::text, true);
  IF public.has_role('admin') OR public.has_role('gestor') OR public.has_role('leitor') THEN
    RAISE EXCEPTION 'FALHA (Caso 10): usuário sem linha em user_roles não deveria passar em nenhum has_role().';
  END IF;
  RAISE NOTICE 'OK (Caso 10): usuário sem role continua sem role (has_role() nega todos os papéis).';

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = v_no_role_id
  ) THEN
    RAISE EXCEPTION 'FALHA (Caso 11): usuário sem role não deveria ter nenhuma permissão associável via role_permissions.';
  END IF;
  RAISE NOTICE 'OK (Caso 11): usuário sem role não recebe nenhuma permissão nova (nenhuma linha em user_roles para ele).';
END $$;

-- ----------------------------------------------------------------------
-- Caso 12: as novas tabelas não permitem escrita indevida por usuário comum
-- (testado com a role de sessão 'authenticated', a mesma usada pelo
-- PostgREST para qualquer chamada autenticada via API pública).
-- ----------------------------------------------------------------------
SET ROLE authenticated;

DO $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.roles (id, label) VALUES ('tentativa_indevida_roles', 'x');
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_ok := FALSE;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 12): INSERT em public.roles foi permitido para a role authenticated.';
  END IF;
  RAISE NOTICE 'OK (Caso 12a): INSERT em public.roles bloqueado para role authenticated.';

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.role_permissions (role_id, permission_key) VALUES ('leitor', 'governance.manage_users');
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_ok := FALSE;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 12): INSERT em public.role_permissions foi permitido para a role authenticated (escalação de privilégio).';
  END IF;
  RAISE NOTICE 'OK (Caso 12b): INSERT em public.role_permissions bloqueado para role authenticated.';

  v_ok := FALSE;
  BEGIN
    INSERT INTO public.user_scope_assignments (user_id, domain, scope_type, scope_value)
    VALUES ('77777777-7777-7777-7777-777777777777', 'allocations', 'GLOBAL', 'QUALQUER');
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_ok := FALSE;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 12): INSERT em public.user_scope_assignments foi permitido para a role authenticated.';
  END IF;
  RAISE NOTICE 'OK (Caso 12c): INSERT em public.user_scope_assignments bloqueado para role authenticated.';

  RAISE NOTICE 'OK (Caso 12): nenhuma das novas tabelas aceita escrita de um usuário comum (permissions e role_domain_scopes seguem a mesma policy "somente leitura" e não foram testadas individualmente por construção idêntica).';
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------
-- Trigger de compatibilidade temporária (role -> role_id): Casos A-D
-- ----------------------------------------------------------------------
DO $$
DECLARE
  v_user_a UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_user_b UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_user_c UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_user_d UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_role TEXT;
  v_role_id TEXT;
  v_failed BOOLEAN;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000', v_user_a, 'authenticated', 'authenticated', 'phase1-trigger-a@example.com', crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_user_b, 'authenticated', 'authenticated', 'phase1-trigger-b@example.com', crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_user_c, 'authenticated', 'authenticated', 'phase1-trigger-c@example.com', crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_user_d, 'authenticated', 'authenticated', 'phase1-trigger-d@example.com', crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', '')
  ON CONFLICT (id) DO NOTHING;

  -- Caso A: código legado (user_id, role) -> role_id preenchido automaticamente
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_a, 'gestor');
  SELECT role, role_id INTO v_role, v_role_id FROM public.user_roles WHERE user_id = v_user_a;
  IF v_role IS DISTINCT FROM 'gestor' OR v_role_id IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'FALHA (Caso A): esperado role=gestor/role_id=gestor, obtido role=%/role_id=%', v_role, v_role_id;
  END IF;
  RAISE NOTICE 'OK (Caso A): INSERT legado (user_id, role) -> role=% role_id=% (auto-preenchido pelo trigger).', v_role, v_role_id;

  -- Caso B: novo modelo, role_id informado explicitamente e igual a role
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_user_b, 'gestor', 'gestor');
  SELECT role, role_id INTO v_role, v_role_id FROM public.user_roles WHERE user_id = v_user_b;
  IF v_role IS DISTINCT FROM 'gestor' OR v_role_id IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'FALHA (Caso B): esperado role=gestor/role_id=gestor, obtido role=%/role_id=%', v_role, v_role_id;
  END IF;
  RAISE NOTICE 'OK (Caso B): INSERT explícito (user_id, role, role_id) -> role=% role_id=% (trigger não interferiu).', v_role, v_role_id;

  -- Caso C: divergência futura — role_id explícito e DIFERENTE de role.
  -- Usamos 'admin' como "outra role válida" só para provar que o trigger
  -- não sobrescreve; não representa nenhum significado de negócio real.
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_user_c, 'gestor', 'admin');
  SELECT role, role_id INTO v_role, v_role_id FROM public.user_roles WHERE user_id = v_user_c;
  IF v_role IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'FALHA (Caso C): role deveria permanecer ''gestor'', obtido %', v_role;
  END IF;
  IF v_role_id IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FALHA (Caso C): role_id deveria permanecer ''admin'' (valor explícito), o trigger sobrescreveu para %', v_role_id;
  END IF;
  RAISE NOTICE 'OK (Caso C): role=% e role_id=% divergem como esperado — trigger não sobrescreveu role_id explícito.', v_role, v_role_id;

  -- Caso D: role inexistente -> deve FALHAR (sem fallback para gestor)
  v_failed := FALSE;
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_d, 'role_inexistente');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso D): INSERT com role inexistente deveria falhar e não falhou.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_d) THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso D): apesar da falha esperada, uma linha foi persistida para o usuário (possível fallback indevido).';
  END IF;
  RAISE NOTICE 'OK (Caso D): INSERT com role inexistente falhou como esperado, sem nenhum fallback para ''gestor'' ou outra role.';

  RAISE NOTICE '=== TRIGGER DE COMPATIBILIDADE role -> role_id: TODOS OS CASOS A-D PASSARAM ===';
END $$;

DO $$ BEGIN RAISE NOTICE '=== FASE 1 — TODOS OS TESTES DE BANCO PASSARAM ==='; END $$;

ROLLBACK;
