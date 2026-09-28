-- ==============================================================================
-- MIGRATION 39: SCHEMA DE MODELOS DE GESTÃO DE ATAS (TEMPLATES + TAREFAS) — CGLIC-system 3.0
-- Versão: 20260930000039_ata_management_schema.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P6 (Auditabilidade), P7 (Least Privilege)
--
-- Contexto: espelha 1:1 a arquitetura de "Modelos de Gestão de Contratos"
-- (contract_task_templates/contract_task_plans, migration 13) para o domínio
-- de Atas de Registro de Preços. Diferença de identidade: contratos não têm
-- linha própria no banco e por isso usam uma chave DERIVADA (contract_key =
-- {uasg}-{numero}-{ano}, normalize_contract_key). Atas já têm uma chave
-- natural e estável — o próprio número da Ata (numeroAtaRegistroPreco,
-- ex. "00037/2026") — que é exatamente a mesma convenção já adotada por
-- public.ata_managers (migration 38). Por isso ata_task_plans usa `ata_key`
-- (o número da Ata) como chave primária, SEM composição com UASG/ano.
-- ==============================================================================

-- 1. TEMPLATES DE GESTÃO DE ATA (catálogo de configuração, independente de Atas)
CREATE TABLE IF NOT EXISTS public.ata_task_templates (
  id VARCHAR(60) PRIMARY KEY,
  nome VARCHAR(200) NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ata_task_template_macrotasks (
  id VARCHAR(60) PRIMARY KEY,
  template_id VARCHAR(60) NOT NULL REFERENCES public.ata_task_templates(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ata_task_template_tasks (
  id VARCHAR(60) PRIMARY KEY,
  macrotask_id VARCHAR(60) NOT NULL REFERENCES public.ata_task_template_macrotasks(id) ON DELETE CASCADE,
  nome VARCHAR(300) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  execution_mode VARCHAR(20) CHECK (execution_mode IN ('INTERNA', 'EXTERNA', 'AUTOMATICA', 'CONFIRMACAO')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PLANO DE GESTÃO APLICADO A UMA ATA (1 : 1 por Ata)
-- ata_key = numeroAtaRegistroPreco (mesma convenção de ata_managers, migration 38).
-- template_id é apenas rastreabilidade (ON DELETE SET NULL): alterar ou excluir o
-- template NUNCA modifica planos já aplicados, pois macrotarefas/tarefas abaixo
-- são cópias reais (mesmo princípio de contract_task_plans).
CREATE TABLE IF NOT EXISTS public.ata_task_plans (
  id VARCHAR(60) PRIMARY KEY,
  ata_key VARCHAR(50) NOT NULL UNIQUE,
  template_id VARCHAR(60) REFERENCES public.ata_task_templates(id) ON DELETE SET NULL,
  template_nome VARCHAR(200) NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ata_task_macrotasks (
  id VARCHAR(60) PRIMARY KEY,
  plan_id VARCHAR(60) NOT NULL REFERENCES public.ata_task_plans(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.ata_tasks (
  id VARCHAR(60) PRIMARY KEY,
  macrotask_id VARCHAR(60) NOT NULL REFERENCES public.ata_task_macrotasks(id) ON DELETE CASCADE,
  nome VARCHAR(300) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL')),
  execution_mode VARCHAR(20) CHECK (execution_mode IN ('INTERNA', 'EXTERNA', 'AUTOMATICA', 'CONFIRMACAO')),
  responsavel_nome VARCHAR(150),
  responsavel_user_id UUID REFERENCES auth.users(id),
  prazo DATE,
  observacao TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  concluido_por VARCHAR(150)
);

-- 3. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_att_macrotasks_template_id ON public.ata_task_template_macrotasks (template_id);
CREATE INDEX IF NOT EXISTS idx_att_tasks_macrotask_id ON public.ata_task_template_tasks (macrotask_id);
CREATE INDEX IF NOT EXISTS idx_ata_task_plans_template_id ON public.ata_task_plans (template_id);
CREATE INDEX IF NOT EXISTS idx_ata_task_macrotasks_plan_id ON public.ata_task_macrotasks (plan_id);
CREATE INDEX IF NOT EXISTS idx_ata_tasks_macrotask_id ON public.ata_tasks (macrotask_id);
CREATE INDEX IF NOT EXISTS idx_ata_tasks_status ON public.ata_tasks (status);
CREATE INDEX IF NOT EXISTS idx_ata_tasks_responsavel_user_id ON public.ata_tasks (responsavel_user_id);

-- 4. RLS — leitura pública, escrita exclusivamente via RPC SECURITY DEFINER (sem policies de mutação)
ALTER TABLE public.ata_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_task_template_macrotasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_task_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_task_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_task_macrotasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: ata_task_templates" ON public.ata_task_templates FOR SELECT USING (true);
CREATE POLICY "Public Read: ata_task_template_macrotasks" ON public.ata_task_template_macrotasks FOR SELECT USING (true);
CREATE POLICY "Public Read: ata_task_template_tasks" ON public.ata_task_template_tasks FOR SELECT USING (true);
CREATE POLICY "Public Read: ata_task_plans" ON public.ata_task_plans FOR SELECT USING (true);
CREATE POLICY "Public Read: ata_task_macrotasks" ON public.ata_task_macrotasks FOR SELECT USING (true);
CREATE POLICY "Public Read: ata_tasks" ON public.ata_tasks FOR SELECT USING (true);

-- 5. AUDITORIA — reaproveita o trigger genérico já existente (trg_audit_log_capture)
DROP TRIGGER IF EXISTS trg_audit_ata_task_templates ON public.ata_task_templates;
CREATE TRIGGER trg_audit_ata_task_templates
AFTER INSERT OR UPDATE OR DELETE ON public.ata_task_templates
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_ata_tasks ON public.ata_tasks;
CREATE TRIGGER trg_audit_ata_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.ata_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
