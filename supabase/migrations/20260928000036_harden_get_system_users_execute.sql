-- ==============================================================================
-- MIGRATION 36: FASE 3B — ENDURECIMENTO DE GRANTS DE get_system_users()
-- ==============================================================================
-- Segunda camada de defesa, complementar à correção de has_role() (Fase 3B,
-- auditoria de incidente remoto): get_system_users() sempre dependeu só do
-- gate interno has_role('gestor' OR 'admin') para negar acesso — nenhuma
-- migration anterior jamais restringiu EXECUTE para PUBLIC/anon, então o
-- default do Postgres (EXECUTE liberado) sempre esteve em vigor.
--
-- Esta migration não muda nenhuma regra de autorização: a função continua
-- decidindo tudo sozinha via has_role(). Só remove a possibilidade de que um
-- has_role() futuro venha a ter uma regressão (como a que foi observada e
-- corrigida no ambiente remoto) e vaze dados por ausência de uma segunda
-- camada de defesa em profundidade.
-- ==============================================================================

REVOKE ALL ON FUNCTION public.get_system_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_users() TO authenticated;
