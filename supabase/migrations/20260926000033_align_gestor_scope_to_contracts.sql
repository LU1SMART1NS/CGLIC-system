-- ==============================================================================
-- MIGRATION 33: FASE 3B — ALINHAMENTO DE ESCOPO DE 'gestor' AO MODELO FUNCIONAL
-- (Gestor de Contratos) E CONCESSÃO DE 'departments.manage' A 'gestor_saldos'
-- ==============================================================================
-- Decisão de produto (auditoria de intenção funcional, Fase 3B): a role
-- 'gestor' (perfil "Gestor de Contratos") herdava, desde a Fase 1
-- (20260925000023_rbac_foundation_phase1.sql), o comportamento efetivo
-- pré-RBAC em que 'gestor' e 'admin' eram tratados como equivalentes em quase
-- toda RPC de escrita. Essa equivalência nunca foi uma decisão de produto —
-- era o comportamento herdado por backfill. O modelo funcional definitivo
-- restringe 'gestor' à sua responsabilidade real: contratos atribuídos.
--
-- Escopo estrito desta migration: SOMENTE dados em role_permissions. Nenhuma
-- RPC, nenhuma role nova, nenhum role_domain_scopes, nenhuma tabela.
--   - contracts.* de 'gestor' e seu escopo ASSIGNED (role_domain_scopes) NÃO
--     são tocados.
--   - has_permission()/has_scope() NÃO são alterados.
--   - As RPCs de Alocações (save_allocations_atomic, save_empenho_links_atomic,
--     merge_internal_department_allocations_atomic) e de Departamentos
--     (save_internal_department_atomic, delete_internal_department_atomic) já
--     checam has_permission('allocations.manage')/has_permission('departments.manage')
--     dinamicamente (Fases 2B-2 a 2B-6) — esta migration muda só quem tem
--     essas permissões, sem exigir nenhuma mudança nessas funções.
--
-- ------------------------------------------------------------------------------
-- 1. REMOÇÃO: 'gestor' deixa de ter financial.manage, allocations.manage,
--    departments.manage e governance.manage_users.
-- ------------------------------------------------------------------------------
-- financial.manage: sem nenhum consumidor real (has_permission('financial.manage')
--   não é checado por nenhuma RPC hoje) — remoção sem efeito operacional,
--   só correção do catálogo declarado.
-- allocations.manage: responsabilidade agora exclusiva de 'gestor_saldos'
--   (Fase 3A já havia criado essa role para isso, mas nunca revogou a
--   permissão equivalente de 'gestor' — esta migration completa essa
--   separação).
-- departments.manage: internal_departments é usado exclusivamente como
--   dimensão de arp_allocations.unit_name (única FK existente) — nenhuma tela
--   ou RPC de Contratos depende disso; é responsabilidade do domínio de
--   Alocações, não de Contratos.
-- governance.manage_users: gestão de usuários passa a ser exclusiva do
--   Coordenador-Geral. A autorização real (Edge Functions invite-user/
--   manage-user) é corrigida à parte, nesta mesma leva, para consultar esta
--   mesma tabela via has_permission() em vez do hardcode anterior
--   "admin OR gestor".
DELETE FROM public.role_permissions
 WHERE role_id = 'gestor'
   AND permission_key IN ('financial.manage', 'allocations.manage', 'departments.manage', 'governance.manage_users');

-- ------------------------------------------------------------------------------
-- 2. CONCESSÃO: 'gestor_saldos' passa a ter departments.manage.
-- ------------------------------------------------------------------------------
-- Sem escopo adicional em role_domain_scopes — departments nunca teve
-- conceito de escopo (deliberado desde a Fase 2B-3): administrar o catálogo
-- de departamentos afeta o compartilhado inteiro, não é restringível por
-- unidade/ATA.
INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('gestor_saldos', 'departments.manage')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. VERIFICAÇÃO DE INTEGRIDADE PÓS-MIGRATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_gestor_extra INTEGER;
  v_gestor_saldos_missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_gestor_extra
    FROM public.role_permissions
   WHERE role_id = 'gestor'
     AND permission_key IN ('financial.manage', 'allocations.manage', 'departments.manage', 'governance.manage_users');

  IF v_gestor_extra > 0 THEN
    RAISE EXCEPTION 'MIGRATION 33: gestor ainda possui % permissão(ões) que deveriam ter sido removidas.', v_gestor_extra;
  END IF;

  SELECT COUNT(*) INTO v_gestor_saldos_missing
    FROM (VALUES ('allocations.view'), ('allocations.manage'), ('departments.manage')) AS expected(permission_key)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.role_permissions
      WHERE role_id = 'gestor_saldos' AND permission_key = expected.permission_key
   );

  IF v_gestor_saldos_missing > 0 THEN
    RAISE EXCEPTION 'MIGRATION 33: gestor_saldos não possui todas as permissões esperadas (allocations.view, allocations.manage, departments.manage).';
  END IF;
END $$;
