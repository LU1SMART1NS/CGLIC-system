-- ==============================================================================
-- MIGRATION 50: VÍNCULO ITEM ↔ CONTRATO SEM QUANTIDADE DIGITADA
-- Versão: 20261002000050_arp_item_contract_links_sem_quantidade.sql
--
-- A quantidade do item no contrato é dado oficial (Contratos.gov.br / Compras.gov.br)
-- e muda com aditivos. Guardá-la no vínculo criava uma cópia digitada que podia
-- divergir da API. O vínculo passa a ser só o par (item, contrato); a quantidade é
-- lida da API quando a tela é exibida. Os valores já gravados são descartados.
-- ==============================================================================

ALTER TABLE public.arp_item_contract_links
  DROP COLUMN IF EXISTS quantidade_contratada;

-- ------------------------------------------------------------------------------
-- link_contract_to_item_atomic: (item_key, contract_key, observacoes)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.link_contract_to_item_atomic(VARCHAR, VARCHAR, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.link_contract_to_item_atomic(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link_id UUID;
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

  INSERT INTO public.arp_item_contract_links (
    item_key, contract_key, observacoes, criado_por, created_at, updated_at
  ) VALUES (
    v_item_key, v_contract_key, NULLIF(TRIM(COALESCE(p_observacoes, '')), ''), auth.uid(), NOW(), NOW()
  )
  ON CONFLICT (item_key, contract_key) DO UPDATE SET
    observacoes = EXCLUDED.observacoes,
    updated_at = NOW()
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_link_id,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_contract_to_item_atomic(VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_contract_to_item_atomic(VARCHAR, VARCHAR, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- link_contract_to_items_atomic: (contract_key, [item_key, ...], observacoes)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.link_contract_to_items_atomic(VARCHAR, JSONB);

CREATE OR REPLACE FUNCTION public.link_contract_to_items_atomic(
  p_contract_key VARCHAR,
  p_item_keys JSONB,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
  v_obs TEXT := NULLIF(TRIM(COALESCE(p_observacoes, '')), '');
  v_elem JSONB;
  v_item_key VARCHAR(100);
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_count INTEGER := 0;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave canônica do contrato não pode ser vazia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_item_keys IS NULL OR jsonb_typeof(p_item_keys) <> 'array' OR jsonb_array_length(p_item_keys) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe ao menos um item para vincular.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_item_keys) > 200 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 200 itens por operação.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_item_keys)
  LOOP
    v_item_key := TRIM(COALESCE(v_elem #>> '{}', ''));

    IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
      RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
        USING ERRCODE = '22023';
    END IF;

    IF v_item_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Item repetido na operação: "%"', v_item_key
        USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_item_key);

    INSERT INTO public.arp_item_contract_links (
      item_key, contract_key, observacoes, criado_por, created_at, updated_at
    ) VALUES (
      v_item_key, v_contract_key, v_obs, auth.uid(), NOW(), NOW()
    )
    ON CONFLICT (item_key, contract_key) DO UPDATE SET
      observacoes = EXCLUDED.observacoes,
      updated_at = NOW();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'contract_key', v_contract_key,
    'count', v_count,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_contract_to_items_atomic(VARCHAR, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_contract_to_items_atomic(VARCHAR, JSONB, TEXT) TO authenticated, service_role;
