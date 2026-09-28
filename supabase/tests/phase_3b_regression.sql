-- ==============================================================================
-- FASE 3B — TESTE DE REGRESSÃO DE BANCO para o alinhamento de 'gestor' ao
-- modelo funcional definitivo (executar via psql contra o Postgres local do
-- `supabase start`, nunca contra o projeto remoto).
--
-- Matriz ALLOW/DENY explícita pedida na decisão de produto da Fase 3B:
--   Gestor de Contratos ('gestor'):    ALLOW contratos atribuídos;
--                                      DENY alocações, departamentos, usuários.
--   Gestor de Saldo ('gestor_saldos'): ALLOW alocações globais + departamentos;
--                                      DENY contratos, usuários, admin geral.
--   Coordenador ('admin'):             preserva acesso administrativo global.
--   Consulta/Auditoria ('leitor'):     preserva somente leitura.
--
-- Usa diretamente as roles REAIS de produção (admin/gestor/gestor_saldos/
-- leitor) — ao contrário dos demais arquivos phase_2b*, que isolam cenários
-- com roles sintéticas. O objetivo aqui é validar o comportamento de produção
-- pós-migration 20260926000033_align_gestor_scope_to_contracts.sql.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_3b_regression.sql
-- ==============================================================================

BEGIN;

INSERT INTO public.atas_registro_preco (id, numero_ata, codigo_uasg, ano_compra)
VALUES ('c3b00000-0000-0000-0000-00000000000c', '00091', '200331', '2026');

INSERT INTO public.itens_ata (ata_id, numero_item, descricao_item)
VALUES ('c3b00000-0000-0000-0000-00000000000c', '00001', 'Item de teste Fase 3B');

