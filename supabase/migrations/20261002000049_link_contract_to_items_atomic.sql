-- ==============================================================================
-- MIGRATION 49: VÍNCULO EM LOTE CONTRATO ↔ VÁRIOS ITENS DA ARP
-- Versão: 20261002000049_link_contract_to_items_atomic.sql
--
-- Um contrato pode cobrir vários itens de uma Ata. Esta RPC vincula o mesmo
-- contrato a N itens numa única transação (tudo ou nada), com a quantidade de
-- cada item. Usa a mesma tabela e as mesmas regras de link_contract_to_item_atomic.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.link_contract_to_items_atomic(
  p_contract_key VARCHAR,
  p_links JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
  v_elem JSONB;
  v_item_key VARCHAR(100);
  v_qtd NUMERIC;
  v_obs TEXT;
  v_id UUID;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_result JSONB := '[]'::JSONB;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave canônica do contrato não pode ser vazia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_links IS NULL OR jsonb_typeof(p_links) <> 'array' OR jsonb_array_length(p_links) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe ao menos um item para vincular.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_links) > 200 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 200 itens por operação.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_links)
  LOOP
    v_item_key := TRIM(COALESCE(v_elem->>'item_key', ''));

    IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
      RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
        USING ERRCODE = '22023';
    END IF;

    IF v_item_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Item repetido na operação: "%"', v_item_key
        USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_item_key);

    BEGIN
      v_qtd := (v_elem->>'quantidade_contratada')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_qtd := NULL;
    END;

    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade contratada do item "%" deve ser maior que zero.', v_item_key
        USING ERRCODE = '22023';
    END IF;

    v_obs := NULLIF(TRIM(COALESCE(v_elem->>'observacoes', '')), '');

    INSERT INTO public.arp_item_contract_links (
      item_key, contract_key, quantidade_contratada, observacoes, criado_por, created_at, updated_at
    ) VALUES (
      v_item_key, v_contract_key, v_qtd, v_obs, auth.uid(), NOW(), NOW()
    )
    ON CONFLICT (item_key, contract_key) DO UPDATE SET
      quantidade_contratada = EXCLUDED.quantidade_contratada,
      observacoes = EXCLUDED.observacoes,
      updated_at = NOW()
    RETURNING id INTO v_id;

    v_result := v_result || jsonb_build_object(
      'id', v_id,
      'item_key', v_item_key,
      'quantidade_contratada', v_qtd
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'contract_key', v_contract_key,
    'count', jsonb_array_length(v_result),
    'links', v_result,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_contract_to_items_atomic(VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_contract_to_items_atomic(VARCHAR, JSONB) TO authenticated;
