-- ==============================================================================
-- FASE 2B-3 — TESTE DE REGRESSÃO DE BANCO para save_internal_department_atomic()
-- e delete_internal_department_atomic() migradas para has_permission()
-- (executar via psql contra o Postgres local do `supabase start`, nunca
-- contra o projeto remoto).
--
-- Cobre os 10 casos mínimos pedidos + verificação de preservação de negócio.
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_2b3_regression.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Fixtures: roles sintéticas para isolar cenários
-- ------------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES
  ('test_2b3_allocations_only', 'Teste: só allocations.manage', FALSE),
  ('test_2b3_financial_only', 'Teste: só financial.manage', FALSE),
  ('test_2b3_departments_only', 'Teste: só departments.manage', FALSE);

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('test_2b3_allocations_only', 'allocations.manage'),
  ('test_2b3_financial_only', 'financial.manage'),
  ('test_2b3_departments_only', 'departments.manage');

DO $$
DECLARE
  v_leitor_id       UUID := '40000000-0000-0000-0000-000000000001';
  v_admin_id        UUID := '40000000-0000-0000-0000-000000000002';
  v_gestor_id       UUID := '40000000-0000-0000-0000-000000000003';
  v_alloc_only_id   UUID := '40000000-0000-0000-0000-000000000004';
  v_financial_id    UUID := '40000000-0000-0000-0000-000000000005';
  v_no_role_id      UUID := '40000000-0000-0000-0000-000000000006';
  v_multi_id        UUID := '40000000-0000-0000-0000-000000000007';

  v_result JSONB;
  v_failed BOOLEAN;
  v_sqlstate TEXT;
  v_dep_id VARCHAR(50);
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''
  FROM (VALUES
    (v_leitor_id,     'phase2b3-leitor@example.com'),
    (v_admin_id,      'phase2b3-admin@example.com'),
    (v_gestor_id,     'phase2b3-gestor@example.com'),
    (v_alloc_only_id, 'phase2b3-alloc-only@example.com'),
    (v_financial_id,  'phase2b3-financial@example.com'),
    (v_no_role_id,    'phase2b3-no-role@example.com'),
    (v_multi_id,      'phase2b3-multi@example.com')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_leitor_id, 'leitor');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_gestor_id, 'gestor');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_alloc_only_id, 'gestor', 'test_2b3_allocations_only');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_financial_id, 'gestor', 'test_2b3_financial_only');
  -- multi: uma role SEM departments.manage (leitor) + uma role sintética COM departments.manage
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'leitor', 'leitor');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'gestor', 'test_2b3_departments_only');
  -- v_no_role_id: propositalmente sem nenhuma linha em user_roles.

  -- ============================================================
  -- Caso 1: sem departments.manage -> DENY 42501
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_leitor_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_internal_department_atomic(NULL, 'DEP_2B3_TEST_1', 'Departamento de Teste 1', NULL, TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 1): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 1): leitor sem departments.manage conseguiu criar departamento.'; END IF;
  RAISE NOTICE 'OK (Caso 1): sem departments.manage -> DENY 42501.';

  -- ============================================================
  -- Caso 2: departments.manage + role admin -> ALLOW
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_result := public.save_internal_department_atomic(NULL, 'DEP_2B3_ADMIN', 'Departamento criado por admin', NULL, TRUE);
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 2): admin com departments.manage deveria conseguir criar departamento. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 2): departments.manage + role admin -> ALLOW.';

  -- ============================================================
  -- Caso 3: departments.manage + role gestor -> ALLOW
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_gestor_id::text, true);
  v_result := public.save_internal_department_atomic(NULL, 'DEP_2B3_GESTOR', 'Departamento criado por gestor', NULL, TRUE);
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 3): gestor com departments.manage deveria conseguir criar departamento. Resultado: %', v_result;
  END IF;
  v_dep_id := v_result->'department'->>'id';
  RAISE NOTICE 'OK (Caso 3): departments.manage + role gestor -> ALLOW.';

  -- ============================================================
  -- Caso 4: usuário com apenas allocations.manage -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_alloc_only_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_internal_department_atomic(NULL, 'DEP_2B3_ALLOC_ONLY', 'Tentativa via allocations.manage', NULL, TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 4): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 4): usuário só com allocations.manage conseguiu administrar departamentos — allocations.manage virou bypass indevido.';
  END IF;
  RAISE NOTICE 'OK (Caso 4): apenas allocations.manage -> DENY (não é substituto de departments.manage).';

  -- ============================================================
  -- Caso 5: usuário com apenas financial.manage -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_financial_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_internal_department_atomic(NULL, 'DEP_2B3_FINANCIAL_ONLY', 'Tentativa via financial.manage', NULL, TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 5): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 5): usuário só com financial.manage conseguiu administrar departamentos — financial.manage virou bypass indevido.';
  END IF;
  RAISE NOTICE 'OK (Caso 5): apenas financial.manage -> DENY (não é substituto de departments.manage).';

  -- ============================================================
  -- Caso 6: usuário sem role -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_no_role_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_internal_department_atomic(NULL, 'DEP_2B3_NO_ROLE', 'Tentativa sem role', NULL, TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 6): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 6): usuário sem role conseguiu administrar departamentos.'; END IF;
  RAISE NOTICE 'OK (Caso 6): usuário sem role -> DENY.';

  -- ============================================================
  -- Caso 7: múltiplas roles -> união correta (leitor, sem a permissão,
  -- + role sintética com departments.manage -> ALLOW)
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_multi_id::text, true);
  v_result := public.save_internal_department_atomic(NULL, 'DEP_2B3_MULTI', 'Departamento criado por usuário multi-role', NULL, TRUE);
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 7): usuário com role A (sem a permissão) + role B (com departments.manage) deveria conseguir criar departamento. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 7): múltiplas roles -> união correta (a role que concede departments.manage é suficiente).';

  -- ============================================================
  -- Caso 8: inspeção estática — has_role não pode aparecer em nenhuma das duas RPCs
  -- ============================================================
  IF pg_get_functiondef('public.save_internal_department_atomic(varchar,varchar,varchar,text,boolean)'::regprocedure) ILIKE '%has_role%' THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 8): save_internal_department_atomic ainda referencia has_role().';
  END IF;
  IF pg_get_functiondef('public.delete_internal_department_atomic(varchar,boolean)'::regprocedure) ILIKE '%has_role%' THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 8): delete_internal_department_atomic ainda referencia has_role().';
  END IF;
  RAISE NOTICE 'OK (Caso 8): nenhuma referência a has_role() em nenhuma das duas RPCs.';

  -- ============================================================
  -- Caso 9: lógica de negócio preservada (unicidade, update, soft/hard delete)
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- 9a: sigla duplicada continua sendo rejeitada
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_internal_department_atomic(NULL, 'DEP_2B3_ADMIN', 'Duplicata proposital', NULL, TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '23505' THEN
      RAISE EXCEPTION 'FALHA (Caso 9a): esperado SQLSTATE 23505 (sigla duplicada), obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 9a): sigla duplicada foi aceita — lógica de negócio alterada indevidamente.'; END IF;
  RAISE NOTICE 'OK (Caso 9a): validação de sigla duplicada preservada (23505).';

  -- 9b: update funciona normalmente
  v_result := public.save_internal_department_atomic(v_dep_id, 'DEP_2B3_GESTOR_V2', 'Nome atualizado', NULL, TRUE);
  IF (v_result->'department'->>'sigla') <> 'DEP_2B3_GESTOR_V2' THEN
    RAISE EXCEPTION 'FALHA (Caso 9b): update não aplicou a nova sigla. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 9b): update (renomeação de sigla) preservado.';

  -- 9c: hard delete de departamento sem alocações vinculadas
  v_result := public.delete_internal_department_atomic(v_dep_id, FALSE);
  IF (v_result->>'deleted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 9c): departamento sem alocações deveria ser hard-deletado. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 9c): hard delete de departamento sem vínculos preservado.';

  -- 9d: soft delete quando existe alocação vinculada
  DECLARE
    v_dep_admin_id VARCHAR(50);
  BEGIN
    v_dep_admin_id := (SELECT id FROM public.internal_departments WHERE sigla = 'DEP_2B3_ADMIN');
    INSERT INTO public.arp_allocations (id, item_key, unit_name, allocated_qty)
    VALUES ('alloc-2b3-test', '00099/2026-200331-00001', 'DEP_2B3_ADMIN', 5);

    -- sem force_deactivate -> deve falhar com 23503
    v_failed := FALSE;
    BEGIN
      PERFORM public.delete_internal_department_atomic(v_dep_admin_id, FALSE);
    EXCEPTION WHEN OTHERS THEN
      v_failed := TRUE;
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
      IF v_sqlstate <> '23503' THEN
        RAISE EXCEPTION 'FALHA (Caso 9d-i): esperado SQLSTATE 23503, obtido %.', v_sqlstate;
      END IF;
    END;
    IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 9d-i): departamento com alocação vinculada foi excluído sem force_deactivate.'; END IF;

    -- com force_deactivate=true -> soft delete
    v_result := public.delete_internal_department_atomic(v_dep_admin_id, TRUE);
    IF (v_result->>'deactivated')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'FALHA (Caso 9d-ii): departamento com alocação deveria ser desativado (soft delete). Resultado: %', v_result;
    END IF;
    RAISE NOTICE 'OK (Caso 9d): comportamento de soft-delete vs. hard-delete por integridade referencial preservado.';
  END;

  -- ============================================================
  -- Caso 10: anon/PUBLIC continuam sem execução
  -- ============================================================
  IF has_function_privilege('anon', 'public.save_internal_department_atomic(varchar,varchar,varchar,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 10): role anon tem EXECUTE em save_internal_department_atomic.';
  END IF;
  IF has_function_privilege('anon', 'public.delete_internal_department_atomic(varchar,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 10): role anon tem EXECUTE em delete_internal_department_atomic.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.save_internal_department_atomic(varchar,varchar,varchar,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA (Caso 10): role authenticated deveria continuar com EXECUTE em save_internal_department_atomic.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.delete_internal_department_atomic(varchar,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA (Caso 10): role authenticated deveria continuar com EXECUTE em delete_internal_department_atomic.';
  END IF;
  RAISE NOTICE 'OK (Caso 10): anon sem EXECUTE, authenticated com EXECUTE — GRANT/REVOKE preservados.';

  RAISE NOTICE '=== FASE 2B-3 — TODOS OS CASOS DE save_internal_department_atomic/delete_internal_department_atomic PASSARAM ===';
END $$;

ROLLBACK;
