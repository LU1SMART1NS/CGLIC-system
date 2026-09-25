-- ==============================================================================
-- MIGRATION 23: FASE 1 — FUNDAÇÃO DE DADOS DO NOVO RBAC POR DOMÍNIO
-- ==============================================================================
-- Esta migration cria SOMENTE a infraestrutura de dados do novo modelo
-- (roles / permissions / role_permissions / role_domain_scopes /
-- user_scope_assignments) e faz o backfill de user_roles.role_id.
--
-- NÃO altera nenhuma regra de autorização real:
--   - has_role() permanece exatamente como está, lendo user_roles.role.
--   - Nenhuma RPC de negócio é alterada ou passa a consultar estas tabelas.
--   - has_permission()/has_scope() NÃO são criadas aqui (Fase 2).
--   - O split gestor_contratos/gestor_saldos NÃO ocorre aqui (Fase 3).
--
-- O backfill de role_permissions/role_domain_scopes reflete o comportamento
-- EFETIVO já existente no código (auditado nas RPCs e edge functions), não
-- uma matriz desejada — ver relatório da Fase 1 para o detalhamento e para
-- os pontos de ambiguidade sinalizados (governance.manage_roles sem operação
-- real hoje, e a distinção fina "quem pode atribuir o papel admin" dentro de
-- manage-user/invite-user, que este modelo ainda não representa).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CATÁLOGO DE ROLES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.roles (id, label, is_system) VALUES
  ('admin',  'Administrador', TRUE),
  ('gestor', 'Gestor',        TRUE),
  ('leitor', 'Leitor',        TRUE)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. CATÁLOGO DE PERMISSÕES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  key VARCHAR(80) PRIMARY KEY CHECK (key ~ '^[a-z_]+\.[a-z_]+$'),
  domain VARCHAR(30) NOT NULL CHECK (domain IN ('contracts', 'financial', 'allocations', 'departments', 'governance', 'reports')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Somente permissões com operação real identificável no código atual
-- (RPCs, edge functions ou políticas de RLS existentes).
INSERT INTO public.permissions (key, domain) VALUES
  ('contracts.view',         'contracts'),
  ('contracts.assign',       'contracts'),
  ('contracts.manage',       'contracts'),
  ('contracts.manage_tasks', 'contracts'),
  ('financial.manage',       'financial'),
  ('allocations.view',       'allocations'),
  ('allocations.manage',     'allocations'),
  ('departments.view',       'departments'),
  ('departments.manage',     'departments'),
  ('governance.manage_users','governance'),
  ('governance.manage_roles','governance'), -- catalogada para uso futuro; SEM operação de backend hoje (ver relatório) — por isso não é atribuída a nenhuma role no backfill abaixo.
  ('reports.export',         'reports')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. ROLE_PERMISSIONS (backfill do comportamento atual)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id VARCHAR(50) NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_key VARCHAR(80) NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_key ON public.role_permissions(permission_key);

-- admin e gestor: hoje IDÊNTICOS em todas as RPCs de escrita auditadas —
-- toda RPC de contrato/financeiro/alocação/departamento usa
-- has_role('gestor') OR has_role('admin'), sem distinção entre os dois.
-- governance.manage_users: ambos podem chamar manage-user/invite-user
-- (isCallerAdmin OR isCallerGestor) — a única distinção real hoje é que
-- somente admin pode ATRIBUIR o papel admin a outro usuário, uma regra fina
-- que este modelo de permissão booleana ainda não representa (sinalizado).
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.role_id, r.permission_key FROM (VALUES
  ('admin', 'contracts.view'),
  ('admin', 'contracts.assign'),
  ('admin', 'contracts.manage'),
  ('admin', 'contracts.manage_tasks'),
  ('admin', 'financial.manage'),
  ('admin', 'allocations.view'),
  ('admin', 'allocations.manage'),
  ('admin', 'departments.view'),
  ('admin', 'departments.manage'),
  ('admin', 'governance.manage_users'),
  ('admin', 'reports.export'),

  ('gestor', 'contracts.view'),
  ('gestor', 'contracts.assign'),
  ('gestor', 'contracts.manage'),
  ('gestor', 'contracts.manage_tasks'),
  ('gestor', 'financial.manage'),
  ('gestor', 'allocations.view'),
  ('gestor', 'allocations.manage'),
  ('gestor', 'departments.view'),
  ('gestor', 'departments.manage'),
  ('gestor', 'governance.manage_users'),
  ('gestor', 'reports.export'),

  -- leitor: somente leitura/exportação — nenhuma RPC de escrita audita
  -- has_role('leitor'); leitura (RLS "Public Read") e exportação
  -- (sem gate algum hoje) estão abertas a qualquer usuário autenticado,
  -- incluindo leitor.
  ('leitor', 'contracts.view'),
  ('leitor', 'allocations.view'),
  ('leitor', 'departments.view'),
  ('leitor', 'reports.export')
) AS r(role_id, permission_key)
JOIN public.permissions p ON p.key = r.permission_key
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. ROLE_DOMAIN_SCOPES (backfill do comportamento atual)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_domain_scopes (
  role_id VARCHAR(50) NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  domain VARCHAR(30) NOT NULL,
  scope_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role_id, domain),
  CONSTRAINT chk_role_domain_scope_valid CHECK (
    (domain = 'contracts'   AND scope_type IN ('GLOBAL', 'ASSIGNED', 'UNIT')) OR
    (domain = 'allocations' AND scope_type IN ('GLOBAL', 'UNIT', 'ARP'))
  )
);

