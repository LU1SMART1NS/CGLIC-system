-- ==============================================================================
-- MIGRATION 03: TRILHA DE AUDITORIA E EVENT LOGGING — SALDOARP 3.0
-- Versão: 20260917000003_audit_triggers.sql
-- Invariantes: P6 (Auditabilidade Completa)
-- ==============================================================================

-- 1. TABELA DE LOGS DE AUDITORIA
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- 2. HABILITAR RLS NA TABELA DE AUDITORIA
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Leitura de auditoria restrita exclusivamente a administradores
CREATE POLICY "Admin Only Read: audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role('admin'));

-- Nenhuma mutação manual permitida (apenas via trigger com SECURITY DEFINER)
-- Não há políticas de INSERT/UPDATE/DELETE para clientes.

-- 3. FUNÇÃO TRIGGER DE CAPTURA AUTOMÁTICA DE AUDITORIA (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.trg_audit_log_capture()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_id VARCHAR(100);
  v_old_json JSONB;
  v_new_json JSONB;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_old_json := to_jsonb(OLD);
    v_entity_id := COALESCE(v_old_json->>'id', v_old_json->>'item_key', 'UNKNOWN');
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      old_data,
      new_data,
      user_id
    ) VALUES (
      TG_TABLE_NAME,
      v_entity_id,
      'DELETE',
      v_old_json,
      NULL,
      auth.uid()
    );
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    v_entity_id := COALESCE(v_new_json->>'id', v_new_json->>'item_key', 'UNKNOWN');
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      old_data,
      new_data,
      user_id
    ) VALUES (
      TG_TABLE_NAME,
      v_entity_id,
      'UPDATE',
      v_old_json,
      v_new_json,
      auth.uid()
    );
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    v_new_json := to_jsonb(NEW);
    v_entity_id := COALESCE(v_new_json->>'id', v_new_json->>'item_key', 'UNKNOWN');
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      old_data,
      new_data,
      user_id
    ) VALUES (
      TG_TABLE_NAME,
      v_entity_id,
      'INSERT',
      NULL,
      v_new_json,
      auth.uid()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. VINCULAÇÃO DOS TRIGGERS ÀS TABELAS MUTÁVEIS DE GOVERNANÇA
DROP TRIGGER IF EXISTS trg_audit_arp_allocations ON public.arp_allocations;
CREATE TRIGGER trg_audit_arp_allocations
AFTER INSERT OR UPDATE OR DELETE ON public.arp_allocations
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_empenhos_manuais ON public.empenhos_manuais;
CREATE TRIGGER trg_audit_empenhos_manuais
AFTER INSERT OR UPDATE OR DELETE ON public.empenhos_manuais
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_contratos_manuais ON public.contratos_manuais;
CREATE TRIGGER trg_audit_contratos_manuais
AFTER INSERT OR UPDATE OR DELETE ON public.contratos_manuais
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_processos_sei ON public.processos_sei;
CREATE TRIGGER trg_audit_processos_sei
AFTER INSERT OR UPDATE OR DELETE ON public.processos_sei
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_internal_departments ON public.internal_departments;
CREATE TRIGGER trg_audit_internal_departments
AFTER INSERT OR UPDATE OR DELETE ON public.internal_departments
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
