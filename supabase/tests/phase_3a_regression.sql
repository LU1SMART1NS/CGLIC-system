-- ==============================================================================
-- FASE 3A (corrigida) — TESTE DE REGRESSÃO DE BANCO para o perfil "Gestor de
-- Saldo" (executar via psql contra o Postgres local do `supabase start`,
-- nunca contra o projeto remoto).
--
-- Modelo definitivo: gestor_saldos é GLOBAL no domínio allocations — não
-- UNIT, não ARP. GLOBAL aqui significa exclusivamente "acesso global ao
-- domínio allocations", nunca acesso a outros domínios.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_3a_regression.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Casos 1-3, 6: estrutura da role gestor_saldos (sem depender de usuário)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Caso 1: role existe
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = 'gestor_saldos') THEN
    RAISE EXCEPTION 'FALHA (Caso 1): role gestor_saldos não existe em public.roles.';
  END IF;
  RAISE NOTICE 'OK (Caso 1): role gestor_saldos existe.';

  -- Caso 2 / 6: EXATAMENTE allocations.view + allocations.manage, nada mais
  SELECT COUNT(*) INTO v_count FROM public.role_permissions
   WHERE role_id = 'gestor_saldos' AND permission_key IN ('allocations.view', 'allocations.manage');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FALHA (Caso 2): esperado allocations.view + allocations.manage, encontrado % linha(s).', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.role_permissions
   WHERE role_id = 'gestor_saldos'
     AND permission_key NOT IN ('allocations.view', 'allocations.manage');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 6): gestor_saldos tem % permissão(ões) fora do domínio allocations.', v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.role_permissions
     WHERE role_id = 'gestor_saldos'
       AND permission_key IN (
         'contracts.view', 'contracts.assign', 'contracts.manage', 'contracts.manage_tasks',
         'financial.manage', 'departments.view', 'departments.manage',
         'governance.manage_users', 'governance.manage_roles', 'reports.export'
       )
  ) THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 6): gestor_saldos recebeu alguma permissão explicitamente proibida.';
  END IF;
  RAISE NOTICE 'OK (Caso 2 / 6): gestor_saldos tem exatamente allocations.view + allocations.manage, nada mais.';

  -- Caso 3: escopo é GLOBAL, e NÃO UNIT/ARP
  IF NOT EXISTS (
    SELECT 1 FROM public.role_domain_scopes
     WHERE role_id = 'gestor_saldos' AND domain = 'allocations' AND scope_type = 'GLOBAL'
  ) THEN
    RAISE EXCEPTION 'FALHA (Caso 3): gestor_saldos deveria ter allocations/GLOBAL.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.role_domain_scopes
     WHERE role_id = 'gestor_saldos' AND domain = 'allocations' AND scope_type IN ('UNIT', 'ARP')
  ) THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 3): gestor_saldos ainda possui UNIT/ARP — deveria ser só GLOBAL.';
  END IF;
  RAISE NOTICE 'OK (Caso 3): gestor_saldos tem allocations/GLOBAL e nada de UNIT/ARP.';
END $$;

-- ------------------------------------------------------------------------------
-- Fixtures: usuários para os casos com dado real (4, 5, 7, 8, 9, 10)
-- ------------------------------------------------------------------------------
INSERT INTO public.atas_registro_preco (id, numero_ata, codigo_uasg, ano_compra)
VALUES
  ('a5000000-0000-0000-0000-00000000000a', '00081', '200331', '2026'),
  ('b5000000-0000-0000-0000-00000000000b', '00082', '200331', '2026');

INSERT INTO public.itens_ata (ata_id, numero_item, descricao_item)
VALUES
  ('a5000000-0000-0000-0000-00000000000a', '00001', 'ATA A - item (Fase 3A corrigida)'),
  ('b5000000-0000-0000-0000-00000000000b', '00001', 'ATA B - item (Fase 3A corrigida)');

