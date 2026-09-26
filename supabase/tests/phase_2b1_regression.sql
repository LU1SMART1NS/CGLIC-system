-- ==============================================================================
-- FASE 2B-1 — TESTE DE REGRESSÃO DE BANCO para save_allocations_atomic()
-- migrada para has_permission()/has_scope() (executar via psql contra o
-- Postgres local do `supabase start`, nunca contra o projeto remoto).
--
-- Cobre os Casos 1-12 + o teste de atomicidade (item 13) pedidos. Roles
-- sintéticas (test_unit_cglic, test_arp_a, test_unit_no_permission) existem
-- só dentro desta transação (ROLLBACK final) para isolar cenários que
-- admin/gestor reais (que já têm GLOBAL) não conseguem exercitar sozinhos.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_2b1_regression.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Fixtures: duas atas distintas, cada uma com um item, e dois departamentos
-- ------------------------------------------------------------------------------
INSERT INTO public.atas_registro_preco (id, numero_ata, codigo_uasg, ano_compra)
VALUES
  ('a0000000-0000-0000-0000-00000000000a', '00037', '200331', '2026'),
  ('b0000000-0000-0000-0000-00000000000b', '00038', '200331', '2026');

INSERT INTO public.itens_ata (ata_id, numero_item, descricao_item)
VALUES
  ('a0000000-0000-0000-0000-00000000000a', '00001', 'Item de teste da ATA A'),
  ('b0000000-0000-0000-0000-00000000000b', '00001', 'Item de teste da ATA B');

INSERT INTO public.internal_departments (id, sigla, nome_completo, ativo) VALUES
  ('dep-test-cglic-2b1', 'CGLIC', 'Unidade de Teste CGLIC', TRUE),
  ('dep-test-outra-2b1', 'OUTRA', 'Unidade de Teste OUTRA', TRUE),
  ('dep-test-terceira-2b1', 'TERCEIRA', 'Unidade de Teste TERCEIRA', TRUE);

-- item_key = {numero_ata}/{ano_compra}-{codigo_uasg}-{numero_item}
-- ITEM_A pertence à ATA A; ITEM_B pertence à ATA B.
-- (declarados aqui como comentário só para leitura humana; usados como
-- literais diretamente nos testes abaixo)
--   ITEM_A = '00037/2026-200331-00001'
--   ITEM_B = '00038/2026-200331-00001'

-- ------------------------------------------------------------------------------
-- Fixtures: roles sintéticas para isolar cenários de escopo
-- ------------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES
  ('test_unit_cglic', 'Teste: allocations.manage + UNIT=CGLIC', FALSE),
  ('test_unit_outra', 'Teste: allocations.manage + UNIT=OUTRA', FALSE),
  ('test_arp_a', 'Teste: allocations.manage + ARP=ATA_A', FALSE),
  ('test_scope_no_permission', 'Teste: UNIT=CGLIC sem allocations.manage', FALSE);

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('test_unit_cglic', 'allocations.manage'),
  ('test_unit_outra', 'allocations.manage'),
  ('test_arp_a', 'allocations.manage');
  -- test_scope_no_permission propositalmente SEM allocations.manage.

INSERT INTO public.role_domain_scopes (role_id, domain, scope_type) VALUES
  ('test_unit_cglic', 'allocations', 'UNIT'),
  ('test_unit_outra', 'allocations', 'UNIT'),
  ('test_arp_a', 'allocations', 'ARP'),
  ('test_scope_no_permission', 'allocations', 'UNIT');

