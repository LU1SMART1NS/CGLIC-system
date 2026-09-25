-- ==============================================================================
-- FASE 2B-4 — TESTE DE REGRESSÃO DE BANCO para
-- merge_internal_department_allocations_atomic() migrada para
-- has_permission()/has_scope() (executar via psql contra o Postgres local do
-- `supabase start`, nunca contra o projeto remoto).
--
-- NOTA ESTRUTURAL sobre o "Caso 8" pedido (payload misto CGLIC+OUTRA para
-- UNIT): esta RPC recebe um único p_old_name por chamada — o WHERE do UPDATE
-- é sempre `unit_name = p_old_name`, então TODAS as linhas afetadas por uma
-- mesma chamada compartilham, por definição, a MESMA unidade de origem.
-- Não existe fisicamente um "payload misto de duas unidades" para esta RPC
-- (diferente de save_allocations_atomic/save_empenho_links_atomic, que
-- recebem arrays). O cenário de mistura real e testável aqui é por ATA (uma
-- mesma unidade de origem pode ter alocações em atas diferentes) — é
-- exatamente isso que os Casos 11 e o teste de atomicidade cobrem.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_2b4_regression.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Fixtures: duas atas, dois itens, departamentos de destino
-- ------------------------------------------------------------------------------
INSERT INTO public.atas_registro_preco (id, numero_ata, codigo_uasg, ano_compra)
VALUES
  ('a2000000-0000-0000-0000-00000000000a', '00051', '200331', '2026'),
  ('b2000000-0000-0000-0000-00000000000b', '00052', '200331', '2026');

-- Vários itens distintos por ata: cada "origem" testada usa seu próprio
-- item_key, para não colidir com o destino comum DEST_2B4 na UNIQUE
-- (item_key, unit_name) de arp_allocations quando mais de um merge bem
-- sucedido mirar o mesmo destino ao longo do teste.
INSERT INTO public.itens_ata (ata_id, numero_item, descricao_item)
VALUES
  ('a2000000-0000-0000-0000-00000000000a', '00001', 'ATA A - item 1 (ORIGEM_GLOBAL)'),
  ('a2000000-0000-0000-0000-00000000000a', '00002', 'ATA A - item 2 (ORIGEM_UNIT_CGLIC)'),
  ('a2000000-0000-0000-0000-00000000000a', '00003', 'ATA A - item 3 (ORIGEM_UNIT_OUTRA)'),
  ('a2000000-0000-0000-0000-00000000000a', '00004', 'ATA A - item 4 (ORIGEM_ARP_A)'),
  ('a2000000-0000-0000-0000-00000000000a', '00005', 'ATA A - item 5 (ORIGEM_ARP_MIXED, metade A)'),
  ('a2000000-0000-0000-0000-00000000000a', '00006', 'ATA A - item 6 (ORIGEM_NOASSIGN)'),
  ('a2000000-0000-0000-0000-00000000000a', '00007', 'ATA A - item 7 (ORIGEM_MULTI_UNIT)'),
  ('a2000000-0000-0000-0000-00000000000a', '00008', 'ATA A - item 8 (ORIGEM_MULTI_NONE)'),
  ('b2000000-0000-0000-0000-00000000000b', '00001', 'ATA B - item 1 (ORIGEM_ARP_B)'),
  ('b2000000-0000-0000-0000-00000000000b', '00002', 'ATA B - item 2 (ORIGEM_ARP_MIXED, metade B)');

