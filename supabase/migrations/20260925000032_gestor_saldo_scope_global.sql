-- ==============================================================================
-- MIGRATION 32: FASE 3A (CORREÇÃO) — GESTOR DE SALDO É GLOBAL NO DOMÍNIO
-- allocations
-- ==============================================================================
-- Correção de regra de negócio sobre a migration 30: o Gestor de Saldo
-- administra as alocações internas de TODAS as ATAs — não é um gestor de
-- uma unidade ou de uma ATA específica, e não está vinculado a departamento.
-- Portanto o escopo correto da role gestor_saldos é GLOBAL no domínio
-- allocations, não UNIT/ARP.
--
-- "GLOBAL" aqui significa exclusivamente acesso global ao domínio
-- allocations — a role continua com SOMENTE allocations.view e
-- allocations.manage (inalterado desde a migration 30); não concede
-- contracts.*, financial.manage, departments.*, governance.* nem
-- reports.export. A semântica de has_scope() já validada nas Fases 2A/2B
-- concede acesso global sem exigir nenhuma linha em
-- user_scope_assignments — nenhuma exceção nova foi criada em has_scope()
-- nem em código de aplicação para isso.
--
-- Escopo estrito: SOMENTE os role_domain_scopes de gestor_saldos. Não altera
-- role_permissions (já corretas), não altera admin/gestor/leitor, não
-- desfaz a capacidade estrutural da Fase 3A de uma role suportar múltiplos
-- scope_type por domínio (continua válida para outras roles/domínios
-- futuros) — só remove as duas linhas que não fazem mais sentido para esta
-- role específica.
-- ==============================================================================

DELETE FROM public.role_domain_scopes
 WHERE role_id = 'gestor_saldos' AND domain = 'allocations' AND scope_type IN ('UNIT', 'ARP');

INSERT INTO public.role_domain_scopes (role_id, domain, scope_type)
VALUES ('gestor_saldos', 'allocations', 'GLOBAL')
ON CONFLICT (role_id, domain, scope_type) DO NOTHING;