DO $$
DECLARE
  v_leitor_id       UUID := '20000000-0000-0000-0000-000000000001';
  v_global_id       UUID := '20000000-0000-0000-0000-000000000002'; -- role real 'gestor'
  v_unit_cglic_id   UUID := '20000000-0000-0000-0000-000000000003';
  v_arp_a_id        UUID := '20000000-0000-0000-0000-000000000004';
  v_scope_no_perm_id UUID := '20000000-0000-0000-0000-000000000005';
  v_multi_id        UUID := '20000000-0000-0000-0000-000000000006';
  v_no_role_id      UUID := '20000000-0000-0000-0000-000000000007';
  v_admin_id        UUID := '20000000-0000-0000-0000-000000000008';

  v_item_a TEXT := '00037/2026-200331-00001';
  v_item_b TEXT := '00038/2026-200331-00001';
  v_ata_a_id UUID := 'a0000000-0000-0000-0000-00000000000a';

  v_result JSONB;
  v_failed BOOLEAN;
  v_sqlstate TEXT;
  v_count_before INTEGER;
  v_count_after INTEGER;
  v_state_before RECORD;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''
  FROM (VALUES
    (v_leitor_id,        'phase2b1-leitor@example.com'),
    (v_global_id,        'phase2b1-gestor@example.com'),
    (v_unit_cglic_id,    'phase2b1-unit-cglic@example.com'),
    (v_arp_a_id,         'phase2b1-arp-a@example.com'),
    (v_scope_no_perm_id, 'phase2b1-scope-no-perm@example.com'),
    (v_multi_id,         'phase2b1-multi@example.com'),
    (v_no_role_id,       'phase2b1-no-role@example.com'),
    (v_admin_id,         'phase2b1-admin@example.com')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_leitor_id, 'leitor');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_global_id, 'gestor');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_unit_cglic_id, 'gestor', 'test_unit_cglic');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_arp_a_id, 'gestor', 'test_arp_a');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_scope_no_perm_id, 'gestor', 'test_scope_no_permission');
  -- multi: duas roles sintéticas, cada uma com UNIT diferente
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'gestor', 'test_unit_cglic');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'leitor', 'test_unit_outra');
  -- v_no_role_id: propositalmente sem nenhuma linha em user_roles.

  INSERT INTO public.user_scope_assignments (user_id, domain, scope_type, scope_value) VALUES
    (v_unit_cglic_id, 'allocations', 'UNIT', 'CGLIC'),
    (v_arp_a_id, 'allocations', 'ARP', v_ata_a_id::TEXT),
    (v_scope_no_perm_id, 'allocations', 'UNIT', 'CGLIC'),
    (v_multi_id, 'allocations', 'UNIT', 'CGLIC'),
    (v_multi_id, 'allocations', 'UNIT', 'OUTRA');

  -- ============================================================
  -- Caso 1: sem permission -> DENY 42501
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_leitor_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_allocations_atomic(v_item_a, jsonb_build_array(jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 10)));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 1): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA (Caso 1): leitor sem allocations.manage não deveria conseguir executar a RPC.';
  END IF;
  RAISE NOTICE 'OK (Caso 1): sem permission -> DENY 42501.';

  -- ============================================================
  -- Caso 2: permission + GLOBAL -> pode alterar qualquer unidade
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_global_id::text, true);
  v_result := public.save_allocations_atomic(v_item_a, jsonb_build_array(
    jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 5),
    jsonb_build_object('unit_name', 'OUTRA', 'allocated_qty', 3)
  ));
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 2): GLOBAL deveria conseguir alocar em CGLIC+OUTRA. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 2): permission + GLOBAL -> aloca em qualquer unidade válida.';

  -- ============================================================
  -- Caso 3: permission + UNIT autorizado (CGLIC) -> ALLOW
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_unit_cglic_id::text, true);
  v_result := public.save_allocations_atomic(v_item_b, jsonb_build_array(
    jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 7)
  ));
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 3): UNIT=CGLIC deveria conseguir alocar em CGLIC. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 3): permission + UNIT autorizado (CGLIC) -> ALLOW.';

  -- ============================================================
  -- Caso 4: mesmo usuário tentando OUTRA -> DENY 42501
  -- ============================================================
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_allocations_atomic(v_item_b, jsonb_build_array(
      jsonb_build_object('unit_name', 'OUTRA', 'allocated_qty', 1)
    ), 2); -- item_b: version 2 após o Caso 3 (first-write incrementou 1->2)
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 4): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 4): usuário restrito a UNIT=CGLIC conseguiu escrever em OUTRA.';
  END IF;
  RAISE NOTICE 'OK (Caso 4): UNIT fora do escopo (OUTRA) -> DENY 42501.';

  -- ============================================================
  -- Caso 5 + item 13 (atomicidade): payload misto CGLIC+OUTRA, usuário só
  -- tem UNIT=CGLIC -> DENY, ROLLBACK, nada persistido.
  -- ============================================================
  SELECT COUNT(*) INTO v_count_before FROM public.arp_allocations WHERE item_key = v_item_a;
  SELECT * INTO v_state_before FROM public.item_allocation_state WHERE item_key = v_item_a;

  v_failed := FALSE;
  BEGIN
    PERFORM public.save_allocations_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 99),
      jsonb_build_object('unit_name', 'OUTRA', 'allocated_qty', 99)
    ), 2); -- item_a: version 2 após o Caso 2 (first-write incrementou 1->2)
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 5): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 5): payload misto deveria ter sido negado integralmente.';
  END IF;

  SELECT COUNT(*) INTO v_count_after FROM public.arp_allocations WHERE item_key = v_item_a;
  IF v_count_after <> v_count_before THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (item 13 / Caso 5): número de linhas em arp_allocations mudou após um payload negado (antes=%, depois=%) — autorização parcial vazou dados.', v_count_before, v_count_after;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.arp_allocations WHERE item_key = v_item_a AND unit_name = 'OUTRA' AND allocated_qty = 99
  ) THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (item 13 / Caso 5): a linha OUTRA=99 foi persistida apesar do DENY.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.item_allocation_state WHERE item_key = v_item_a AND version <> v_state_before.version
  ) THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (item 13 / Caso 5): a versão do agregado mudou apesar do DENY (esperado=%).', v_state_before.version;
  END IF;
  RAISE NOTICE 'OK (Caso 5 / item 13): payload misto negado integralmente — 0 linhas persistidas, versão do agregado inalterada (snapshot idêntico antes/depois).';

  -- ============================================================
  -- Caso 6: ARP autorizado (ATA_A) -> ALLOW
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_arp_a_id::text, true);
  v_result := public.save_allocations_atomic(v_item_a, jsonb_build_array(
    jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 2)
  ), 2); -- item_a: version 2 (Caso 2 incrementou 1->2; Caso 5 falhou e não alterou)
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 6): usuário com ARP=ATA_A deveria conseguir alocar em item da ATA_A. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 6): ARP autorizado (item pertence à ATA_A) -> ALLOW.';

  -- ============================================================
  -- Caso 7: mesmo usuário tentando item da ATA_B -> DENY
  -- ============================================================
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_allocations_atomic(v_item_b, jsonb_build_array(
      jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 2)
    ), 2); -- item_b está na version 2 (Caso 3 incrementou para 2)
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 7): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 7): usuário restrito à ATA_A conseguiu escrever em item da ATA_B.';
  END IF;
  RAISE NOTICE 'OK (Caso 7): ARP não autorizado (item pertence à ATA_B) -> DENY.';

  -- ============================================================
  -- Caso 8: GLOBAL supera UNIT/ARP (sem nenhuma user_scope_assignments)
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_result := public.save_allocations_atomic(v_item_b, jsonb_build_array(
    jsonb_build_object('unit_name', 'TERCEIRA', 'allocated_qty', 1)
  ), 2);
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 8): admin (GLOBAL, sem nenhuma assignment) deveria conseguir alocar em qualquer unidade. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 8): GLOBAL supera UNIT/ARP — funciona sem nenhuma user_scope_assignments.';

  -- ============================================================
  -- Caso 9: scope sem permission -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_scope_no_perm_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_allocations_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 1)
    ));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 9): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 9): usuário com scope mas sem allocations.manage conseguiu executar a RPC.';
  END IF;
  RAISE NOTICE 'OK (Caso 9): scope presente mas sem permission -> DENY (has_permission barra no Passo 1).';

  -- ============================================================
  -- Caso 10: múltiplas roles -> união correta dos escopos
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_multi_id::text, true);
  v_result := public.save_allocations_atomic(v_item_a, jsonb_build_array(
    jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 4),
    jsonb_build_object('unit_name', 'OUTRA', 'allocated_qty', 4)
  ), 3); -- item_a: version 3 após o Caso 6 (2->3)

  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 10): usuário multi-role (UNIT=CGLIC + UNIT=OUTRA) deveria conseguir alocar em ambas. Resultado: %', v_result;
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.save_allocations_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('unit_name', 'TERCEIRA', 'allocated_qty', 1)
    ), 4); -- item_a: version 4 após o primeiro bloco do Caso 10 (3->4)
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 10): esperado SQLSTATE 42501 para TERCEIRA, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 10): usuário multi-role conseguiu escrever numa unidade (TERCEIRA) que nenhuma de suas roles autoriza.';
  END IF;
  RAISE NOTICE 'OK (Caso 10): múltiplas roles -> união correta (CGLIC=ALLOW, OUTRA=ALLOW, TERCEIRA=DENY).';

  -- ============================================================
  -- Caso 11: usuário sem role -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_no_role_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_allocations_atomic(v_item_a, jsonb_build_array(
      jsonb_build_object('unit_name', 'CGLIC', 'allocated_qty', 1)
    ));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'FALHA (Caso 11): esperado SQLSTATE 42501, obtido %.', v_sqlstate;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 11): usuário sem role conseguiu executar a RPC.';
  END IF;
  RAISE NOTICE 'OK (Caso 11): usuário sem role -> DENY.';

  -- ============================================================
  -- Caso 12: regressão — admin/gestor reais continuam funcionando, e SÓ
  -- porque role_permissions/role_domain_scopes concedem, não por has_role().
  -- ============================================================
  IF pg_get_functiondef('public.save_allocations_atomic(text,jsonb,integer)'::regprocedure) ILIKE '%has_role%' THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 12): save_allocations_atomic ainda referencia has_role() — bypass não removido.';
  END IF;
  RAISE NOTICE 'OK (Caso 12): confirmado por inspeção do código da função — nenhuma referência a has_role() restante (admin/gestor passam exclusivamente por has_permission/has_scope, já exercitado nos Casos 2 e 8).';

  RAISE NOTICE '=== FASE 2B-1 — TODOS OS CASOS DE save_allocations_atomic PASSARAM ===';
END $$;

ROLLBACK;
