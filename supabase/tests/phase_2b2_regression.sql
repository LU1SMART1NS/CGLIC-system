-- ==============================================================================
-- FASE 2B-2 — TESTE DE REGRESSÃO DE BANCO para save_empenho_links_atomic()
-- migrada para has_permission()/has_scope() (executar via psql contra o
-- Postgres local do `supabase start`, nunca contra o projeto remoto).
--
-- Cobre os Casos 1-12 pedidos. Roles sintéticas isolam cenários que
-- admin/gestor reais (GLOBAL) não conseguem exercitar sozinhos. Nada aqui
-- cria gestor_saldos nem UI.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_2b2_regression.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Fixtures: duas atas, dois itens, três departamentos, alocações persistidas
-- ------------------------------------------------------------------------------
INSERT INTO public.atas_registro_preco (id, numero_ata, codigo_uasg, ano_compra)
VALUES
  ('a1000000-0000-0000-0000-00000000000a', '00041', '200331', '2026'),
  ('b1000000-0000-0000-0000-00000000000b', '00042', '200331', '2026');

INSERT INTO public.itens_ata (ata_id, numero_item, descricao_item)
VALUES
  ('a1000000-0000-0000-0000-00000000000a', '00001', 'Item de teste da ATA A (2B-2)'),
  ('b1000000-0000-0000-0000-00000000000b', '00001', 'Item de teste da ATA B (2B-2)');

INSERT INTO public.internal_departments (id, sigla, nome_completo, ativo) VALUES
  ('dep-test-cglic-2b2', 'CGLIC', 'Unidade de Teste CGLIC', TRUE),
  ('dep-test-outra-2b2', 'OUTRA', 'Unidade de Teste OUTRA', TRUE),
  ('dep-test-terceira-2b2', 'TERCEIRA', 'Unidade de Teste TERCEIRA', TRUE);

-- item_key = {numero_ata}/{ano_compra}-{codigo_uasg}-{numero_item}
--   ITEM_A = '00041/2026-200331-00001' (pertence à ATA A)
--   ITEM_B = '00042/2026-200331-00001' (pertence à ATA B)
--
-- Alocações persistidas diretamente (não via save_allocations_atomic — o
-- que está sob teste aqui é save_empenho_links_atomic, que opera sobre
-- alocações já existentes):
INSERT INTO public.arp_allocations (id, item_key, unit_name, allocated_qty, empenhada_qty) VALUES
  ('alloc-2b2-a-cglic', '00041/2026-200331-00001', 'CGLIC', 10, 0),
  ('alloc-2b2-a-outra', '00041/2026-200331-00001', 'OUTRA', 10, 0),
  ('alloc-2b2-a-terceira', '00041/2026-200331-00001', 'TERCEIRA', 10, 0),
  ('alloc-2b2-b-cglic', '00042/2026-200331-00001', 'CGLIC', 10, 0);

-- ------------------------------------------------------------------------------
-- Fixtures: roles sintéticas para isolar cenários de escopo
-- ------------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES
  ('test_2b2_unit_cglic', 'Teste: allocations.manage + UNIT=CGLIC', FALSE),
  ('test_2b2_unit_outra', 'Teste: allocations.manage + UNIT=OUTRA', FALSE),
  ('test_2b2_arp_a', 'Teste: allocations.manage + ARP=ATA_A', FALSE),
  ('test_2b2_financial_only', 'Teste: só financial.manage', FALSE),
  ('test_2b2_unit_no_assignment', 'Teste: UNIT sem nenhuma assignment', FALSE);

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('test_2b2_unit_cglic', 'allocations.manage'),
  ('test_2b2_unit_outra', 'allocations.manage'),
  ('test_2b2_arp_a', 'allocations.manage'),
  ('test_2b2_financial_only', 'financial.manage'),
  ('test_2b2_unit_no_assignment', 'allocations.manage');

INSERT INTO public.role_domain_scopes (role_id, domain, scope_type) VALUES
  ('test_2b2_unit_cglic', 'allocations', 'UNIT'),
  ('test_2b2_unit_outra', 'allocations', 'UNIT'),
  ('test_2b2_arp_a', 'allocations', 'ARP'),
  ('test_2b2_unit_no_assignment', 'allocations', 'UNIT');
  -- test_2b2_financial_only propositalmente SEM nenhuma linha aqui
  -- (financial.manage não tem, e não deve ter, nenhum escopo em allocations).

