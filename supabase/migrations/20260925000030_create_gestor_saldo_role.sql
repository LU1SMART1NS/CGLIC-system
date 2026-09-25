-- ==============================================================================
-- MIGRATION 30: FASE 3A — FORMALIZAÇÃO DO PERFIL "GESTOR DE SALDO"
-- ==============================================================================
-- Escopo: SOMENTE (1) relaxar a PK de role_domain_scopes para permitir uma
-- role compatível com múltiplos scope_type no mesmo domínio, e (2) criar a
-- role 'gestor_saldos' com allocations.view + allocations.manage e
-- compatibilidade com escopo UNIT e ARP.
--
-- NÃO altera: has_permission(), has_scope(), RPCs já migradas (2B-1 a 2B-6),
-- RLS, admin/gestor/leitor, internal_departments, merge_internal_department_allocations_atomic.
-- NÃO cria vínculo usuário -> departamento, nem scope DEPARTMENT, nem tabela nova.
--
-- ------------------------------------------------------------------------------
-- 1. CORREÇÃO DE MODELO: role_domain_scopes precisa suportar mais de um
--    scope_type por (role_id, domain).
-- ------------------------------------------------------------------------------
-- Motivo (auditoria Fase 3A): a PK (role_id, domain) só permitia UM
-- scope_type por role+domínio — suficiente para admin/gestor/leitor (cada um
-- fixado a um único comportamento na Fase 1), mas insuficiente para uma role
-- que precisa ser compatível com UNIT para um usuário e ARP para outro. Esta
-- alteração não muda nenhum dado existente (cada role legada continua com
-- exatamente uma linha) nem a lógica de has_scope() (que já filtra por
-- scope_type explicitamente, nunca dependeu da PK).
ALTER TABLE public.role_domain_scopes DROP CONSTRAINT role_domain_scopes_pkey;
ALTER TABLE public.role_domain_scopes ADD CONSTRAINT role_domain_scopes_pkey PRIMARY KEY (role_id, domain, scope_type);

-- ------------------------------------------------------------------------------
-- 2. ROLE: gestor_saldos
-- ------------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES
  ('gestor_saldos', 'Gestor de Saldo', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Somente as duas permissões do domínio de Saldos — nada de contracts.*,
-- financial.manage, departments.manage, governance.*, reports.export.
INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('gestor_saldos', 'allocations.view'),
  ('gestor_saldos', 'allocations.manage')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- Compatível com UNIT e ARP (escopo real definido depois, por usuário, via
-- user_scope_assignments). Sem GLOBAL por padrão — ver nota na entrega desta
-- fase: um Gestor de Saldo verdadeiramente global é uma decisão em aberto,
-- não implementada aqui, para não tornar a role global para todo mundo.
INSERT INTO public.role_domain_scopes (role_id, domain, scope_type) VALUES
  ('gestor_saldos', 'allocations', 'UNIT'),
  ('gestor_saldos', 'allocations', 'ARP')
ON CONFLICT (role_id, domain, scope_type) DO NOTHING;
