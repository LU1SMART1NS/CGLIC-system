-- ==============================================================================
-- MIGRATION 71: DESCARTE "ESTA ATA NÃO É A DESTE CONTRATO" (contract_ata_descartes)
-- Versão: 20261005000071_descarte_ata_do_contrato.sql
--
-- Contexto: a aba "A vincular" da Central de Distribuição sugere a ata de cada contrato
-- (mesma compra e mesmo fornecedor). Como o "Descartar" da tela de sugestões do item
-- (arp_item_contract_dismissals), o coordenador pode dizer que AQUELA ata não é a do
-- contrato, sem afetar as demais atas. Se sobrar outra ata provável, o contrato segue
-- em "A vincular" com ela; se não sobrar, vai para "Contratos sem ata" (decisão).
-- Não confundir com contract_sem_ata_confirmacoes ("o contrato não vem de ata nenhuma").
--
-- - Uma linha por par contrato + ata. Chave da ata = "NÚMERO-UASG" (ex.: "00059/2025-200331"),
--   a mesma que ata_uasg_from_item_key devolve para a chave do item.
-- - Escrita só pelas RPCs, só para admin (coordenador). Leitura para logados.
-- - Descartar é recusado se o contrato já está vinculado a essa ata; vincular o contrato
--   a essa ata depois apaga o descarte.
-- - Auditoria pelo gatilho padrão.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.contract_ata_descartes (
  contract_key VARCHAR(100) NOT NULL,
  ata_key VARCHAR(60) NOT NULL,
  -- ON DELETE SET NULL: excluir o usuário não é bloqueado (mesma regra da migration 67); o nome fica.
  descartado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  descartado_por_nome VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contract_key, ata_key)
);

ALTER TABLE public.contract_ata_descartes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contract_ata_descartes" ON public.contract_ata_descartes;
CREATE POLICY "Authenticated Read: contract_ata_descartes"
  ON public.contract_ata_descartes FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_audit_contract_ata_descartes ON public.contract_ata_descartes;
CREATE TRIGGER trg_audit_contract_ata_descartes
AFTER INSERT OR UPDATE OR DELETE ON public.contract_ata_descartes
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- Descartar a ata sugerida para o contrato
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.descartar_ata_do_contrato(
  p_contract_key VARCHAR(100),
  p_ata_key VARCHAR(60)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contrato VARCHAR(100);
  v_ata VARCHAR(60);
  v_nome VARCHAR(150);
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador descarta a ata sugerida para o contrato.'
      USING ERRCODE = '42501';
  END IF;

  v_contrato := TRIM(COALESCE(p_contract_key, ''));
  v_ata := TRIM(COALESCE(p_ata_key, ''));
  IF v_contrato = '' OR v_ata = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o contrato e a ata.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.arp_item_contract_links l
    WHERE l.contract_key = v_contrato AND public.ata_uasg_from_item_key(l.item_key) = v_ata
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O contrato % já está vinculado à ata %; desvincule antes de descartá-la.', v_contrato, v_ata
      USING ERRCODE = '22023';
  END IF;

  v_nome := public.nome_do_usuario_logado();

  INSERT INTO public.contract_ata_descartes (contract_key, ata_key, descartado_por_user_id, descartado_por_nome)
  VALUES (v_contrato, v_ata, auth.uid(), v_nome)
  ON CONFLICT (contract_key, ata_key) DO UPDATE SET
    descartado_por_user_id = EXCLUDED.descartado_por_user_id,
    descartado_por_nome = EXCLUDED.descartado_por_nome,
    created_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.descartar_ata_do_contrato(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_ata_do_contrato(VARCHAR, VARCHAR) TO authenticated;

-- ------------------------------------------------------------------------------
-- Restaurar a ata (volta a ser sugerida)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurar_ata_do_contrato(
  p_contract_key VARCHAR(100),
  p_ata_key VARCHAR(60)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_removidos INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador restaura a ata sugerida para o contrato.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.contract_ata_descartes
  WHERE contract_key = TRIM(COALESCE(p_contract_key, '')) AND ata_key = TRIM(COALESCE(p_ata_key, ''));
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'removed', v_removidos > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.restaurar_ata_do_contrato(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_ata_do_contrato(VARCHAR, VARCHAR) TO authenticated;

-- ------------------------------------------------------------------------------
-- Vincular o contrato a essa ata desfaz o descarte
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_vinculo_limpa_descarte_da_ata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.contract_ata_descartes
  WHERE contract_key = NEW.contract_key AND ata_key = public.ata_uasg_from_item_key(NEW.item_key);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vinculo_limpa_descarte_da_ata ON public.arp_item_contract_links;
CREATE TRIGGER trg_vinculo_limpa_descarte_da_ata
AFTER INSERT ON public.arp_item_contract_links
FOR EACH ROW EXECUTE FUNCTION public.trg_vinculo_limpa_descarte_da_ata();
