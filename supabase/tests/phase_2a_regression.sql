-- ==============================================================================
-- FASE 2A — TESTE DE REGRESSÃO DE BANCO para has_permission()/has_scope()
-- (executar via psql contra o Postgres local do `supabase start`, nunca
-- contra o projeto remoto).
--
-- Cobre os Casos 1-12 pedidos. Algumas roles/permissões usadas aqui são
-- SINTÉTICAS e existem só dentro desta transação (ROLLBACK no final) — servem
-- para isolar cenários (ex.: uma role com UNIT mas sem GLOBAL) que as roles
-- reais (admin/gestor/leitor) não conseguem exercitar isoladamente, já que
-- gestor/admin hoje têm GLOBAL em allocations. Nenhuma role sintética é
-- persistida; nada aqui cria gestor_contratos/gestor_saldos de verdade.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_2a_regression.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Fixtures: roles sintéticas isoladas para os cenários de escopo/múltiplas roles
-- ------------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES
  ('test_only_contracts_assign', 'Teste: só contracts.assign', FALSE),
  ('test_only_departments_manage', 'Teste: só departments.manage', FALSE),
  ('test_scope_global', 'Teste: allocations.manage + escopo GLOBAL', FALSE),
  ('test_scope_unit', 'Teste: allocations.manage + escopo UNIT', FALSE),
  ('test_scope_arp', 'Teste: allocations.manage + escopo ARP', FALSE),
  ('test_scope_unit_no_permission', 'Teste: escopo UNIT sem nenhuma permissão', FALSE);

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('test_only_contracts_assign', 'contracts.assign'),
  ('test_only_departments_manage', 'departments.manage'),
  ('test_scope_global', 'allocations.manage'),
  ('test_scope_unit', 'allocations.manage'),
  ('test_scope_arp', 'allocations.manage');
  -- test_scope_unit_no_permission propositalmente SEM nenhuma linha aqui.

INSERT INTO public.role_domain_scopes (role_id, domain, scope_type) VALUES
  ('test_scope_global', 'allocations', 'GLOBAL'),
  ('test_scope_unit', 'allocations', 'UNIT'),
  ('test_scope_arp', 'allocations', 'ARP'),
  ('test_scope_unit_no_permission', 'allocations', 'UNIT');

