-- ==============================================================================
-- FASE 2B-6 — TESTE DE REGRESSÃO DE BANCO para o reforço defensivo de
-- merge_internal_department_allocations_atomic (origem deve ser legada/órfã)
-- (executar via psql contra o Postgres local do `supabase start`, nunca
-- contra o projeto remoto).
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_2b6_regression.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Fixtures: duas atas, departamentos (destino ativo + origens legadas
-- inativas + uma origem propositalmente ATIVA para os Casos 2/3)
-- ------------------------------------------------------------------------------
INSERT INTO public.atas_registro_preco (id, numero_ata, codigo_uasg, ano_compra)
VALUES
  ('a3000000-0000-0000-0000-00000000000a', '00061', '200331', '2026'),
  ('b3000000-0000-0000-0000-00000000000b', '00062', '200331', '2026');

INSERT INTO public.itens_ata (ata_id, numero_item, descricao_item)
VALUES
  ('a3000000-0000-0000-0000-00000000000a', '00001', 'ATA A - item 1 (2B-6, GLOBAL)'),
  ('a3000000-0000-0000-0000-00000000000a', '00002', 'ATA A - item 2 (2B-6, ativa/DENY)'),
  ('a3000000-0000-0000-0000-00000000000a', '00003', 'ATA A - item 3 (2B-6, previa)'),
  ('a3000000-0000-0000-0000-00000000000a', '00004', 'ATA A - item 4 (2B-6, sem escopo)'),
  ('a3000000-0000-0000-0000-00000000000a', '00005', 'ATA A - item 5 (2B-6, mista, metade A)'),
  ('a3000000-0000-0000-0000-00000000000a', '00006', 'ATA A - item 6 (2B-6, UNIT)'),
  ('b3000000-0000-0000-0000-00000000000b', '00001', 'ATA B - item 1 (2B-6, mista, metade B)');

-- DEST_2B6: destino oficial ativo. As demais são "origens": a maioria
-- INATIVA (legada/saneável); ATIVA_2B6 é propositalmente ATIVA para provar
-- que a nova regra bloqueia esse caso independente de autorização.
INSERT INTO public.internal_departments (id, sigla, nome_completo, ativo) VALUES
  ('dep-2b6-dest',         'DEST_2B6',          'Destino oficial (2B-6)', TRUE),
  ('dep-2b6-o-global',     'ORIGEM_LEG_GLOBAL', 'Origem legada (GLOBAL)', FALSE),
  ('dep-2b6-o-ativa',      'ATIVA_2B6',         'Departamento ainda ativo (Casos 2/3)', TRUE),
  ('dep-2b6-o-previa',     'ORIGEM_LEG_PREVIA', 'Origem legada previamente existente (Caso 4)', FALSE),
  ('dep-2b6-o-noscope',    'ORIGEM_LEG_NOSCOPE','Origem legada sem escopo do usuário (Caso 6)', FALSE),
  ('dep-2b6-o-mixed',      'ORIGEM_LEG_MIXED',  'Origem legada com alocações em 2 atas (Caso 8)', FALSE),
  ('dep-2b6-o-unit',       'ORIGEM_LEG_UNIT',   'Origem legada (UNIT, Caso 6b)', FALSE);

-- Alocações: cada origem usa item_key próprio para não colidir no destino comum.
INSERT INTO public.arp_allocations (id, item_key, unit_name, allocated_qty) VALUES
  ('alloc-2b6-global',   '00061/2026-200331-00001', 'ORIGEM_LEG_GLOBAL', 1),
  ('alloc-2b6-ativa',    '00061/2026-200331-00002', 'ATIVA_2B6',         1),
  ('alloc-2b6-previa',   '00061/2026-200331-00003', 'ORIGEM_LEG_PREVIA', 1),
  ('alloc-2b6-noscope',  '00061/2026-200331-00004', 'ORIGEM_LEG_NOSCOPE',1),
  ('alloc-2b6-mixed-a',  '00061/2026-200331-00005', 'ORIGEM_LEG_MIXED',  1),
  ('alloc-2b6-mixed-b',  '00062/2026-200331-00001', 'ORIGEM_LEG_MIXED',  1),
  ('alloc-2b6-unit',     '00061/2026-200331-00006', 'ORIGEM_LEG_UNIT',   1);

-- ------------------------------------------------------------------------------
-- Fixtures: roles sintéticas
-- ------------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES
  ('test_2b6_unit', 'Teste: allocations.manage + UNIT=ORIGEM_LEG_UNIT/ATIVA_2B6', FALSE),
  ('test_2b6_arp_mixed_a', 'Teste: allocations.manage + ARP=ATA_A (só)', FALSE),
  ('test_2b6_noscope', 'Teste: allocations.manage sem escopo compatível', FALSE);

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('test_2b6_unit', 'allocations.manage'),
  ('test_2b6_arp_mixed_a', 'allocations.manage'),
  ('test_2b6_noscope', 'allocations.manage');

