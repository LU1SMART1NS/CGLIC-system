-- ==============================================================================
-- MIGRATION 15: VÍNCULO ITEM DA ARP ↔ CONTRATO OFICIAL — SALDOARP 3.0
-- Versão: 20260924000015_arp_item_contract_links.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P6 (Auditabilidade), P7 (Least Privilege)
-- ==============================================================================

-- 1. TABELA DE VÍNCULOS ENTRE ITENS DE ARP E CONTRATOS OFICIAIS
-- Não armazena dados redundantes de contrato (número, fornecedor, valor, etc.).
-- Todos os dados oficiais derivam do catálogo oficial via contract_key.
CREATE TABLE IF NOT EXISTS public.arp_item_contract_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key VARCHAR(100) NOT NULL,
  contract_key VARCHAR(100) NOT NULL,
  quantidade_contratada NUMERIC(18, 4) NOT NULL CHECK (quantidade_contratada > 0),
  observacoes TEXT,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_arp_item_contract_link UNIQUE (item_key, contract_key)
);

CREATE INDEX IF NOT EXISTS idx_arp_item_contract_links_item_key 
  ON public.arp_item_contract_links(item_key);

CREATE INDEX IF NOT EXISTS idx_arp_item_contract_links_contract_key 
  ON public.arp_item_contract_links(contract_key);

-- 2. TRILHA DE AUDITORIA
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture'
  ) THEN
    DROP TRIGGER IF EXISTS trg_audit_arp_item_contract_links ON public.arp_item_contract_links;
    CREATE TRIGGER trg_audit_arp_item_contract_links
      AFTER INSERT OR UPDATE OR DELETE ON public.arp_item_contract_links
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- 3. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.arp_item_contract_links ENABLE ROW LEVEL SECURITY;

-- Leitura pública para autenticados e anon (dados oficiais transparentes de compras)
CREATE POLICY "Permitir leitura de vinculos para autenticados"
  ON public.arp_item_contract_links FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Permitir leitura anon de vinculos"
  ON public.arp_item_contract_links FOR SELECT TO anon
  USING (true);

-- Escrita direta revogada na tabela: toda mutação deve ser feita via RPCs com verificação de papéis (P7)
REVOKE INSERT, UPDATE, DELETE ON public.arp_item_contract_links FROM authenticated, anon;

-- ==============================================================================
-- 4. FUNÇÃO RPC: link_contract_to_item_atomic
-- ==============================================================================
-- Vincula um contrato oficial a um item da ARP de forma atômica e segura.
-- FASE 6.2-C: Escopo cirúrgico estrito (Item -> Contrato Oficial).
-- Associação de empenhos de lastro reservada para a Fase 7.
CREATE OR REPLACE FUNCTION public.link_contract_to_item_atomic(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_quantidade_contratada NUMERIC,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_link_id UUID;
  v_item_key VARCHAR(100);
  v_contract_key VARCHAR(100);
BEGIN
  -- 1. Verificação de Autorização (RBAC)
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validação dos Parâmetros
  v_item_key := TRIM(COALESCE(p_item_key, ''));
  v_contract_key := TRIM(COALESCE(p_contract_key, ''));

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave canônica do contrato não pode ser vazia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidade_contratada IS NULL OR p_quantidade_contratada <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade contratada deve ser estritamente maior que zero.'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Upsert Atômico do Vínculo
  INSERT INTO public.arp_item_contract_links (
    item_key,
    contract_key,
    quantidade_contratada,
    observacoes,
    criado_por,
    created_at,
    updated_at
  ) VALUES (
    v_item_key,
    v_contract_key,
    p_quantidade_contratada,
    NULLIF(TRIM(COALESCE(p_observacoes, '')), ''),
    auth.uid(),
    NOW(),
    NOW()
  )
  ON CONFLICT (item_key, contract_key) DO UPDATE SET
    quantidade_contratada = EXCLUDED.quantidade_contratada,
    observacoes = EXCLUDED.observacoes,
    updated_at = NOW()
  RETURNING id INTO v_link_id;

  -- 4. Retorno Canônico Estruturado
  RETURN jsonb_build_object(
    'success', true,
    'id', v_link_id,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'quantidade_contratada', p_quantidade_contratada,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.link_contract_to_item_atomic(VARCHAR, VARCHAR, NUMERIC, TEXT) TO authenticated;

-- ==============================================================================
-- 5. FUNÇÃO RPC: unlink_contract_from_item_atomic
-- ==============================================================================
-- Remove um vínculo de contrato oficial de um item da ARP de forma atômica.
CREATE OR REPLACE FUNCTION public.unlink_contract_from_item_atomic(
  p_link_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- 1. Verificação de Autorização (RBAC)
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF p_link_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ID: Identificador do vínculo não pode ser nulo.'
      USING ERRCODE = '22023';
  END IF;

  -- 2. Exclusão do vínculo
  DELETE FROM public.arp_item_contract_links
   WHERE id = p_link_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'NOT_FOUND: Vínculo com ID "%" não encontrado.', p_link_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', p_link_id,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.unlink_contract_from_item_atomic(UUID) TO authenticated;