DO $$
DECLARE
  v_no_role_id      UUID := '10000000-0000-0000-0000-000000000001';
  v_leitor_id       UUID := '10000000-0000-0000-0000-000000000002';
  v_gestor_id       UUID := '10000000-0000-0000-0000-000000000003';
  v_multi_role_id   UUID := '10000000-0000-0000-0000-000000000004';
  v_global_id       UUID := '10000000-0000-0000-0000-000000000005';
  v_unit_id         UUID := '10000000-0000-0000-0000-000000000006';
  v_arp_id          UUID := '10000000-0000-0000-0000-000000000007';
  v_perm_no_scope_id UUID := '10000000-0000-0000-0000-000000000008';
  v_scope_no_perm_id UUID := '10000000-0000-0000-0000-000000000009';
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''
  FROM (VALUES
    (v_no_role_id,       'phase2a-no-role@example.com'),
    (v_leitor_id,        'phase2a-leitor@example.com'),
    (v_gestor_id,        'phase2a-gestor@example.com'),
    (v_multi_role_id,    'phase2a-multi-role@example.com'),
    (v_global_id,        'phase2a-scope-global@example.com'),
    (v_unit_id,          'phase2a-scope-unit@example.com'),
    (v_arp_id,           'phase2a-scope-arp@example.com'),
    (v_perm_no_scope_id, 'phase2a-perm-no-scope@example.com'),
    (v_scope_no_perm_id, 'phase2a-scope-no-perm@example.com')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  -- v_no_role_id: propositalmente sem nenhuma linha em user_roles.
  INSERT INTO public.user_roles (user_id, role) VALUES (v_leitor_id, 'leitor');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_gestor_id, 'gestor');

  -- multi-role: duas roles sintéticas isoladas, cada uma com UMA permissão
  -- que a outra não tem. O `role` legado aqui é só um placeholder válido
  -- para satisfazer o CHECK/UNIQUE(user_id, role) existente — o que importa
  -- é o role_id explícito de cada linha (o trigger da Fase 1 não sobrescreve
  -- role_id quando ele vem explícito).
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_role_id, 'gestor', 'test_only_contracts_assign');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_role_id, 'leitor', 'test_only_departments_manage');

  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_global_id, 'gestor', 'test_scope_global');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_unit_id, 'gestor', 'test_scope_unit');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_arp_id, 'gestor', 'test_scope_arp');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_perm_no_scope_id, 'gestor', 'test_scope_unit'); -- tem permission, mas sem assignment (Caso 8)
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_scope_no_perm_id, 'gestor', 'test_scope_unit_no_permission'); -- tem scope, mas sem permission (Caso 9)

  -- Atribuições individuais (user_scope_assignments)
  INSERT INTO public.user_scope_assignments (user_id, domain, scope_type, scope_value) VALUES
    (v_unit_id, 'allocations', 'UNIT', 'CGLIC'),
    (v_arp_id, 'allocations', 'ARP', 'ata-a'),
    (v_scope_no_perm_id, 'allocations', 'UNIT', 'CGLIC');
  -- v_perm_no_scope_id propositalmente SEM nenhuma linha em user_scope_assignments.

  -- ============================================================
  -- Caso 1: usuário sem role -> has_permission(qualquer) = FALSE
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_no_role_id::text, true);
  IF public.has_permission('allocations.view') OR public.has_permission('allocations.manage') OR public.has_permission('reports.export') THEN
    RAISE EXCEPTION 'FALHA (Caso 1): usuário sem role não deveria ter nenhuma permissão.';
  END IF;
  RAISE NOTICE 'OK (Caso 1): usuário sem role -> has_permission sempre FALSE.';

  -- ============================================================
  -- Caso 2: leitor -> view TRUE, manage FALSE
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_leitor_id::text, true);
  IF NOT public.has_permission('allocations.view') THEN
    RAISE EXCEPTION 'FALHA (Caso 2): leitor deveria ter allocations.view.';
  END IF;
  IF public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'FALHA (Caso 2): leitor NÃO deveria ter allocations.manage.';
  END IF;
  RAISE NOTICE 'OK (Caso 2): leitor -> allocations.view=TRUE, allocations.manage=FALSE.';

  -- ============================================================
  -- Caso 3: gestor -> allocations.manage TRUE
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_gestor_id::text, true);
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'FALHA (Caso 3): gestor deveria ter allocations.manage.';
  END IF;
  RAISE NOTICE 'OK (Caso 3): gestor -> allocations.manage=TRUE.';

  -- ============================================================
  -- Caso 4: duas roles -> união de permissões
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_multi_role_id::text, true);
  IF NOT public.has_permission('contracts.assign') THEN
    RAISE EXCEPTION 'FALHA (Caso 4): usuário multi-role deveria ter contracts.assign (via role A).';
  END IF;
  IF NOT public.has_permission('departments.manage') THEN
    RAISE EXCEPTION 'FALHA (Caso 4): usuário multi-role deveria ter departments.manage (via role B).';
  END IF;
  IF public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'FALHA (Caso 4): usuário multi-role NÃO deveria ter allocations.manage (nenhuma das duas roles concede).';
  END IF;
  RAISE NOTICE 'OK (Caso 4): usuário com duas roles -> união correta das permissões (A=TRUE, B=TRUE, C=FALSE).';

  -- ============================================================
  -- Caso 5: allocations.manage + GLOBAL -> qualquer unidade/ARP libera
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_global_id::text, true);
  IF NOT public.has_scope('allocations', 'UNIT', 'CGLIC') THEN
    RAISE EXCEPTION 'FALHA (Caso 5): escopo GLOBAL deveria liberar UNIT=CGLIC.';
  END IF;
  IF NOT public.has_scope('allocations', 'UNIT', 'QUALQUER_OUTRA') THEN
    RAISE EXCEPTION 'FALHA (Caso 5): escopo GLOBAL deveria liberar qualquer UNIT.';
  END IF;
  IF NOT public.has_scope('allocations', 'ARP', 'ata-zzz') THEN
    RAISE EXCEPTION 'FALHA (Caso 5): escopo GLOBAL deveria liberar qualquer ARP.';
  END IF;
  RAISE NOTICE 'OK (Caso 5): escopo GLOBAL libera qualquer UNIT/ARP compatível com o domínio.';

  -- ============================================================
  -- Caso 6: UNIT + assignment CGLIC -> CGLIC TRUE, OUTRA FALSE
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_unit_id::text, true);
  IF NOT public.has_scope('allocations', 'UNIT', 'CGLIC') THEN
    RAISE EXCEPTION 'FALHA (Caso 6): CGLIC deveria ser TRUE (atribuição existente).';
  END IF;
  IF public.has_scope('allocations', 'UNIT', 'OUTRA_UNIDADE') THEN
    RAISE EXCEPTION 'FALHA (Caso 6): OUTRA_UNIDADE deveria ser FALSE (sem atribuição).';
  END IF;
  RAISE NOTICE 'OK (Caso 6): escopo UNIT respeita a atribuição individual (CGLIC=TRUE, OUTRA=FALSE).';

  -- ============================================================
  -- Caso 7: ARP + assignment ata-a -> ata-a TRUE, ata-b FALSE
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_arp_id::text, true);
  IF NOT public.has_scope('allocations', 'ARP', 'ata-a') THEN
    RAISE EXCEPTION 'FALHA (Caso 7): ata-a deveria ser TRUE (atribuição existente).';
  END IF;
  IF public.has_scope('allocations', 'ARP', 'ata-b') THEN
    RAISE EXCEPTION 'FALHA (Caso 7): ata-b deveria ser FALSE (sem atribuição).';
  END IF;
  RAISE NOTICE 'OK (Caso 7): escopo ARP respeita a atribuição individual (ata-a=TRUE, ata-b=FALSE).';

  -- ============================================================
  -- Caso 8: permission SEM scope (UNIT sem nenhuma atribuição)
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_perm_no_scope_id::text, true);
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'FALHA (Caso 8): deveria ter allocations.manage (role concede).';
  END IF;
  IF public.has_scope('allocations', 'UNIT', 'CGLIC') THEN
    RAISE EXCEPTION 'FALHA (Caso 8): has_scope deveria ser FALSE (nenhuma atribuição individual existe).';
  END IF;
  RAISE NOTICE 'OK (Caso 8): has_permission=TRUE e has_scope=FALSE são independentes, como esperado.';

  -- ============================================================
  -- Caso 9: scope presente, SEM permission
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_scope_no_perm_id::text, true);
  IF public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'FALHA (Caso 9): NÃO deveria ter allocations.manage (role sem essa permissão).';
  END IF;
  IF NOT public.has_scope('allocations', 'UNIT', 'CGLIC') THEN
    RAISE EXCEPTION 'FALHA (Caso 9): has_scope deveria ser TRUE (atribuição existe, independente da permissão).';
  END IF;
  RAISE NOTICE 'OK (Caso 9): has_permission=FALSE mesmo com has_scope=TRUE — uma futura RPC precisa exigir os dois.';

  -- ============================================================
  -- Caso 10: sem auth.uid() (sessão sem claim) -> FALSE
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF public.has_permission('allocations.view') THEN
    RAISE EXCEPTION 'FALHA (Caso 10): sem auth.uid(), has_permission deveria ser FALSE.';
  END IF;
  IF public.has_scope('allocations', 'GLOBAL', 'qualquer') THEN
    RAISE EXCEPTION 'FALHA (Caso 10): sem auth.uid(), has_scope deveria ser FALSE.';
  END IF;
  RAISE NOTICE 'OK (Caso 10): sem auth.uid() -> has_permission e has_scope retornam FALSE.';

  -- ============================================================
  -- Caso 11: role válida, permission_key inexistente -> FALSE
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_gestor_id::text, true);
  IF public.has_permission('essa.permissao_nao_existe') THEN
    RAISE EXCEPTION 'FALHA (Caso 11): permission_key inexistente deveria retornar FALSE.';
  END IF;
  RAISE NOTICE 'OK (Caso 11): permission_key inexistente -> FALSE, sem erro.';

  -- ============================================================
  -- Caso 12: role válida, escopo pedido incompatível com o concedido -> FALSE
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_unit_id::text, true); -- só tem UNIT, não ARP nem GLOBAL
  IF public.has_scope('allocations', 'ARP', 'ata-a') THEN
    RAISE EXCEPTION 'FALHA (Caso 12): role só com escopo UNIT não deveria satisfazer uma checagem ARP.';
  END IF;
  IF public.has_scope('departments', 'GLOBAL', 'qualquer') THEN
    RAISE EXCEPTION 'FALHA (Caso 12): domínio sem nenhum role_domain_scopes correspondente deveria ser FALSE.';
  END IF;
  RAISE NOTICE 'OK (Caso 12): escopo pedido incompatível com o concedido (tipo ou domínio) -> FALSE.';

  RAISE NOTICE '=== FASE 2A — TODOS OS 12 CASOS DE has_permission()/has_scope() PASSARAM ===';
END $$;

-- Reconfirmação explícita (item 12 da Fase 2A): has_role() continua intacto.
DO $$
DECLARE
  v_admin_id UUID := '10000000-0000-0000-0000-000000000099';
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated', 'phase2a-admin@example.com', crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', '')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin');

  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'FALHA: has_role(''admin'') parou de funcionar após a Fase 2A.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true); -- v_gestor_id
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'FALHA: has_role(''gestor'') parou de funcionar após a Fase 2A.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true); -- v_leitor_id
  IF NOT public.has_role('leitor') THEN
    RAISE EXCEPTION 'FALHA: has_role(''leitor'') parou de funcionar após a Fase 2A.';
  END IF;

  RAISE NOTICE 'OK: has_role(admin/gestor/leitor) continua funcionando exatamente como antes da Fase 2A.';
END $$;

ROLLBACK;
