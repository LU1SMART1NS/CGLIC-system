-- ==============================================================================
-- FASE 0.2 — TESTE DE REGRESSÃO DE BANCO (executar via psql contra o Postgres
-- local do `supabase start`, nunca contra o projeto remoto).
--
-- Cobre:
--   Caso 1: usuário com user_roles = 'gestor' -> perfil = 'gestor'.
--   Caso 2: usuário com user_roles = 'leitor' -> perfil = 'consulta'.
--   Caso 3: usuário com user_roles = 'admin'  -> perfil = 'coordenador'.
--   Caso 4 (parte SQL): usuário sem nenhuma linha em user_roles -> perfil =
--           'sem_perfil' (id estável; o rótulo "Não atribuído" é resolvido
--           no frontend por getPerfilDisplayLabel — ver src/types/__tests__/user.test.ts),
--           e NUNCA 'gestor'.
--   Caso 5: a chamada a get_system_users() não concede nem remove nenhuma
--           autoridade real — é comparado o conteúdo de user_roles antes e
--           depois da chamada.
--
-- Tudo roda dentro de uma única transação com ROLLBACK no final.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_0_2_regression.sql
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_caller_id  UUID := '22222222-2222-2222-2222-222222222222'; -- chamador (precisa de gestor/admin para poder chamar a RPC)
  v_gestor_id  UUID := '33333333-3333-3333-3333-333333333333';
  v_leitor_id  UUID := '44444444-4444-4444-4444-444444444444';
  v_admin_id   UUID := '55555555-5555-5555-5555-555555555555';
  v_no_role_id UUID := '66666666-6666-6666-6666-666666666666';

  v_perfil_gestor   TEXT;
  v_perfil_leitor   TEXT;
  v_perfil_admin    TEXT;
  v_perfil_no_role  TEXT;

  v_user_roles_count_before INTEGER;
  v_user_roles_count_after  INTEGER;
  v_user_roles_snapshot_before TEXT;
  v_user_roles_snapshot_after  TEXT;
BEGIN
  -- Fixtures: 5 usuários de teste em auth.users (chamador + 4 casos)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000', v_caller_id,  'authenticated', 'authenticated', 'phase02-caller@example.com',  crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_gestor_id,  'authenticated', 'authenticated', 'phase02-gestor@example.com',  crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_leitor_id,  'authenticated', 'authenticated', 'phase02-leitor@example.com',  crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_admin_id,   'authenticated', 'authenticated', 'phase02-admin@example.com',   crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''),
    ('00000000-0000-0000-0000-000000000000', v_no_role_id, 'authenticated', 'authenticated', 'phase02-sem-role@example.com',crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', '')
  ON CONFLICT (id) DO NOTHING;

  -- Concede roles reais em user_roles (o caller precisa de 'gestor' ou 'admin' para poder executar a RPC)
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_caller_id, 'admin'),
    (v_gestor_id, 'gestor'),
    (v_leitor_id, 'leitor'),
    (v_admin_id,  'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  -- v_no_role_id propositalmente NÃO recebe nenhuma linha em user_roles.

  SELECT COUNT(*) INTO v_user_roles_count_before FROM public.user_roles;
  SELECT string_agg(user_id::text || ':' || role, ',' ORDER BY user_id, role) INTO v_user_roles_snapshot_before FROM public.user_roles;

  -- Simula sessão autenticada do chamador (precisa de gestor/admin para chamar get_system_users)
  PERFORM set_config('request.jwt.claim.sub', v_caller_id::text, true);

  -- --------------------------------------------------------------------------
  -- Casos 1-4: leitura via get_system_users() e verificação da coluna perfil
  -- --------------------------------------------------------------------------
  SELECT perfil INTO v_perfil_gestor  FROM public.get_system_users() WHERE id = v_gestor_id;
  SELECT perfil INTO v_perfil_leitor  FROM public.get_system_users() WHERE id = v_leitor_id;
  SELECT perfil INTO v_perfil_admin   FROM public.get_system_users() WHERE id = v_admin_id;
  SELECT perfil INTO v_perfil_no_role FROM public.get_system_users() WHERE id = v_no_role_id;

  IF v_perfil_gestor IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'FALHA (Caso 1): esperado perfil=''gestor'' para usuário com user_roles=gestor, obtido=%', v_perfil_gestor;
  END IF;
  RAISE NOTICE 'OK (Caso 1): user_roles=gestor -> perfil=%', v_perfil_gestor;

  IF v_perfil_leitor IS DISTINCT FROM 'consulta' THEN
    RAISE EXCEPTION 'FALHA (Caso 2): esperado perfil=''consulta'' para usuário com user_roles=leitor, obtido=%', v_perfil_leitor;
  END IF;
  RAISE NOTICE 'OK (Caso 2): user_roles=leitor -> perfil=%', v_perfil_leitor;

  IF v_perfil_admin IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'FALHA (Caso 3): esperado perfil=''coordenador'' para usuário com user_roles=admin, obtido=%', v_perfil_admin;
  END IF;
  RAISE NOTICE 'OK (Caso 3): user_roles=admin -> perfil=%', v_perfil_admin;

  IF v_perfil_no_role IS DISTINCT FROM 'sem_perfil' THEN
    RAISE EXCEPTION 'FALHA (Caso 4): esperado perfil=''sem_perfil'' para usuário sem user_roles, obtido=%', v_perfil_no_role;
  END IF;
  IF v_perfil_no_role = 'gestor' THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 4): usuário sem user_roles foi apresentado como ''gestor''.';
  END IF;
  RAISE NOTICE 'OK (Caso 4): usuário sem user_roles -> perfil=%  (nunca ''gestor'')', v_perfil_no_role;

  -- --------------------------------------------------------------------------
  -- Caso 5: get_system_users() é somente leitura — user_roles não muda
  -- --------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_user_roles_count_after FROM public.user_roles;
  SELECT string_agg(user_id::text || ':' || role, ',' ORDER BY user_id, role) INTO v_user_roles_snapshot_after FROM public.user_roles;

  IF v_user_roles_count_before IS DISTINCT FROM v_user_roles_count_after
     OR v_user_roles_snapshot_before IS DISTINCT FROM v_user_roles_snapshot_after THEN
    RAISE EXCEPTION 'FALHA (Caso 5): get_system_users() alterou public.user_roles (antes=% depois=%)', v_user_roles_snapshot_before, v_user_roles_snapshot_after;
  END IF;
  RAISE NOTICE 'OK (Caso 5): get_system_users() não concedeu nem removeu nenhuma autoridade real (user_roles inalterado: % linhas).', v_user_roles_count_after;

  RAISE NOTICE '=== FASE 0.2 — TODOS OS TESTES DE BANCO PASSARAM ===';
END $$;

ROLLBACK;