INSERT INTO public.internal_departments (id, sigla, nome_completo, ativo) VALUES
  ('dep-3ac-unidade-x', 'UNIDADE_X_3A', 'Unidade X (Fase 3A corrigida)', TRUE),
  ('dep-3ac-unidade-y', 'UNIDADE_Y_3A', 'Unidade Y (Fase 3A corrigida)', TRUE);

-- Role sintética para o Caso 10 (composição — Gestor de Saldo + outro papel)
INSERT INTO public.roles (id, label, is_system) VALUES ('test_3ac_outro_papel', 'Teste: outro papel (departments.manage)', FALSE);
INSERT INTO public.role_permissions (role_id, permission_key) VALUES ('test_3ac_outro_papel', 'departments.manage');

DO $$
DECLARE
  v_gestor_saldo_id UUID := '80000000-0000-0000-0000-000000000001';
  v_sem_role_id     UUID := '80000000-0000-0000-0000-000000000002';
  v_multi_id        UUID := '80000000-0000-0000-0000-000000000003';

  v_result JSONB;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, crypt('x', gen_salt('bf')), NOW(), '{}', '{}', NOW(), NOW(), '', ''
  FROM (VALUES
    (v_gestor_saldo_id, 'phase3ac-gestor-saldo@example.com'),
    (v_sem_role_id,     'phase3ac-sem-role@example.com'),
    (v_multi_id,        'phase3ac-multi@example.com')
  ) AS x(id, email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_gestor_saldo_id, 'leitor', 'gestor_saldos');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'leitor', 'gestor_saldos');
  INSERT INTO public.user_roles (user_id, role, role_id) VALUES (v_multi_id, 'gestor', 'test_3ac_outro_papel');
  -- v_sem_role_id: propositalmente sem nenhuma role.
  -- Nenhum dos três usuários recebe QUALQUER linha em user_scope_assignments
  -- (Caso 8: Gestor de Saldo não precisa disso).

  -- ============================================================
  -- Caso 4: usuário com apenas gestor_saldos -> tem as duas permissões
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_gestor_saldo_id::text, true);
  IF NOT public.has_permission('allocations.view') THEN RAISE EXCEPTION 'FALHA (Caso 4): deveria ter allocations.view.'; END IF;
  IF NOT public.has_permission('allocations.manage') THEN RAISE EXCEPTION 'FALHA (Caso 4): deveria ter allocations.manage.'; END IF;
  RAISE NOTICE 'OK (Caso 4): usuário com apenas gestor_saldos tem allocations.view e allocations.manage.';

  -- ============================================================
  -- Caso 5 / 9 (segurança): acesso global -> UNIT e ARP, qualquer valor,
  -- retornam TRUE; NENHUMA outra permissão é concedida por isso.
  -- ============================================================
  IF NOT public.has_scope('allocations', 'UNIT', 'UNIDADE_X_3A') THEN RAISE EXCEPTION 'FALHA (Caso 5): GLOBAL deveria autorizar qualquer UNIT.'; END IF;
  IF NOT public.has_scope('allocations', 'UNIT', 'UNIDADE_QUE_NEM_EXISTE') THEN RAISE EXCEPTION 'FALHA (Caso 5): GLOBAL deveria autorizar qualquer UNIT, mesmo uma inexistente.'; END IF;
  IF NOT public.has_scope('allocations', 'ARP', 'a5000000-0000-0000-0000-00000000000a') THEN RAISE EXCEPTION 'FALHA (Caso 5): GLOBAL deveria autorizar qualquer ARP.'; END IF;
  IF NOT public.has_scope('allocations', 'ARP', 'qualquer-ata-inexistente') THEN RAISE EXCEPTION 'FALHA (Caso 5): GLOBAL deveria autorizar qualquer ARP, mesmo uma inexistente.'; END IF;

  IF public.has_permission('contracts.manage') OR public.has_permission('financial.manage')
     OR public.has_permission('departments.manage') OR public.has_permission('governance.manage_users')
     OR public.has_permission('governance.manage_roles') OR public.has_permission('reports.export') THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (segurança): GLOBAL de gestor_saldos concedeu permissão fora do domínio allocations.';
  END IF;
  RAISE NOTICE 'OK (Caso 5 / segurança): acesso global ao domínio allocations, sem nenhuma permissão de outro domínio.';

  -- ============================================================
  -- Caso 7: execução real de save_allocations_atomic em ATA A, ATA B e
  -- unidades diferentes, com usuário que só tem gestor_saldos.
  -- ============================================================
  v_result := public.save_allocations_atomic('00081/2026-200331-00001', jsonb_build_array(
    jsonb_build_object('unit_name', 'UNIDADE_X_3A', 'allocated_qty', 5)
  ));
  IF (v_result->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA (Caso 7): deveria conseguir alocar na ATA A / UNIDADE_X_3A. Resultado: %', v_result; END IF;

  v_result := public.save_allocations_atomic('00082/2026-200331-00001', jsonb_build_array(
    jsonb_build_object('unit_name', 'UNIDADE_Y_3A', 'allocated_qty', 7)
  ));
  IF (v_result->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA (Caso 7): deveria conseguir alocar na ATA B / UNIDADE_Y_3A. Resultado: %', v_result; END IF;
  RAISE NOTICE 'OK (Caso 7): save_allocations_atomic executado com sucesso em ATA A e ATA B, em unidades diferentes, só com gestor_saldos.';

  -- ============================================================
  -- Caso 8: confirma que NENHUMA linha em user_scope_assignments foi
  -- necessária (nem criada) para as operações acima.
  -- ============================================================
  IF EXISTS (SELECT 1 FROM public.user_scope_assignments WHERE user_id = v_gestor_saldo_id) THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 8): usuário Gestor de Saldo possui linha(s) em user_scope_assignments — não deveria precisar de nenhuma.';
  END IF;
  RAISE NOTICE 'OK (Caso 8): nenhuma linha em user_scope_assignments foi necessária para o Gestor de Saldo operar.';

  -- ============================================================
  -- Caso 9: usuário SEM gestor_saldos não recebe essas permissões só por existir
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_sem_role_id::text, true);
  IF public.has_permission('allocations.view') OR public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 9): usuário sem gestor_saldos (e sem nenhuma role) recebeu permissões de allocations.';
  END IF;
  IF public.has_scope('allocations', 'UNIT', 'QUALQUER') OR public.has_scope('allocations', 'ARP', 'QUALQUER') THEN
    RAISE EXCEPTION 'FALHA CRÍTICA (Caso 9): usuário sem role obteve escopo global por engano.';
  END IF;
  RAISE NOTICE 'OK (Caso 9): usuário sem gestor_saldos não recebe nenhuma permissão/escopo de allocations.';

  -- ============================================================
  -- Caso 10: composição — Gestor de Saldo + outro papel -> união normal
  -- ============================================================
  PERFORM set_config('request.jwt.claim.sub', v_multi_id::text, true);
  IF NOT public.has_permission('allocations.manage') THEN RAISE EXCEPTION 'FALHA (Caso 10): deveria ter allocations.manage (via gestor_saldos).'; END IF;
  IF NOT public.has_permission('departments.manage') THEN RAISE EXCEPTION 'FALHA (Caso 10): deveria ter departments.manage (via outro papel).'; END IF;
  IF NOT public.has_scope('allocations', 'UNIT', 'QUALQUER_UNIDADE_TESTE') THEN
    RAISE EXCEPTION 'FALHA (Caso 10): acesso global de allocations deveria continuar valendo em composição com outro papel.';
  END IF;
  RAISE NOTICE 'OK (Caso 10): composição gestor_saldos + outro papel -> união normal, sem regra especial de exclusividade.';

  RAISE NOTICE '=== FASE 3A (corrigida) — TODOS OS CASOS DO PERFIL GESTOR DE SALDO GLOBAL PASSARAM ===';
END $$;

ROLLBACK;
