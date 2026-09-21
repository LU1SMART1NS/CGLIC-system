-- ==============================================================================
-- MIGRATION 05: RPC TRANSACIONAL DE CONTRATOS E VÍNCULOS — SALDOARP 3.0
-- Versão: 20260917000005_rpc_contracts.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P7 (Least Privilege)
-- ==============================================================================

-- ==============================================================================
-- 1. FUNÇÃO RPC: save_manual_contrato_atomic
-- ==============================================================================
-- Persiste um contrato manual e seus vínculos associativos com empenhos de forma atômica,
-- assegurando o cumprimento estrito da regra RN-07 (vinculação obrigatória de >= 1 empenho).
--
-- Parâmetros:
--   p_contrato: JSONB contendo os dados do contrato manual
--   p_empenho_ids: Array de identificadores canônicos de empenhos associados
--
-- Retorno:
--   JSONB: { success: true, contrato_id: TEXT, item_key: TEXT, links_count: INT, timestamp: TIMESTAMPTZ }
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_manual_contrato_atomic(
  p_contrato JSONB,
  p_empenho_ids TEXT[]
)
RETURNS JSONB AS $$
DECLARE
  v_contrato_id VARCHAR(100);
  v_item_key VARCHAR(100);
  v_numero VARCHAR(50);
  v_ano INTEGER;
  v_arp_id VARCHAR(30);
  v_item_id VARCHAR(10);
  v_uasg VARCHAR(10);
  v_numero_controle_pncp VARCHAR(100);
  v_link_pncp TEXT;
  v_fornecedor VARCHAR(255);
  v_cnpj_fornecedor VARCHAR(20);
  v_objeto TEXT;
  v_quantidade_contratada NUMERIC(18, 4);
  v_valor_total NUMERIC(18, 4);
  v_origem VARCHAR(20);
  v_emp_id TEXT;
  v_links_count INTEGER;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: VERIFICAÇÃO RIGOROSA DE AUTORIZAÇÃO (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: VALIDAÇÃO DO PAYLOAD DE CONTRATO
  -- --------------------------------------------------------------------------
  IF p_contrato IS NULL OR jsonb_typeof(p_contrato) != 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O parâmetro p_contrato deve ser um objeto JSONB válido.'
      USING ERRCODE = '22023';
  END IF;

  v_item_key := TRIM(COALESCE(p_contrato->>'item_key', p_contrato->>'itemKey', ''));
  v_numero := TRIM(COALESCE(p_contrato->>'numero', ''));
  v_ano := (COALESCE(p_contrato->>'ano', '0'))::INTEGER;
  v_arp_id := TRIM(COALESCE(p_contrato->>'arp_id', p_contrato->>'arpId', ''));
  v_item_id := NULLIF(TRIM(COALESCE(p_contrato->>'item_id', p_contrato->>'itemId', '')), '');
  v_uasg := TRIM(COALESCE(p_contrato->>'uasg', ''));

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item do contrato inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF v_numero = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número do contrato é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF v_ano < 2000 OR v_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O ano do contrato deve estar entre 2000 e 2100 (recebido: %).', v_ano
      USING ERRCODE = '22023';
  END IF;

  IF v_uasg = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O código da UASG é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: VALIDAÇÃO DA REGRA DE NEGÓCIO RN-07 (>= 1 EMPENHO VINCULADO)
  -- --------------------------------------------------------------------------
  IF p_empenho_ids IS NULL OR array_length(p_empenho_ids, 1) IS NULL OR array_length(p_empenho_ids, 1) = 0 THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_LINK: Regra RN-07 violada. Todo contrato exige vinculação a pelo menos um empenho.'
      USING ERRCODE = '23514';
  END IF;

  v_links_count := array_length(p_empenho_ids, 1);

  -- --------------------------------------------------------------------------
  -- PASSO 4: EXTRAÇÃO DOS DADOS OPCIONAIS DO CONTRATO
  -- --------------------------------------------------------------------------
  v_contrato_id := COALESCE(
    p_contrato->>'id',
    'ctr_' || v_item_key || '_' || v_numero || '_' || v_ano::TEXT || '_' || gen_random_uuid()::TEXT
  );

  v_numero_controle_pncp := NULLIF(TRIM(COALESCE(p_contrato->>'numero_controle_pncp', p_contrato->>'numeroControlePncp', '')), '');
  v_link_pncp := NULLIF(TRIM(COALESCE(p_contrato->>'link_pncp', p_contrato->>'linkPncp', '')), '');
  v_fornecedor := NULLIF(TRIM(COALESCE(p_contrato->>'fornecedor', '')), '');
  v_cnpj_fornecedor := NULLIF(TRIM(COALESCE(p_contrato->>'cnpj_fornecedor', p_contrato->>'cnpjFornecedor', '')), '');
  v_objeto := NULLIF(TRIM(COALESCE(p_contrato->>'objeto', '')), '');
  v_origem := COALESCE(p_contrato->>'origem', 'MANUAL');

  IF p_contrato->>'quantidade_contratada' IS NOT NULL OR p_contrato->>'quantidadeContratada' IS NOT NULL THEN
    v_quantidade_contratada := (COALESCE(p_contrato->>'quantidade_contratada', p_contrato->>'quantidadeContratada'))::NUMERIC;
    IF v_quantidade_contratada < 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade contratada não pode ser negativa.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    v_quantidade_contratada := NULL;
  END IF;

  IF p_contrato->>'valor_total' IS NOT NULL OR p_contrato->>'valorTotal' IS NOT NULL THEN
    v_valor_total := (COALESCE(p_contrato->>'valor_total', p_contrato->>'valorTotal'))::NUMERIC;
    IF v_valor_total < 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Valor total do contrato não pode ser negativo.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    v_valor_total := NULL;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 5: UPSERT ATÔMICO DO CONTRATO MANUAL
  -- --------------------------------------------------------------------------
  INSERT INTO public.contratos_manuais (
    id,
    item_key,
    numero,
    ano,
    arp_id,
    item_id,
    uasg,
    numero_controle_pncp,
    link_pncp,
    fornecedor,
    cnpj_fornecedor,
    objeto,
    quantidade_contratada,
    valor_total,
    origem,
    criado_em,
    atualizado_em
  ) VALUES (
    v_contrato_id,
    v_item_key,
    v_numero,
    v_ano,
    v_arp_id,
    v_item_id,
    v_uasg,
    v_numero_controle_pncp,
    v_link_pncp,
    v_fornecedor,
    v_cnpj_fornecedor,
    v_objeto,
    v_quantidade_contratada,
    v_valor_total,
    v_origem,
    NOW(),
    NOW()
  )
  ON CONFLICT (item_key, numero, ano) DO UPDATE SET
    arp_id = EXCLUDED.arp_id,
    item_id = EXCLUDED.item_id,
    uasg = EXCLUDED.uasg,
    numero_controle_pncp = EXCLUDED.numero_controle_pncp,
    link_pncp = EXCLUDED.link_pncp,
    fornecedor = EXCLUDED.fornecedor,
    cnpj_fornecedor = EXCLUDED.cnpj_fornecedor,
    objeto = EXCLUDED.objeto,
    quantidade_contratada = EXCLUDED.quantidade_contratada,
    valor_total = EXCLUDED.valor_total,
    origem = EXCLUDED.origem,
    atualizado_em = NOW()
  RETURNING id INTO v_contrato_id;

  -- --------------------------------------------------------------------------
  -- PASSO 6: SINCRONIZAÇÃO ATÔMICA DOS VÍNCULOS CONTRATO <-> EMPENHO
  -- --------------------------------------------------------------------------
  DELETE FROM public.contrato_empenho_links
   WHERE contrato_id = v_contrato_id;

  FOREACH v_emp_id IN ARRAY p_empenho_ids
  LOOP
    IF TRIM(COALESCE(v_emp_id, '')) = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Identificador de empenho vinculado não pode ser vazio.'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.contrato_empenho_links (
      id,
      item_key,
      contrato_id,
      empenho_id,
      data_vinculo,
      origem
    ) VALUES (
      'link_' || gen_random_uuid()::text,
      v_item_key,
      v_contrato_id,
      TRIM(v_emp_id),
      NOW(),
      'MANUAL'
    );
  END LOOP;

  -- --------------------------------------------------------------------------
  -- PASSO 7: RETORNO CANÔNICO ESTRUTURADO
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'contrato_id', v_contrato_id,
    'item_key', v_item_key,
    'links_count', v_links_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Concede permissão de execução aos usuários autenticados
GRANT EXECUTE ON FUNCTION public.save_manual_contrato_atomic(JSONB, TEXT[]) TO authenticated;
