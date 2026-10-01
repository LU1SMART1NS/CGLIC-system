-- ==============================================================================
-- MIGRATION 48: SUGESTÕES DE CONTRATO DESCARTADAS POR ITEM DA ARP
-- Versão: 20261002000048_arp_item_contract_dismissals.sql
--
-- A sugestão de contrato para um item é calculada em memória (PNCP/Compras.gov).
-- Esta tabela guarda apenas o DESCARTE manual ("este contrato não pertence a
-- este item"), para que a sugestão não volte a aparecer. Não é vínculo: o
-- vínculo confirmado continua em arp_item_contract_links.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.arp_item_contract_dismissals (
  item_key VARCHAR(100) NOT NULL,
  contract_key VARCHAR(100) NOT NULL,
  dismissed_by UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_key, contract_key)
);

CREATE INDEX IF NOT EXISTS idx_arp_item_contract_dismissals_item_key
  ON public.arp_item_contract_dismissals(item_key);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_arp_item_contract_dismissals ON public.arp_item_contract_dismissals;
    CREATE TRIGGER trg_audit_arp_item_contract_dismissals
      AFTER INSERT OR UPDATE OR DELETE ON public.arp_item_contract_dismissals
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

ALTER TABLE public.arp_item_contract_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de descartes para autenticados"
  ON public.arp_item_contract_dismissals FOR SELECT TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.arp_item_contract_dismissals FROM authenticated, anon;

-- ------------------------------------------------------------------------------
-- dismiss_contract_suggestion_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dismiss_contract_suggestion_atomic(
  p_item_key VARCHAR,
  p_contract_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := TRIM(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave canônica do contrato não pode ser vazia.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.arp_item_contract_dismissals (item_key, contract_key)
  VALUES (v_item_key, v_contract_key)
  ON CONFLICT (item_key, contract_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'timestamp', NOW()
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- restore_contract_suggestion_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_contract_suggestion_atomic(
  p_item_key VARCHAR,
  p_contract_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := TRIM(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item_key = '' OR v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Chave do item e do contrato são obrigatórias.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.arp_item_contract_dismissals
   WHERE item_key = v_item_key AND contract_key = v_contract_key;

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_contract_suggestion_atomic(VARCHAR, VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_contract_suggestion_atomic(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_contract_suggestion_atomic(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_contract_suggestion_atomic(VARCHAR, VARCHAR) TO authenticated;