-- contracts: espelha exatamente o contractScope já definido em
-- src/types/user.ts (SYSTEM_ROLES) — coordenador/admin=GLOBAL,
-- gestor=ASSIGNED, consulta/leitor=GLOBAL (leitura ampla, sem poder de escrita).
-- allocations: hoje NÃO existe nenhum enforcement de escopo — qualquer
-- gestor/admin pode alocar saldo para qualquer unidade/ata. O valor GLOBAL
-- aqui documenta esse comportamento atual (irrestrito), não uma decisão
-- nova. leitor não recebe linha em 'allocations' por não ter
-- allocations.manage.
INSERT INTO public.role_domain_scopes (role_id, domain, scope_type) VALUES
  ('admin',  'contracts',   'GLOBAL'),
  ('gestor', 'contracts',   'ASSIGNED'),
  ('leitor', 'contracts',   'GLOBAL'),
  ('admin',  'allocations', 'GLOBAL'),
  ('gestor', 'allocations', 'GLOBAL')
ON CONFLICT (role_id, domain) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. USER_SCOPE_ASSIGNMENTS (tabela genérica, vazia nesta fase)
-- ------------------------------------------------------------------------------
-- Única tabela de atribuição fina por usuário, reaproveitável por qualquer
-- domínio (evita allocation_scope/contract_scope/unit_scope separadas).
-- Fica vazia nesta fase: não existe hoje nenhuma relação usuário↔unidade ou
-- usuário↔ata no schema para migrar, e a identidade contract_managers.gestor_nome
-- vs. auth.users.id é um problema da fase de enforcement de contratos —
-- não é resolvido aqui (conforme instrução explícita desta fase).
CREATE TABLE IF NOT EXISTS public.user_scope_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain VARCHAR(30) NOT NULL,
  scope_type VARCHAR(20) NOT NULL,
  scope_value VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, domain, scope_type, scope_value),
  CONSTRAINT chk_user_scope_assignment_valid CHECK (
    (domain = 'contracts'   AND scope_type IN ('GLOBAL', 'ASSIGNED', 'UNIT')) OR
    (domain = 'allocations' AND scope_type IN ('GLOBAL', 'UNIT', 'ARP'))
  )
);
-- PK (user_id, domain, scope_type, scope_value) já serve como índice para
-- buscas por user_id, (user_id, domain) e (user_id, domain, scope_type) —
-- nenhum índice adicional é necessário.

