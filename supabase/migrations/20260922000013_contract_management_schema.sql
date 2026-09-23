-- ==============================================================================
-- MIGRATION 13: SCHEMA DE GESTÃO DE CONTRATOS (GESTOR + TEMPLATES + TAREFAS) — SALDOARP 3.0
-- Versão: 20260922000013_contract_management_schema.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P6 (Auditabilidade), P7 (Least Privilege)
--
-- Contexto: os "contratos" exibidos na Visão por Contratos (ContractDashboardRecord) não
-- possuem linha própria no banco — são montados em tempo real a partir de Compras.gov.br
-- e Contratos.gov.br. Por isso as tabelas abaixo ancoram-se em uma chave estável derivada
-- (contract_key = {uasg}-{numero}-{ano}), no mesmo espírito de item_key já usado em
-- arp_allocations/empenhos_manuais.
--
-- Gestor e responsável de tarefa são campos de TEXTO LIVRE (não FK para auth.users):
-- o frontend não possui nenhum fluxo de autenticação hoje, então não há como resolver
-- "usuário logado". Esta é a mesma convenção já usada em processos_sei.responsavel_nome.
-- ==============================================================================

-- 1. GESTOR DO CONTRATO (1 : 1 por contrato)
CREATE TABLE IF NOT EXISTS public.contract_managers (
  contract_key VARCHAR(100) PRIMARY KEY,
  uasg VARCHAR(10) NOT NULL,
  numero VARCHAR(50) NOT NULL,
  ano INTEGER NOT NULL CHECK (ano >= 2000 AND ano <= 2100),
  gestor_nome VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TEMPLATES DE GESTÃO CONTRATUAL (catálogo de configuração, independente de contratos)
CREATE TABLE IF NOT EXISTS public.contract_task_templates (
  id VARCHAR(60) PRIMARY KEY,
  nome VARCHAR(200) NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contract_task_template_macrotasks (
  id VARCHAR(60) PRIMARY KEY,
  template_id VARCHAR(60) NOT NULL REFERENCES public.contract_task_templates(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contract_task_template_tasks (
  id VARCHAR(60) PRIMARY KEY,
  macrotask_id VARCHAR(60) NOT NULL REFERENCES public.contract_task_template_macrotasks(id) ON DELETE CASCADE,
  nome VARCHAR(300) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PLANO DE GESTÃO APLICADO A UM CONTRATO (1 : 1 por contrato)
-- template_id é apenas rastreabilidade (ON DELETE SET NULL): alterar ou excluir o template
-- NUNCA modifica planos já aplicados, pois macrotarefas/tarefas abaixo são cópias reais.
CREATE TABLE IF NOT EXISTS public.contract_task_plans (
  id VARCHAR(60) PRIMARY KEY,
  contract_key VARCHAR(100) NOT NULL UNIQUE,
  uasg VARCHAR(10) NOT NULL,
  numero VARCHAR(50) NOT NULL,
  ano INTEGER NOT NULL CHECK (ano >= 2000 AND ano <= 2100),
  template_id VARCHAR(60) REFERENCES public.contract_task_templates(id) ON DELETE SET NULL,
  template_nome VARCHAR(200) NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contract_task_macrotasks (
  id VARCHAR(60) PRIMARY KEY,
  plan_id VARCHAR(60) NOT NULL REFERENCES public.contract_task_plans(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.contract_tasks (
  id VARCHAR(60) PRIMARY KEY,
  macrotask_id VARCHAR(60) NOT NULL REFERENCES public.contract_task_macrotasks(id) ON DELETE CASCADE,
  nome VARCHAR(300) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL')),
  responsavel_nome VARCHAR(150),
  prazo DATE,
  observacao TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  concluido_por VARCHAR(150)
);

-- 4. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_ctt_macrotasks_template_id ON public.contract_task_template_macrotasks (template_id);
CREATE INDEX IF NOT EXISTS idx_ctt_tasks_macrotask_id ON public.contract_task_template_tasks (macrotask_id);
CREATE INDEX IF NOT EXISTS idx_contract_task_plans_template_id ON public.contract_task_plans (template_id);
CREATE INDEX IF NOT EXISTS idx_contract_task_macrotasks_plan_id ON public.contract_task_macrotasks (plan_id);
CREATE INDEX IF NOT EXISTS idx_contract_tasks_macrotask_id ON public.contract_tasks (macrotask_id);
CREATE INDEX IF NOT EXISTS idx_contract_tasks_status ON public.contract_tasks (status);

-- 5. RLS — leitura pública, escrita exclusivamente via RPC SECURITY DEFINER (sem policies de mutação)
ALTER TABLE public.contract_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_task_template_macrotasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_task_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_task_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_task_macrotasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: contract_managers" ON public.contract_managers FOR SELECT USING (true);
CREATE POLICY "Public Read: contract_task_templates" ON public.contract_task_templates FOR SELECT USING (true);
CREATE POLICY "Public Read: contract_task_template_macrotasks" ON public.contract_task_template_macrotasks FOR SELECT USING (true);
CREATE POLICY "Public Read: contract_task_template_tasks" ON public.contract_task_template_tasks FOR SELECT USING (true);
CREATE POLICY "Public Read: contract_task_plans" ON public.contract_task_plans FOR SELECT USING (true);
CREATE POLICY "Public Read: contract_task_macrotasks" ON public.contract_task_macrotasks FOR SELECT USING (true);
CREATE POLICY "Public Read: contract_tasks" ON public.contract_tasks FOR SELECT USING (true);

-- 6. AUDITORIA — reaproveita o trigger genérico já existente (trg_audit_log_capture)
DROP TRIGGER IF EXISTS trg_audit_contract_managers ON public.contract_managers;
CREATE TRIGGER trg_audit_contract_managers
AFTER INSERT OR UPDATE OR DELETE ON public.contract_managers
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_contract_task_templates ON public.contract_task_templates;
CREATE TRIGGER trg_audit_contract_task_templates
AFTER INSERT OR UPDATE OR DELETE ON public.contract_task_templates
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_contract_tasks ON public.contract_tasks;
CREATE TRIGGER trg_audit_contract_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.contract_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
