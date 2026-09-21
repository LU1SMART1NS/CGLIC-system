-- ==============================================================================
-- MIGRATION 02: RBAC E POLÍTICAS DE RLS (ROW LEVEL SECURITY) — SALDOARP 3.0
-- Versão: 20260917000002_rbac_and_rls.sql
-- Invariantes: P7 (Segurança por Padrão / Least Privilege)
-- ==============================================================================

-- 1. TABELA DE ROLES DE USUÁRIO (FONTE OFICIAL PROTEGIDA DE RBAC)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'gestor', 'leitor')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_role UNIQUE (user_id, role)
);

-- 2. FUNÇÃO AUXILIAR DE SEGURANÇA (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
      FROM public.user_roles
     WHERE user_id = auth.uid()
       AND (role = required_role OR role = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. HABILITAÇÃO DO RLS EM TODAS AS TABELAS
ALTER TABLE public.atas_registro_preco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_ata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processos_sei ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_allocation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arp_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empenho_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empenho_manual_quantidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empenhos_manuais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_manuais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_empenho_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE LEITURA PÚBLICA (CONSULTA E GOVERNANÇA TRANSPARENTE)
CREATE POLICY "Public Read: atas_registro_preco" ON public.atas_registro_preco FOR SELECT USING (true);
CREATE POLICY "Public Read: itens_ata" ON public.itens_ata FOR SELECT USING (true);
CREATE POLICY "Public Read: internal_departments" ON public.internal_departments FOR SELECT USING (true);
CREATE POLICY "Public Read: processos_sei" ON public.processos_sei FOR SELECT USING (true);
CREATE POLICY "Public Read: item_allocation_state" ON public.item_allocation_state FOR SELECT USING (true);
CREATE POLICY "Public Read: arp_allocations" ON public.arp_allocations FOR SELECT USING (true);
CREATE POLICY "Public Read: empenho_links" ON public.empenho_links FOR SELECT USING (true);
CREATE POLICY "Public Read: empenho_manual_quantidades" ON public.empenho_manual_quantidades FOR SELECT USING (true);
CREATE POLICY "Public Read: empenhos_manuais" ON public.empenhos_manuais FOR SELECT USING (true);
CREATE POLICY "Public Read: contratos_manuais" ON public.contratos_manuais FOR SELECT USING (true);
CREATE POLICY "Public Read: contrato_empenho_links" ON public.contrato_empenho_links FOR SELECT USING (true);

-- Leitura de roles apenas pelo próprio usuário ou admin
CREATE POLICY "Self Read or Admin: user_roles" ON public.user_roles 
  FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));

-- 5. POLÍTICAS DE MUTAÇÃO (RESTRITAS A GESTOR / ADMIN)
CREATE POLICY "Gestor Write: arp_allocations" ON public.arp_allocations
  FOR ALL TO authenticated
  USING (public.has_role('gestor') OR public.has_role('admin'))
  WITH CHECK (public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Gestor Write: item_allocation_state" ON public.item_allocation_state
  FOR ALL TO authenticated
  USING (public.has_role('gestor') OR public.has_role('admin'))
  WITH CHECK (public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Gestor Write: empenho_links" ON public.empenho_links
  FOR ALL TO authenticated
  USING (public.has_role('gestor') OR public.has_role('admin'))
  WITH CHECK (public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Gestor Write: empenho_manual_quantidades" ON public.empenho_manual_quantidades
  FOR ALL TO authenticated
  USING (public.has_role('gestor') OR public.has_role('admin'))
  WITH CHECK (public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Gestor Write: empenhos_manuais" ON public.empenhos_manuais
  FOR ALL TO authenticated
  USING (public.has_role('gestor') OR public.has_role('admin'))
  WITH CHECK (public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Gestor Write: contratos_manuais" ON public.contratos_manuais
  FOR ALL TO authenticated
  USING (public.has_role('gestor') OR public.has_role('admin'))
  WITH CHECK (public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Gestor Write: contrato_empenho_links" ON public.contrato_empenho_links
  FOR ALL TO authenticated
  USING (public.has_role('gestor') OR public.has_role('admin'))
  WITH CHECK (public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Gestor Write: processos_sei" ON public.processos_sei
  FOR ALL TO authenticated
  USING (public.has_role('gestor') OR public.has_role('admin'))
  WITH CHECK (public.has_role('gestor') OR public.has_role('admin'));

CREATE POLICY "Admin Write: internal_departments" ON public.internal_departments
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE POLICY "Admin Write: user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Políticas de Cache (Atas e Itens) permitidas para processos de sincronização
CREATE POLICY "Sync Write: atas_registro_preco" ON public.atas_registro_preco
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Sync Write: itens_ata" ON public.itens_ata
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