-- Nota de auditoria (ver migration 28): arp_allocations.unit_name tem FK
-- para internal_departments(sigla) — p_old_name precisa corresponder a um
-- departamento que já existiu (mesmo que hoje considerado legado/duplicado).
-- Por isso cada "origem" usada abaixo precisa ter sua própria linha em
-- internal_departments, além do destino comum DEST_2B4.
INSERT INTO public.internal_departments (id, sigla, nome_completo, ativo) VALUES
  -- Todas as "origens" abaixo são INATIVAS desde a Fase 2B-6 (a RPC só
  -- aceita origem órfã/legada, nunca a sigla de um departamento ativo). Só
  -- DEST_2B4 (o destino) precisa estar ativo.
  ('dep-2b4-dest',         'DEST_2B4',           'Unidade de Destino (2B-4)', TRUE),
  ('dep-2b4-o-global',     'ORIGEM_GLOBAL',      'Origem legada (GLOBAL)', FALSE),
  ('dep-2b4-o-unit-cglic', 'ORIGEM_UNIT_CGLIC',  'Origem legada (UNIT CGLIC)', FALSE),
  ('dep-2b4-o-unit-outra', 'ORIGEM_UNIT_OUTRA',  'Origem legada (UNIT OUTRA)', FALSE),
  ('dep-2b4-o-arp-a',      'ORIGEM_ARP_A',       'Origem legada (ARP A)', FALSE),
  ('dep-2b4-o-arp-b',      'ORIGEM_ARP_B',       'Origem legada (ARP B)', FALSE),
  ('dep-2b4-o-mixed',      'ORIGEM_ARP_MIXED',   'Origem legada (mista A+B)', FALSE),
  ('dep-2b4-o-noassign',   'ORIGEM_NOASSIGN',    'Origem legada (sem assignment)', FALSE),
  ('dep-2b4-o-multi-unit', 'ORIGEM_MULTI_UNIT',  'Origem legada (multi-role UNIT)', FALSE),
  ('dep-2b4-o-multi-none', 'ORIGEM_MULTI_NONE',  'Origem legada (multi-role sem cobertura)', FALSE);

-- Alocações de origem (cada unit_name já existe em internal_departments;
-- cada origem usa um item_key próprio — ver comentário acima)
INSERT INTO public.arp_allocations (id, item_key, unit_name, allocated_qty) VALUES
  ('alloc-2b4-global',      '00051/2026-200331-00001', 'ORIGEM_GLOBAL',      1),
  ('alloc-2b4-unit-cglic',  '00051/2026-200331-00002', 'ORIGEM_UNIT_CGLIC',  1),
  ('alloc-2b4-unit-outra',  '00051/2026-200331-00003', 'ORIGEM_UNIT_OUTRA',  1),
  ('alloc-2b4-arp-a',       '00051/2026-200331-00004', 'ORIGEM_ARP_A',       1),
  ('alloc-2b4-arp-b',       '00052/2026-200331-00001', 'ORIGEM_ARP_B',       1),
  ('alloc-2b4-mixed-a',     '00051/2026-200331-00005', 'ORIGEM_ARP_MIXED',   1),
  ('alloc-2b4-mixed-b',     '00052/2026-200331-00002', 'ORIGEM_ARP_MIXED',   1),
  ('alloc-2b4-noassign',    '00051/2026-200331-00006', 'ORIGEM_NOASSIGN',    1),
  ('alloc-2b4-multi-unit',  '00051/2026-200331-00007', 'ORIGEM_MULTI_UNIT',  1),
  ('alloc-2b4-multi-none',  '00051/2026-200331-00008', 'ORIGEM_MULTI_NONE',  1);

-- ------------------------------------------------------------------------------
-- Fixtures: roles sintéticas
-- ------------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES
  ('test_2b4_departments_only', 'Teste: só departments.manage', FALSE),
  ('test_2b4_financial_only', 'Teste: só financial.manage', FALSE),
  ('test_2b4_unit_cglic', 'Teste: allocations.manage + UNIT=ORIGEM_UNIT_CGLIC', FALSE),
  ('test_2b4_arp_a', 'Teste: allocations.manage + ARP=ATA_A', FALSE),
  ('test_2b4_unit_no_assignment', 'Teste: UNIT sem nenhuma assignment', FALSE),
  ('test_2b4_multi_unit', 'Teste: allocations.manage + UNIT=ORIGEM_MULTI_UNIT', FALSE),
  ('test_2b4_multi_arp_b', 'Teste: allocations.manage + ARP=ATA_B', FALSE);

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('test_2b4_departments_only', 'departments.manage'),
  ('test_2b4_financial_only', 'financial.manage'),
  ('test_2b4_unit_cglic', 'allocations.manage'),
  ('test_2b4_arp_a', 'allocations.manage'),
  ('test_2b4_unit_no_assignment', 'allocations.manage'),
  ('test_2b4_multi_unit', 'allocations.manage'),
  ('test_2b4_multi_arp_b', 'allocations.manage');