INSERT INTO public.role_domain_scopes (role_id, domain, scope_type) VALUES
  ('test_2b6_unit', 'allocations', 'UNIT'),
  ('test_2b6_arp_mixed_a', 'allocations', 'ARP'),
  ('test_2b6_noscope', 'allocations', 'UNIT');

DO $$
DECLARE
  v_leitor_id      UUID := '60000000-0000-0000-0000-000000000001';
  v_admin_id       UUID := '60000000-0000-0000-0000-000000000002';
  v_unit_id        UUID := '60000000-0000-0000-0000-000000000003';
  v_arp_a_id       UUID := '60000000-0000-0000-0000-000000000004';
  v_noscope_id     UUID := '60000000-0000-0000-0000-000000000005';

  v_ata_a_id UUID := 'a3000000-0000-0000-0000-00000000000a';

  v_result JSONB;
  v_failed BOOLEAN;
  v_sqlstate TEXT;
  v_before_a TEXT;
  v_before_b TEXT;
  v_after_a TEXT;
  v_after_b TEXT;
  v_count_before INTEGER;
  v_count_after INTEGER;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''
  FROM (VALUES
    (v_leitor_id,  'phase2b6-leitor@example.com'),
    (v_admin_id,   'phase2b6-admin@example.com'),
    (v_unit_id,    'phase2b6-unit@example.com'),
    (v_arp_a_id,   'phase2b6-arp-a@example.com'),
    (v_noscope_id, 'phase2b6-noscope@example.com')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_leitor_id, 'leitor');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_unit_id, 'gestor', 'test_2b6_unit');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_arp_a_id, 'gestor', 'test_2b6_arp_mixed_a');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_noscope_id, 'gestor', 'test_2b6_noscope');

  INSERT INTO public.user_scope_assignments (user_id, domain, scope_type, scope_value) VALUES
    (v_unit_id, 'allocations', 'UNIT', 'ORIGEM_LEG_UNIT'),
    (v_unit_id, 'allocations', 'UNIT', 'ATIVA_2B6'),
    (v_arp_a_id, 'allocations', 'ARP', v_ata_a_id::TEXT),
    (v_noscope_id, 'allocations', 'UNIT', 'UNIDADE_QUE_NAO_TEM_NADA_A_VER');
  -- v_admin_id propositalmente SEM nenhuma linha aqui (Caso 7: GLOBAL).

  -- ============================================================
  -- Caso 1: origem legada + autorização válida -> ALLOW
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_LEG_GLOBAL', 'DEST_2B6');
  IF (v_result->>'success')::boolean IS NOT TRUE OR (v_result->>'rows_updated')::int <> 1 THEN
    RAISE EXCEPTION 'FALHA (Caso 1): origem legada + GLOBAL deveria ser ALLOW. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 1): origem órfã/legada + autorização válida -> ALLOW.';

  -- ============================================================
  -- Caso 2: origem é departamento ATIVO -> DENY (mesmo com GLOBAL)
  -- ============================================================
  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ATIVA_2B6', 'DEST_2B6');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '22023' THEN RAISE EXCEPTION 'FALHA (Caso 2): esperado SQLSTATE 22023, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 2): merge com origem ATIVA foi permitido, mesmo para usuário GLOBAL.'; END IF;
  RAISE NOTICE 'OK (Caso 2): origem é departamento ativo -> DENY (22023), independente de autorização.';

  -- ============================================================
  -- Caso 3: CGLIC(ativa) -> OUTRA quando CGLIC é ativa -> DENY,
  -- confirmado fisicamente que nada mudou (usa o mesmo usuário UNIT com
  -- escopo sobre ATIVA_2B6, para provar que nem ESCOPO válido contorna a regra).
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_unit_id::text, true);
  SELECT unit_name INTO v_before_a FROM public.arp_allocations WHERE id = 'alloc-2b6-ativa';

  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ATIVA_2B6', 'DEST_2B6');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '22023' THEN RAISE EXCEPTION 'FALHA (Caso 3): esperado SQLSTATE 22023, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 3): merge de unidade ativa para outra ativa foi permitido mesmo com escopo válido sobre a origem.'; END IF;

  SELECT unit_name INTO v_after_a FROM public.arp_allocations WHERE id = 'alloc-2b6-ativa';
  IF v_before_a <> v_after_a THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 3 / atomicidade): a alocação foi alterada apesar do DENY (antes=%, depois=%).', v_before_a, v_after_a;
  END IF;
  RAISE NOTICE 'OK (Caso 3): unidade ativa -> outra ativa, negado mesmo com escopo válido; alocação fisicamente inalterada (%).', v_after_a;

  -- ============================================================
  -- Caso 4: origem legada que representa uma unidade previamente existente
  -- (já cadastrada e desde então desativada) -> ALLOW com escopo adequado
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_LEG_PREVIA', 'DEST_2B6');
  IF (v_result->>'success')::boolean IS NOT TRUE OR (v_result->>'rows_updated')::int <> 1 THEN
    RAISE EXCEPTION 'FALHA (Caso 4): origem legada previamente existente (agora inativa) deveria ser ALLOW com GLOBAL. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 4): origem legada correspondente a unidade previamente existente (hoje inativa) -> ALLOW.';

  -- ============================================================
  -- Caso 5: usuário sem allocations.manage -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_leitor_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_LEG_NOSCOPE', 'DEST_2B6');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 5): esperado SQLSTATE 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 5): leitor sem allocations.manage conseguiu executar.'; END IF;
  RAISE NOTICE 'OK (Caso 5): sem allocations.manage -> DENY 42501.';

  -- ============================================================
  -- Caso 6: allocations.manage mas sem escopo compatível -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_noscope_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_LEG_NOSCOPE', 'DEST_2B6');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 6): esperado SQLSTATE 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 6): usuário com allocations.manage mas sem escopo compatível conseguiu executar.'; END IF;
  RAISE NOTICE 'OK (Caso 6): allocations.manage sem escopo compatível -> DENY 42501.';

  -- ============================================================
  -- Caso 7: GLOBAL -> ALLOW para origem legada, sem user_scope_assignments
  -- ============================================================
  IF EXISTS (SELECT 1 FROM public.user_scope_assignments WHERE user_id = v_admin_id) THEN
    RAISE EXCEPTION 'FALHA (setup Caso 7): admin não deveria ter nenhuma user_scope_assignments.';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_LEG_UNIT', 'DEST_2B6');
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 7): GLOBAL sem assignments deveria autorizar origem legada. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 7): GLOBAL autoriza origem legada sem exigir user_scope_assignments.';

  -- ============================================================
  -- Caso 8 + atomicidade: múltiplas ATAs sob a mesma origem legada;
  -- usuário só com ARP=ATA_A -> nega tudo, nenhuma linha alterada.
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_arp_a_id::text, true);
  SELECT unit_name INTO v_before_a FROM public.arp_allocations WHERE id = 'alloc-2b6-mixed-a';
  SELECT unit_name INTO v_before_b FROM public.arp_allocations WHERE id = 'alloc-2b6-mixed-b';
  SELECT COUNT(*) INTO v_count_before FROM public.arp_allocations WHERE unit_name = 'DEST_2B6';

  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_LEG_MIXED', 'DEST_2B6');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 8): esperado SQLSTATE 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 8): usuário restrito à ATA_A conseguiu mesclar origem com alocações também na ATA_B.'; END IF;

  SELECT unit_name INTO v_after_a FROM public.arp_allocations WHERE id = 'alloc-2b6-mixed-a';
  SELECT unit_name INTO v_after_b FROM public.arp_allocations WHERE id = 'alloc-2b6-mixed-b';
  SELECT COUNT(*) INTO v_count_after FROM public.arp_allocations WHERE unit_name = 'DEST_2B6';
  IF v_before_a <> v_after_a OR v_before_b <> v_after_b OR v_count_before <> v_count_after THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 8/9 - atomicidade): alguma linha foi alterada apesar do DENY (a: %/%, b: %/%, dest_count: %/%).', v_before_a, v_after_a, v_before_b, v_after_b, v_count_before, v_count_after;
  END IF;
  RAISE NOTICE 'OK (Caso 8 / 9): múltiplas ATAs sob a mesma origem legada -> autorização avaliada corretamente para TODAS; nenhuma linha alterada quando qualquer uma falha (atomicidade física confirmada).';

  -- ============================================================
  -- Caso 10: inspeção estática — has_role não pode aparecer no corpo da RPC
  -- ============================================================
  IF pg_get_functiondef('public.merge_internal_department_allocations_atomic(varchar,varchar)'::regprocedure) ILIKE '%has_role%' THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 10): merge_internal_department_allocations_atomic ainda referencia has_role().';
  END IF;
  RAISE NOTICE 'OK (Caso 10): nenhuma referência a has_role() no corpo da função.';

  RAISE NOTICE '=== FASE 2B-6 — TODOS OS CASOS PASSARAM ===';
END $$;

ROLLBACK;