DO $$
DECLARE
  v_leitor_id        UUID := '30000000-0000-0000-0000-000000000001';
  v_admin_id         UUID := '30000000-0000-0000-0000-000000000002';
  v_unit_cglic_id    UUID := '30000000-0000-0000-0000-000000000003';
  v_arp_a_id         UUID := '30000000-0000-0000-0000-000000000004';
  v_financial_id     UUID := '30000000-0000-0000-0000-000000000005';
  v_no_assignment_id UUID := '30000000-0000-0000-0000-000000000006';
  v_no_role_id       UUID := '30000000-0000-0000-0000-000000000007';
  v_multi_id         UUID := '30000000-0000-0000-0000-000000000008';

  v_item_a TEXT := '00041/2026-200331-00001';
  v_item_b TEXT := '00042/2026-200331-00001';

  v_result JSONB;
  v_failed BOOLEAN;
  v_sqlstate TEXT;
  v_count_before INTEGER;
  v_count_after INTEGER;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''
  FROM (VALUES
    (v_leitor_id,        'phase2b2-leitor@example.com'),
    (v_admin_id,         'phase2b2-admin@example.com'),
    (v_unit_cglic_id,    'phase2b2-unit-cglic@example.com'),
    (v_arp_a_id,         'phase2b2-arp-a@example.com'),
    (v_financial_id,     'phase2b2-financial@example.com'),
    (v_no_assignment_id, 'phase2b2-no-assignment@example.com'),
    (v_no_role_id,       'phase2b2-no-role@example.com'),
    (v_multi_id,         'phase2b2-multi@example.com')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_leitor_id, 'leitor');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_unit_cglic_id, 'gestor', 'test_2b2_unit_cglic');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_arp_a_id, 'gestor', 'test_2b2_arp_a');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_financial_id, 'gestor', 'test_2b2_financial_only');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_no_assignment_id, 'gestor', 'test_2b2_unit_no_assignment');
  -- multi: duas roles sintéticas, cada uma com UNIT diferente
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'gestor', 'test_2b2_unit_cglic');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'leitor', 'test_2b2_unit_outra');
  -- v_no_role_id: propositalmente sem nenhuma linha em user_roles.

  INSERT INTO public.user_scope_assignments (user_id, domain, scope_type, scope_value) VALUES
    (v_unit_cglic_id, 'allocations', 'UNIT', 'CGLIC'),
    (v_arp_a_id, 'allocations', 'ARP', 'a1000000-0000-0000-0000-00000000000a'),
    (v_multi_id, 'allocations', 'UNIT', 'CGLIC'),
    (v_multi_id, 'allocations', 'UNIT', 'OUTRA');
  -- v_no_assignment_id e v_admin_id propositalmente SEM nenhuma linha aqui
  -- (v_admin_id é GLOBAL — Caso 11 prova que isso não é necessário para ele).

  -- ============================================================
  -- Caso 1: sem allocations.manage -> DENY 42501
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_leitor_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('empenho_numero', '2026NE000001', 'allocation_id', 'alloc-2b2-a-cglic')
    ));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 1): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 1): leitor sem allocations.manage conseguiu executar a RPC.'; END IF;
  RAISE NOTICE 'OK (Caso 1): sem allocations.manage -> DENY 42501.';

  -- ============================================================
  -- Caso 2 / 11: allocations.manage + GLOBAL -> ALLOW, sem nenhuma
  -- user_scope_assignments para o usuário (prova explícita do item 11).
  -- ============================================================
  IF EXISTS (SELECT 1 FROM public.user_scope_assignments WHERE user_id = v_admin_id) THEN
    RAISE EXCEPTION 'FALHA (setup Caso 11): admin não deveria ter nenhuma user_scope_assignments para este teste ser válido.';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_result := public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
    jsonb_build_object('empenho_numero', '2026NE000002', 'allocation_id', 'alloc-2b2-a-cglic'),
    jsonb_build_object('empenho_numero', '2026NE000003', 'allocation_id', 'alloc-2b2-a-outra')
  ));
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 2/11): GLOBAL sem assignments deveria conseguir vincular em qualquer alocação. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 2 / 11): permission + GLOBAL -> ALLOW, sem exigir user_scope_assignments.';

  -- ============================================================
  -- Caso 3: UNIT=CGLIC -> alocação CGLIC -> ALLOW
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_unit_cglic_id::text, true);
  v_result := public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
    jsonb_build_object('empenho_numero', '2026NE000004', 'allocation_id', 'alloc-2b2-a-cglic')
  ), 2); -- item_a: version 2 após o Caso 2 (first-write incrementou 1->2)
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 3): UNIT=CGLIC deveria conseguir vincular na alocação CGLIC. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 3): UNIT=CGLIC -> alocação CGLIC -> ALLOW.';

  -- ============================================================
  -- Caso 4: mesmo usuário tentando alocação OUTRA -> DENY
  -- ============================================================
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('empenho_numero', '2026NE000005', 'allocation_id', 'alloc-2b2-a-outra')
    ), 3); -- item_a: version 3 após o Caso 3 (2->3)
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 4): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 4): usuário restrito a UNIT=CGLIC conseguiu vincular alocação de OUTRA.'; END IF;
  RAISE NOTICE 'OK (Caso 4): UNIT=CGLIC tentando alocação OUTRA -> DENY.';

  -- ============================================================
  -- Caso 5: ARP=ATA_A -> alocação do item da ATA_A -> ALLOW
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_arp_a_id::text, true);
  v_result := public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
    jsonb_build_object('empenho_numero', '2026NE000006', 'allocation_id', 'alloc-2b2-a-terceira')
  ), 3); -- item_a: version 3 (Caso 3 incrementou 2->3; Caso 4 falhou e não alterou)
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 5): ARP=ATA_A deveria conseguir vincular alocação de item da ATA_A. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 5): ARP=ATA_A -> alocação do item da ATA_A -> ALLOW.';

  -- ============================================================
  -- Caso 6: mesmo usuário tentando item da ATA_B -> DENY
  -- ============================================================
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_empenho_links_atomic(v_item_b, jsonb_build_array(
      jsonb_build_object('empenho_numero', '2026NE000007', 'allocation_id', 'alloc-2b2-b-cglic')
    ));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 6): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 6): usuário restrito à ATA_A conseguiu vincular alocação de item da ATA_B.'; END IF;
  RAISE NOTICE 'OK (Caso 6): ARP=ATA_A tentando item da ATA_B -> DENY.';

  -- ============================================================
  -- Caso 7: somente financial.manage (sem allocations.manage) -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_financial_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('empenho_numero', '2026NE000008', 'allocation_id', 'alloc-2b2-a-cglic')
    ));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 7): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 7): usuário com financial.manage (sem allocations.manage) conseguiu executar a RPC — financial.manage virou bypass indevido.';
  END IF;
  RAISE NOTICE 'OK (Caso 7): financial.manage sozinho -> DENY (não é bypass para o domínio de Saldos).';

  -- ============================================================
  -- Caso 8: allocations.manage + scope UNIT, mas SEM assignment -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_no_assignment_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('empenho_numero', '2026NE000009', 'allocation_id', 'alloc-2b2-a-cglic')
    ), 4); -- item_a: version 4 após o Caso 5 (3->4)
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 8): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 8): usuário com escopo UNIT sem nenhuma assignment conseguiu executar a RPC.'; END IF;
  RAISE NOTICE 'OK (Caso 8): allocations.manage + escopo UNIT sem assignment correspondente -> DENY.';

  -- ============================================================
  -- Caso 9: usuário sem role -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_no_role_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('empenho_numero', '2026NE000010', 'allocation_id', 'alloc-2b2-a-cglic')
    ));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 9): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 9): usuário sem role conseguiu executar a RPC.'; END IF;
  RAISE NOTICE 'OK (Caso 9): usuário sem role -> DENY.';

  -- ============================================================
  -- Caso 10: múltiplas roles/scopes -> união correta + atomicidade
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_multi_id::text, true);
  v_result := public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
    jsonb_build_object('empenho_numero', '2026NE000011', 'allocation_id', 'alloc-2b2-a-cglic'),
    jsonb_build_object('empenho_numero', '2026NE000012', 'allocation_id', 'alloc-2b2-a-outra')
  ), 4); -- item_a: version 4 (Caso 8 falhou e não alterou, permanece em 4)
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 10): usuário multi-role (UNIT=CGLIC + UNIT=OUTRA) deveria conseguir vincular ambas. Resultado: %', v_result;
  END IF;

  -- payload misto incluindo uma alocação (TERCEIRA) fora de qualquer escopo do usuário -> DENY, e nada deve ser persistido a mais
  SELECT COUNT(*) INTO v_count_before FROM public.empenho_links WHERE item_key = v_item_a;
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_empenho_links_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('empenho_numero', '2026NE000013', 'allocation_id', 'alloc-2b2-a-cglic'),
      jsonb_build_object('empenho_numero', '2026NE000014', 'allocation_id', 'alloc-2b2-a-terceira')
    ), 5); -- item_a: version 5 após o primeiro bloco do Caso 10 (4->5)
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 10 / atomicidade): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 10): usuário multi-role conseguiu vincular alocação de unidade (TERCEIRA) fora de qualquer uma de suas roles.';
  END IF;
  SELECT COUNT(*) INTO v_count_after FROM public.empenho_links WHERE item_key = v_item_a;
  IF v_count_after <> v_count_before THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 10 / atomicidade): número de vínculos mudou após payload negado (antes=%, depois=%).', v_count_before, v_count_after;
  END IF;
  IF EXISTS (SELECT 1 FROM public.empenho_links WHERE empenho_numero = '2026NE000013') THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 10 / atomicidade): vínculo 2026NE000013 foi persistido apesar do DENY.';
  END IF;
  RAISE NOTICE 'OK (Caso 10): múltiplas roles -> união correta (CGLIC=ALLOW, OUTRA=ALLOW), e payload misto com unidade fora do escopo nega tudo, sem persistência parcial.';

  -- ============================================================
  -- Caso 12: inspeção estática — has_role não pode aparecer no corpo da RPC
  -- ============================================================
  IF pg_get_functiondef('public.save_empenho_links_atomic(text,jsonb,integer)'::regprocedure) ILIKE '%has_role%' THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 12): save_empenho_links_atomic ainda referencia has_role() — bypass não removido.';
  END IF;
  RAISE NOTICE 'OK (Caso 12): nenhuma referência a has_role() no corpo de save_empenho_links_atomic.';

  RAISE NOTICE '=== FASE 2B-2 — TODOS OS CASOS DE save_empenho_links_atomic PASSARAM ===';
END $$;

ROLLBACK;