-- ------------------------------------------------------------------------------
-- 6. BACKFILL SEGURO DE user_roles.role_id (sem remover a coluna legada `role`)
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role_id VARCHAR(50);

UPDATE public.user_roles SET role_id = role WHERE role_id IS NULL;

-- Guarda de integridade: aborta a migration inteira (ROLLBACK automático)
-- se qualquer linha não puder ser correspondida a uma role válida. Não pode
-- existir usuário/role órfão antes de a FK ser estabelecida.
DO $$
DECLARE
  v_orphans INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphans
    FROM public.user_roles ur
    LEFT JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.role_id IS NULL OR r.id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'FASE 1: % linha(s) de user_roles não têm correspondência válida em roles — abortando antes de criar a FK.', v_orphans;
  END IF;
END $$;

ALTER TABLE public.user_roles ALTER COLUMN role_id SET NOT NULL;

ALTER TABLE public.user_roles
  ADD CONSTRAINT fk_user_roles_role_id FOREIGN KEY (role_id) REFERENCES public.roles(id);

-- Índice para buscas "quais usuários têm a role X" (não coberto pelo
-- UNIQUE(user_id, role) existente, cujo prefixo é user_id).
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);

-- ------------------------------------------------------------------------------
-- 6b. TRIGGER DE COMPATIBILIDADE TEMPORÁRIA — NÃO é parte do modelo RBAC definitivo
-- ------------------------------------------------------------------------------
-- Papel de cada coluna a partir desta migration:
--   user_roles.role     -> valor LEGADO, mantido apenas para compatibilidade
--                          com o código já em produção (manage-user/invite-user),
--                          que hoje só escreve (user_id, role).
--   user_roles.role_id  -> referência CANÔNICA do novo modelo RBAC (FK para
--                          public.roles.id). É esta coluna que fases futuras
--                          (has_permission()/has_scope()) devem consultar.
--
-- Sem este trigger, agora que role_id é NOT NULL, todo INSERT legado
-- (user_id, role) feito por manage-user/invite-user passaria a falhar com
-- "null value in column role_id violates not-null constraint" — quebrando
-- código de autorização já em produção, o que a Fase 1 proíbe.
--
-- O trigger só age quando role_id não foi informado explicitamente
-- (NEW.role_id IS NULL), copiando o valor de role. Se role_id vier
-- explícito (novo código, ou uma fase futura de split de roles gravando
-- role_id independente de role), o trigger não o altera — permitindo que
-- role e role_id divirjam deliberadamente mais adiante.
--
-- O trigger NÃO valida nem corrige dados: uma role ou role_id inexistente
-- continua falhando pelo CHECK de `role` e pela FK de `role_id` já
-- existentes. Não há fallback para 'gestor' nem para qualquer outro valor —
-- ausência de correspondência válida é erro, nunca um valor padrão.
CREATE OR REPLACE FUNCTION public.fn_user_roles_default_role_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role_id IS NULL THEN
    NEW.role_id := NEW.role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_roles_default_role_id
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_user_roles_default_role_id();

-- ------------------------------------------------------------------------------
-- 7. RLS DAS NOVAS TABELAS — leitura ampla (catálogo não sensível), ESCRITA
--    BLOQUEADA para qualquer cliente via PostgREST (RLS ativo sem nenhuma
--    policy de escrita = nega tudo). A administração destas tabelas, quando
--    existir, será feita por RPC SECURITY DEFINER em fase futura — nenhuma
--    camada administrativa é criada aqui.
-- ------------------------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_domain_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_scope_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: roles" ON public.roles FOR SELECT USING (true);
CREATE POLICY "Public Read: permissions" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "Public Read: role_permissions" ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY "Public Read: role_domain_scopes" ON public.role_domain_scopes FOR SELECT USING (true);

-- user_scope_assignments pode conter vínculos por usuário (ex.: unidade/ata
-- autorizada) — mesmo padrão de sensibilidade já usado para user_roles.
CREATE POLICY "Self Read or Admin: user_scope_assignments" ON public.user_scope_assignments
  FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));