DO $$
DECLARE
  v_admin_id        UUID := '90000000-0000-0000-0000-000000000001';
  v_gestor_id       UUID := '90000000-0000-0000-0000-000000000002';
  v_gestor_saldo_id UUID := '90000000-0000-0000-0000-000000000003';
  v_leitor_id       UUID := '90000000-0000-0000-0000-000000000004';

  v_item TEXT := '00091/2026-200331-00001';
  v_result JSONB;
  v_failed BOOLEAN;
  v_sqlstate TEXT;
  v_dep_id VARCHAR(50);
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''
  FROM (VALUES
    (v_admin_id,        'phase3b-admin@example.com'),
    (v_gestor_id,       'phase3b-gestor@example.com'),
    (v_gestor_saldo_id, 'phase3b-gestor-saldo@example.com'),
    (v_leitor_id,       'phase3b-leitor@example.com')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_gestor_id, 'gestor');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_gestor_saldo_id, 'leitor', 'gestor_saldos');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_leitor_id, 'leitor');

  -- ============================================================
  -- COORDENADOR (admin) — preserva acesso administrativo global
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  IF NOT public.has_permission('contracts.manage') THEN RAISE EXCEPTION 'FALHA (admin): deveria ter contracts.manage.'; END IF;
  IF NOT public.has_permission('allocations.manage') THEN RAISE EXCEPTION 'FALHA (admin): deveria ter allocations.manage.'; END IF;
  IF NOT public.has_permission('departments.manage') THEN RAISE EXCEPTION 'FALHA (admin): deveria ter departments.manage.'; END IF;
  IF NOT public.has_permission('governance.manage_users') THEN RAISE EXCEPTION 'FALHA (admin): deveria ter governance.manage_users.'; END IF;
  IF NOT public.has_scope('contracts', 'GLOBAL', 'qualquer') THEN RAISE EXCEPTION 'FALHA (admin): escopo de contratos deveria continuar GLOBAL.'; END IF;
  RAISE NOTICE 'OK (Coordenador): acesso administrativo global preservado.';

  -- ============================================================
  -- GESTOR DE CONTRATOS (gestor) — ALLOW contratos atribuídos
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_gestor_id::text, true);
  IF NOT public.has_permission('contracts.manage') THEN RAISE EXCEPTION 'FALHA (gestor): deveria manter contracts.manage.'; END IF;
  IF NOT public.has_permission('contracts.assign') THEN RAISE EXCEPTION 'FALHA (gestor): deveria manter contracts.assign.'; END IF;
  IF NOT public.has_permission('contracts.manage_tasks') THEN RAISE EXCEPTION 'FALHA (gestor): deveria manter contracts.manage_tasks.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.role_domain_scopes WHERE role_id = 'gestor' AND domain = 'contracts' AND scope_type = 'ASSIGNED'
  ) THEN
    RAISE EXCEPTION 'FALHA (gestor): escopo de contratos deveria continuar ASSIGNED (não alterado pela Fase 3B).';
  END IF;
  RAISE NOTICE 'OK (Gestor de Contratos): contratos atribuídos preservados (contracts.* + ASSIGNED).';

  -- ============================================================
  -- GESTOR DE CONTRATOS (gestor) — DENY alocações, departamentos, usuários
  -- ============================================================
  IF public.has_permission('allocations.manage') THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor): NÃO deveria mais ter allocations.manage.'; END IF;
  IF public.has_permission('allocations.view') THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor): NÃO deveria ter allocations.view (nunca teve).'; END IF;
  IF public.has_permission('departments.manage') THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor): NÃO deveria mais ter departments.manage.'; END IF;
  IF public.has_permission('financial.manage') THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor): NÃO deveria mais ter financial.manage.'; END IF;
  IF public.has_permission('governance.manage_users') THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor): NÃO deveria mais ter governance.manage_users.'; END IF;
  RAISE NOTICE 'OK (Gestor de Contratos): sem acesso a alocações, departamentos, financeiro e usuários.';

  -- DENY operacional real: save_allocations_atomic
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_allocations_atomic(v_item, jsonb_build_array(jsonb_build_object('unit_name', 'QUALQUER', 'allocated_qty', 1)));
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (gestor): esperado 42501 em save_allocations_atomic, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor): conseguiu executar save_allocations_atomic após a Fase 3B.'; END IF;

  -- DENY operacional real: save_internal_department_atomic
  v_failed := FALSE;
  BEGIN
    PERFORM public.save_internal_department_atomic(NULL, 'DEP_3B_GESTOR_DENY', 'Tentativa indevida', NULL, TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate <> '42501' THEN RAISE EXCEPTION 'FALHA (gestor): esperado 42501 em save_internal_department_atomic, obtido %.', v_sqlstate; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor): conseguiu executar save_internal_department_atomic após a Fase 3B.'; END IF;
  RAISE NOTICE 'OK (Gestor de Contratos): save_allocations_atomic e save_internal_department_atomic negados (42501).';

  -- ============================================================
  -- GESTOR DE SALDO (gestor_saldos) — ALLOW alocações globais + departamentos
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_gestor_saldo_id::text, true);
  IF NOT public.has_permission('allocations.view') THEN RAISE EXCEPTION 'FALHA (gestor_saldos): deveria ter allocations.view.'; END IF;
  IF NOT public.has_permission('allocations.manage') THEN RAISE EXCEPTION 'FALHA (gestor_saldos): deveria ter allocations.manage.'; END IF;
  IF NOT public.has_permission('departments.manage') THEN RAISE EXCEPTION 'FALHA (gestor_saldos): deveria ter departments.manage (Fase 3B).'; END IF;
  IF NOT public.has_scope('allocations', 'UNIT', 'QUALQUER_UNIDADE') THEN RAISE EXCEPTION 'FALHA (gestor_saldos): escopo GLOBAL deveria autorizar qualquer UNIT.'; END IF;

  v_result := public.save_allocations_atomic(v_item, jsonb_build_array(jsonb_build_object('unit_name', 'QUALQUER_UNIDADE_3B', 'allocated_qty', 4)));
  IF (v_result->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA (gestor_saldos): deveria conseguir executar save_allocations_atomic. Resultado: %', v_result; END IF;

  v_result := public.save_internal_department_atomic(NULL, 'DEP_3B_SALDO', 'Departamento criado por gestor_saldos', NULL, TRUE);
  IF (v_result->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA (gestor_saldos): deveria conseguir executar save_internal_department_atomic. Resultado: %', v_result; END IF;
  v_dep_id := v_result->'department'->>'id';

  v_result := public.delete_internal_department_atomic(v_dep_id, FALSE);
  IF (v_result->>'deleted')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA (gestor_saldos): deveria conseguir executar delete_internal_department_atomic. Resultado: %', v_result; END IF;

  -- merge_internal_department_allocations_atomic: já era ALLOW para
  -- gestor_saldos antes da Fase 3B (gateia em allocations.manage, não em
  -- departments.manage) — reconfirma que continua funcionando.
  INSERT INTO public.internal_departments (id, sigla, nome_completo, ativo)
  VALUES ('dep-3b-destino', 'DESTINO_3B', 'Departamento de destino (Fase 3B)', TRUE);
  INSERT INTO public.arp_allocations (id, item_key, unit_name, allocated_qty)
  VALUES ('alloc-3b-legado', v_item, 'ORIGEM_LEGADA_3B', 2);
  v_result := public.merge_internal_department_allocations_atomic('ORIGEM_LEGADA_3B', 'DESTINO_3B');
  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (gestor_saldos): merge_internal_department_allocations_atomic deveria continuar funcionando. Resultado: %', v_result;
  END IF;
  RAISE NOTICE 'OK (Gestor de Saldo): allocations.* GLOBAL + departments.manage funcionando (save/delete department, save_allocations, merge).';

  -- ============================================================
  -- GESTOR DE SALDO (gestor_saldos) — DENY contratos, usuários, admin geral
  -- ============================================================
  IF public.has_permission('contracts.manage') THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor_saldos): NÃO deveria ter contracts.manage.'; END IF;
  IF public.has_permission('governance.manage_users') THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor_saldos): NÃO deveria ter governance.manage_users.'; END IF;
  IF public.has_permission('financial.manage') THEN RAISE EXCEPTION 'FALHA CRÍTICA (gestor_saldos): NÃO deveria ter financial.manage.'; END IF;
  RAISE NOTICE 'OK (Gestor de Saldo): sem acesso a contratos, usuários ou financeiro.';

  -- ============================================================
  -- CONSULTA/AUDITORIA (leitor) — preserva somente leitura
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_leitor_id::text, true);
  IF NOT public.has_permission('contracts.view') THEN RAISE EXCEPTION 'FALHA (leitor): deveria ter contracts.view.'; END IF;
  IF NOT public.has_permission('allocations.view') THEN RAISE EXCEPTION 'FALHA (leitor): deveria ter allocations.view.'; END IF;
  IF NOT public.has_permission('departments.view') THEN RAISE EXCEPTION 'FALHA (leitor): deveria ter departments.view.'; END IF;
  IF public.has_permission('contracts.manage') THEN RAISE EXCEPTION 'FALHA CRÍTICA (leitor): NÃO deveria ter contracts.manage.'; END IF;
  IF public.has_permission('allocations.manage') THEN RAISE EXCEPTION 'FALHA CRÍTICA (leitor): NÃO deveria ter allocations.manage.'; END IF;
  IF public.has_permission('departments.manage') THEN RAISE EXCEPTION 'FALHA CRÍTICA (leitor): NÃO deveria ter departments.manage.'; END IF;
  IF public.has_permission('governance.manage_users') THEN RAISE EXCEPTION 'FALHA CRÍTICA (leitor): NÃO deveria ter governance.manage_users.'; END IF;
  RAISE NOTICE 'OK (Consulta/Auditoria): somente leitura preservada.';

  RAISE NOTICE '=== FASE 3B — MATRIZ ALLOW/DENY DOS QUATRO PERFIS VALIDADA ===';
END $$;

ROLLBACK;