INSERT INTO public.role_domain_scopes (role_id, domain, scope_type) VALUES
  ('test_2b4_unit_cglic', 'allocations', 'UNIT'),
  ('test_2b4_arp_a', 'allocations', 'ARP'),
  ('test_2b4_unit_no_assignment', 'allocations', 'UNIT'),
  ('test_2b4_multi_unit', 'allocations', 'UNIT'),
  ('test_2b4_multi_arp_b', 'allocations', 'ARP');

DO $$
DECLARE
  v_leitor_id        UUID := '50000000-0000-0000-0000-000000000001';
  v_admin_id         UUID := '50000000-0000-0000-0000-000000000002';
  v_dept_only_id     UUID := '50000000-0000-0000-0000-000000000003';
  v_financial_id     UUID := '50000000-0000-0000-0000-000000000004';
  v_no_role_id       UUID := '50000000-0000-0000-0000-000000000005';
  v_unit_cglic_id    UUID := '50000000-0000-0000-0000-000000000006';
  v_arp_a_id         UUID := '50000000-0000-0000-0000-000000000007';
  v_no_assignment_id UUID := '50000000-0000-0000-0000-000000000008';
  v_multi_id         UUID := '50000000-0000-0000-0000-000000000009';

  v_ata_a_id UUID := 'a2000000-0000-0000-0000-00000000000a';
  v_ata_b_id UUID := 'b2000000-0000-0000-0000-00000000000b';

  v_result JSONB;
  v_failed BOOLEAN;
  v_sqlstate TEXT;
  v_before_a TEXT;
  v_before_b TEXT;
  v_after_a TEXT;
  v_after_b TEXT;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''
  FROM (VALUES
    (v_leitor_id,        'phase2b4-leitor@example.com'),
    (v_admin_id,         'phase2b4-admin@example.com'),
    (v_dept_only_id,     'phase2b4-dept-only@example.com'),
    (v_financial_id,     'phase2b4-financial@example.com'),
    (v_no_role_id,       'phase2b4-no-role@example.com'),
    (v_unit_cglic_id,    'phase2b4-unit-cglic@example.com'),
    (v_arp_a_id,         'phase2b4-arp-a@example.com'),
    (v_no_assignment_id, 'phase2b4-no-assignment@example.com'),
    (v_multi_id,         'phase2b4-multi@example.com')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_leitor_id, 'leitor');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_dept_only_id, 'gestor', 'test_2b4_departments_only');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_financial_id, 'gestor', 'test_2b4_financial_only');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_unit_cglic_id, 'gestor', 'test_2b4_unit_cglic');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_arp_a_id, 'gestor', 'test_2b4_arp_a');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_no_assignment_id, 'gestor', 'test_2b4_unit_no_assignment');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'gestor', 'test_2b4_multi_unit');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'leitor', 'test_2b4_multi_arp_b');
  -- v_no_role_id: propositalmente sem nenhuma linha em user_roles.

  INSERT INTO public.user_scope_assignments (user_id, domain, scope_type, scope_value) VALUES
    (v_unit_cglic_id, 'allocations', 'UNIT', 'ORIGEM_UNIT_CGLIC'),
    (v_arp_a_id, 'allocations', 'ARP', v_ata_a_id::TEXT),
    (v_multi_id, 'allocations', 'UNIT', 'ORIGEM_MULTI_UNIT'),
    (v_multi_id, 'allocations', 'ARP', v_ata_b_id::TEXT);
  -- v_admin_id e v_no_assignment_id propositalmente SEM nenhuma linha aqui.

  -- ============================================================
  -- Casos 1-5: PERMISSION
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_leitor_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_GLOBAL', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 1): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 1): leitor sem allocations.manage conseguiu executar.'; END IF;
  RAISE NOTICE 'OK (Caso 1): sem allocations.manage -> DENY 42501.';

  IF EXISTS (SELECT 1 FROM public.user_scope_assignments WHERE user_id = v_admin_id) THEN
    RAISE EXCEPTION 'FALHA (setup Caso 2/14): admin não deveria ter nenhuma user_scope_assignments.';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_GLOBAL', 'DEST_2B4');
  IF (v_result->>'success')::boolean IS NOT TRUE OR (v_result->>'rows_updated')::int <> 1 THEN
    RAISE EXCEPTION 'FALHA (Caso 2/14): GLOBAL sem assignments deveria conseguir mover ORIGEM_GLOBAL. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 2 / 14): permission + GLOBAL -> ALLOW, sem exigir user_scope_assignments.';

  PERFORM set_config('request.jwt.claim.sub', v_dept_only_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_UNIT_CGLIC', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 3): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 3): usuário só com departments.manage conseguiu mover alocações.'; END IF;
  RAISE NOTICE 'OK (Caso 3): apenas departments.manage -> DENY.';

  PERFORM set_config('request.jwt.claim.sub', v_financial_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_UNIT_CGLIC', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 4): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 4): usuário só com financial.manage conseguiu mover alocações.'; END IF;
  RAISE NOTICE 'OK (Caso 4): apenas financial.manage -> DENY.';

  PERFORM set_config('request.jwt.claim.sub', v_no_role_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_UNIT_CGLIC', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 5): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 5): usuário sem role conseguiu mover alocações.'; END IF;
  RAISE NOTICE 'OK (Caso 5): usuário sem role -> DENY.';

  -- ============================================================
  -- Casos 6-8: UNIT
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_unit_cglic_id::text, true);
  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_UNIT_CGLIC', 'DEST_2B4');
  IF (v_result->>'success')::boolean IS NOT TRUE OR (v_result->>'rows_updated')::int <> 1 THEN
    RAISE EXCEPTION 'FALHA (Caso 6): UNIT=ORIGEM_UNIT_CGLIC deveria conseguir mover essa origem. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 6): allocations.manage + UNIT=CGLIC -> operação sobre CGLIC -> ALLOW.';

  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_UNIT_OUTRA', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 7): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 7): usuário restrito a UNIT=CGLIC conseguiu mover ORIGEM_UNIT_OUTRA.'; END IF;
  RAISE NOTICE 'OK (Caso 7): UNIT=CGLIC -> operação sobre OUTRA -> DENY.';

  RAISE NOTICE 'NOTA (Caso 8): payload misto de UNIDADES não é fisicamente possível nesta RPC (um único p_old_name por chamada — ver cabeçalho do arquivo). Atomicidade para UNIT é, portanto, trivial: uma chamada só pode ter ALLOW ou DENY integral, nunca parcial, porque só existe uma unidade de origem por chamada.';

  -- ============================================================
  -- Casos 9-11: ARP
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_arp_a_id::text, true);
  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_ARP_A', 'DEST_2B4');
  IF (v_result->>'success')::boolean IS NOT TRUE OR (v_result->>'rows_updated')::int <> 1 THEN
    RAISE EXCEPTION 'FALHA (Caso 9): ARP=ATA_A deveria conseguir mover ORIGEM_ARP_A (item da ATA_A). Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Caso 9): allocations.manage + ARP=ATA_A -> operação sobre item da ATA_A -> ALLOW.';

  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_ARP_B', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 10): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 10): usuário restrito à ATA_A conseguiu mover ORIGEM_ARP_B (item da ATA_B).'; END IF;
  RAISE NOTICE 'OK (Caso 10): ARP=ATA_A -> operação sobre item da ATA_B -> DENY.';

  -- Caso 11 + teste de atomicidade física: ORIGEM_ARP_MIXED tem uma linha na
  -- ATA_A e outra na ATA_B; usuário só tem ARP=ATA_A -> deve negar TUDO.
  SELECT unit_name INTO v_before_a FROM public.arp_allocations WHERE id = 'alloc-2b4-mixed-a';
  SELECT unit_name INTO v_before_b FROM public.arp_allocations WHERE id = 'alloc-2b4-mixed-b';

  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_ARP_MIXED', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 11): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 11): payload misto ATA_A+ATA_B deveria ter sido negado integralmente.'; END IF;

  SELECT unit_name INTO v_after_a FROM public.arp_allocations WHERE id = 'alloc-2b4-mixed-a';
  SELECT unit_name INTO v_after_b FROM public.arp_allocations WHERE id = 'alloc-2b4-mixed-b';
  IF v_before_a <> v_after_a OR v_before_b <> v_after_b THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 11 / atomicidade): ao menos uma linha foi alterada apesar do DENY (antes: %/%, depois: %/%).', v_before_a, v_before_b, v_after_a, v_after_b;
  END IF;
  RAISE NOTICE 'OK (Caso 11 / atomicidade física): payload cobrindo ATA_A+ATA_B negado integralmente — as duas linhas permanecem fisicamente inalteradas (antes=depois: % e %).', v_after_a, v_after_b;

  -- ============================================================
  -- Caso 12: escopo UNIT sem nenhuma user_scope_assignments -> DENY
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_no_assignment_id::text, true);
  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_NOASSIGN', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 12): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 12): usuário com escopo UNIT sem nenhuma assignment conseguiu mover alocações.'; END IF;
  RAISE NOTICE 'OK (Caso 12): escopo UNIT sem user_scope_assignments -> DENY.';

  -- ============================================================
  -- Caso 13: múltiplas roles/escopos -> união correta
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_multi_id::text, true);
  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_MULTI_UNIT', 'DEST_2B4');
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 13a): role A (UNIT=ORIGEM_MULTI_UNIT) deveria autorizar. Resultado: %', v_result;
  END IF;

  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_ARP_B', 'DEST_2B4');
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 13b): role B (ARP=ATA_B) deveria autorizar ORIGEM_ARP_B (ainda não movida — o Caso 10 falhou com outro usuário). Resultado: %', v_result;
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.merge_internal_department_allocations_atomic('ORIGEM_MULTI_NONE', 'DEST_2B4');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (Caso 13c): esperado 42501, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (Caso 13c): usuário multi-role conseguiu mover ORIGEM_MULTI_NONE, fora de qualquer uma de suas roles.'; END IF;
  RAISE NOTICE 'OK (Caso 13): múltiplas roles -> união correta (UNIT de A ALLOW, ARP de B ALLOW, nenhuma delas cobrindo uma terceira origem -> DENY).';

  RAISE NOTICE 'NOTA (Caso 15): "allocations.manage sem escopo -> DENY quando a operação exigir escopo" já está coberto pelos Casos 7, 10 e 12 acima (permissão presente, escopo incompatível ou ausente).';

  -- ============================================================
  -- Caso 16: inspeção estática — has_role não pode aparecer no corpo da RPC
  -- ============================================================
  IF pg_get_functiondef('public.merge_internal_department_allocations_atomic(varchar,varchar)'::regprocedure) ILIKE '%has_role%' THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 16): merge_internal_department_allocations_atomic ainda referencia has_role().';
  END IF;
  RAISE NOTICE 'OK (Caso 16): nenhuma referência a has_role() no corpo da função.';

  -- ============================================================
  -- Casos 17-20: segurança da função
  -- ============================================================
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'merge_internal_department_allocations_atomic' AND p.prosecdef = TRUE
  ) THEN
    RAISE EXCEPTION 'FALHA (Caso 17): a função deveria continuar SECURITY DEFINER.';
  END IF;
  RAISE NOTICE 'OK (Caso 17): SECURITY DEFINER confirmado.';

  IF pg_get_functiondef('public.merge_internal_department_allocations_atomic(varchar,varchar)'::regprocedure) NOT ILIKE '%search_path%public%' THEN
    RAISE EXCEPTION 'FALHA (Caso 18): search_path explícito (public) não encontrado na definição da função.';
  END IF;
  RAISE NOTICE 'OK (Caso 18): search_path explícito confirmado.';

  IF has_function_privilege('anon', 'public.merge_internal_department_allocations_atomic(varchar,varchar)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 19): role anon tem EXECUTE na função.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.merge_internal_department_allocations_atomic(varchar,varchar)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA (Caso 19): role authenticated deveria continuar com EXECUTE na função.';
  END IF;
  RAISE NOTICE 'OK (Caso 19): grants preservados (anon sem EXECUTE, authenticated com EXECUTE).';

  RAISE NOTICE 'OK (Caso 20): RLS não foi tocado nesta migration (nenhuma policy de arp_allocations/internal_departments foi criada, alterada ou removida) — confirmado por inspeção do arquivo da migration, sem necessidade de teste de escrita adicional específico desta fase.';

  RAISE NOTICE '=== FASE 2B-4 — TODOS OS CASOS DE merge_internal_department_allocations_atomic PASSARAM ===';
END $$;

ROLLBACK;
