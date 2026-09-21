-- ==============================================================================
-- MIGRATION 08: RPCs TRANSACIONAIS DE DADOS MANUAIS E HARDENING — SALDOARP 3.0
-- Versão: 20260917000008_manual_data_transactions.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P6 (Auditabilidade), P7 (Least Privilege)
-- Resolução: GAP-31-01 (Atomicidade), GAP-31-05 (Auditoria), GAP-31-07 (Backend Authority)
-- ==============================================================================

-- ==============================================================================
-- 1. TABELAS DE ESTADO DOS AGREGADOS PARA CONTROLE DE CONCORRÊNCIA (OPTIMISTIC LOCK)
-- ==============================================================================

-- 1.1 Estado de Versionamento para Empenhos Manuais
CREATE TABLE IF NOT EXISTS public.item_manual_empenho_state (
  item_key VARCHAR(100) PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.item_manual_empenho_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: item_manual_empenho_state" ON public.item_manual_empenho_state
  FOR SELECT TO public
  USING (true);

-- 1.2 Estado de Versionamento para Quantidades Manuais de Empenho
CREATE TABLE IF NOT EXISTS public.item_manual_quantity_state (
  item_key VARCHAR(100) PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.item_manual_quantity_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: item_manual_quantity_state" ON public.item_manual_quantity_state
  FOR SELECT TO public
  USING (true);

-- ==============================================================================
-- 2. TRILHA DE AUDITORIA (AUDIT LOG TRIGGERS)
-- ==============================================================================
-- Assegura cobertura de 100% de auditoria (4/4 tabelas manuais)

DROP TRIGGER IF EXISTS trg_audit_empenho_manual_quantidades ON public.empenho_manual_quantidades;
CREATE TRIGGER trg_audit_empenho_manual_quantidades
AFTER INSERT OR UPDATE OR DELETE ON public.empenho_manual_quantidades
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

DROP TRIGGER IF EXISTS trg_audit_contrato_empenho_links ON public.contrato_empenho_links;
CREATE TRIGGER trg_audit_contrato_empenho_links
AFTER INSERT OR UPDATE OR DELETE ON public.contrato_empenho_links
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ==============================================================================
-- 3. FUNÇÃO RPC: save_manual_empenhos_atomic
-- ==============================================================================
-- Substitui de forma estritamente atômica e versionada a coleção de empenhos manuais
-- de um item da ARP, garantindo controle de concorrência e integridade relacional.

CREATE OR REPLACE FUNCTION public.save_manual_empenhos_atomic(
  p_item_key TEXT,
  p_empenhos JSONB,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item_key VARCHAR(100);
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_emp_count INTEGER;
  v_elem JSONB;
  v_emp_id VARCHAR(100);
  v_numero VARCHAR(50);
  v_ano INTEGER;
  v_arp_id VARCHAR(30);
  v_item_id VARCHAR(10);
  v_uasg VARCHAR(10);
  v_quantidade NUMERIC(18, 4);
  v_valor_unitario NUMERIC(18, 4);
  v_valor_total NUMERIC(18, 4);
  v_data DATE;
  v_fornecedor VARCHAR(255);
  v_cnpj_fornecedor VARCHAR(20);
  v_unidade_interna_id VARCHAR(100);
  v_observacao TEXT;
  v_origem VARCHAR(20);
  v_status VARCHAR(20);
  v_seen_empenhos TEXT[] := ARRAY[]::TEXT[];
  v_emp_sig TEXT;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: SANITIZAÇÃO E VALIDAÇÃO DA CHAVE DO ITEM (item_key)
  -- --------------------------------------------------------------------------
  v_item_key := TRIM(COALESCE(p_item_key, ''));

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida ou fora do padrão canônico (formato esperado: 00037/2026-200331-00001). Valor recebido: "%"', p_item_key
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: VALIDAÇÃO DO PAYLOAD JSONB
  -- --------------------------------------------------------------------------
  IF p_empenhos IS NULL OR jsonb_typeof(p_empenhos) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O parâmetro p_empenhos deve ser um array JSONB válido.'
      USING ERRCODE = '22023';
  END IF;

  v_emp_count := jsonb_array_length(p_empenhos);

  -- --------------------------------------------------------------------------
  -- PASSO 4: CONTROLE DE CONCORRÊNCIA E TRAVA DO AGREGADO (FOR UPDATE)
  -- --------------------------------------------------------------------------
  INSERT INTO public.item_manual_empenho_state (item_key, version, updated_at)
  VALUES (v_item_key, 1, NOW())
  ON CONFLICT (item_key) DO NOTHING;

  SELECT version INTO v_current_version
    FROM public.item_manual_empenho_state
   WHERE item_key = v_item_key
     FOR UPDATE;

  -- Semântica de First-Write vs Subsequent-Write
  IF v_current_version = 1 THEN
    IF p_expected_version IS NOT NULL AND p_expected_version != 1 THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de versão detectado no primeiro registro. Versão esperada: %, Versão atual do banco: %.',
        p_expected_version, v_current_version
        USING ERRCODE = '40001';
    END IF;
  ELSE
    IF p_expected_version IS NULL THEN
      RAISE EXCEPTION 'EXPECTED_VERSION_REQUIRED: O agregado de empenhos manuais para o item "%" já possui versão %. O parâmetro p_expected_version é obrigatório.',
        v_item_key, v_current_version
        USING ERRCODE = '40001';
    END IF;

    IF p_expected_version != v_current_version THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de concorrência. Versão esperada: %, Versão atual do banco: %.',
        p_expected_version, v_current_version
        USING ERRCODE = '40001';
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 5: PRÉ-VALIDAÇÃO DE DOMÍNIO E RESTRIÇÕES DOS ELEMENTOS
  -- --------------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_empenhos)
  LOOP
    v_numero := TRIM(COALESCE(v_elem->>'numero', ''));
    IF v_numero = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Todo empenho manual deve possuir o número de identificação.'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_ano := (COALESCE(v_elem->>'ano', '0'))::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Ano de empenho inválido para o número "%".', v_numero
        USING ERRCODE = '22023';
    END;

    IF v_ano < 2000 OR v_ano > 2100 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O ano do empenho deve estar entre 2000 e 2100 (recebido: % para "%").', v_ano, v_numero
        USING ERRCODE = '22023';
    END IF;

    -- Validação de quantidade
    BEGIN
      v_quantidade := (COALESCE(v_elem->>'quantidade', '0'))::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade inválida para o empenho manual "%".', v_numero
        USING ERRCODE = '22023';
    END;

    IF v_quantidade <= 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A quantidade do empenho manual deve ser maior que zero (recebido: % para "%").', v_quantidade, v_numero
        USING ERRCODE = '22023';
    END IF;

    -- Unicidade intra-payload (item_key, numero, ano)
    v_emp_sig := v_numero || '__' || v_ano::TEXT;
    IF v_emp_sig = ANY(v_seen_empenhos) THEN
      RAISE EXCEPTION 'DUPLICATE_LINK: Empenho manual "%" (ano %) duplicado no payload para o item "%".', v_numero, v_ano, v_item_key
        USING ERRCODE = '23505';
    END IF;
    v_seen_empenhos := array_append(v_seen_empenhos, v_emp_sig);
  END LOOP;

  -- --------------------------------------------------------------------------
  -- PASSO 6: EXECUÇÃO ATÔMICA DA MUTAÇÃO
  -- --------------------------------------------------------------------------
  -- 6.1 Remove os empenhos manuais prévios deste item
  DELETE FROM public.empenhos_manuais
   WHERE item_key = v_item_key;

  -- 6.2 Insere a nova coleção de empenhos manuais
  IF v_emp_count > 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_empenhos)
    LOOP
      v_numero := TRIM(COALESCE(v_elem->>'numero', ''));
      v_ano := (COALESCE(v_elem->>'ano', '0'))::INTEGER;
      v_arp_id := TRIM(COALESCE(v_elem->>'arp_id', v_elem->>'arpId', ''));
      v_item_id := TRIM(COALESCE(v_elem->>'item_id', v_elem->>'itemId', ''));
      v_uasg := TRIM(COALESCE(v_elem->>'uasg', ''));
      v_quantidade := (COALESCE(v_elem->>'quantidade', '0'))::NUMERIC;
      
      v_emp_id := COALESCE(
        NULLIF(TRIM(COALESCE(v_elem->>'id', '')), ''),
        'man_emp_' || v_item_key || '_' || v_numero || '_' || v_ano::TEXT || '_' || gen_random_uuid()::TEXT
      );

      IF v_elem->>'valor_unitario' IS NOT NULL OR v_elem->>'valorUnitario' IS NOT NULL THEN
        v_valor_unitario := (COALESCE(v_elem->>'valor_unitario', v_elem->>'valorUnitario'))::NUMERIC;
        IF v_valor_unitario < 0 THEN
          RAISE EXCEPTION 'INVALID_PAYLOAD: Valor unitário não pode ser negativo.' USING ERRCODE = '22023';
        END IF;
      ELSE
        v_valor_unitario := NULL;
      END IF;

      IF v_elem->>'valor_total' IS NOT NULL OR v_elem->>'valorTotal' IS NOT NULL THEN
        v_valor_total := (COALESCE(v_elem->>'valor_total', v_elem->>'valorTotal'))::NUMERIC;
        IF v_valor_total < 0 THEN
          RAISE EXCEPTION 'INVALID_PAYLOAD: Valor total não pode ser negativo.' USING ERRCODE = '22023';
        END IF;
      ELSE
        v_valor_total := NULL;
      END IF;

      IF v_elem->>'data' IS NOT NULL AND TRIM(v_elem->>'data') <> '' THEN
        v_data := (v_elem->>'data')::DATE;
      ELSE
        v_data := NULL;
      END IF;

      v_fornecedor := NULLIF(TRIM(COALESCE(v_elem->>'fornecedor', '')), '');
      v_cnpj_fornecedor := NULLIF(TRIM(COALESCE(v_elem->>'cnpj_fornecedor', v_elem->>'cnpjFornecedor', '')), '');
      v_unidade_interna_id := NULLIF(TRIM(COALESCE(v_elem->>'unidade_interna_id', v_elem->>'unidadeInternaId', '')), '');
      v_observacao := NULLIF(TRIM(COALESCE(v_elem->>'observacao', '')), '');
      v_origem := COALESCE(v_elem->>'origem', 'MANUAL');
      v_status := COALESCE(v_elem->>'status', 'CONFIRMADO');

      INSERT INTO public.empenhos_manuais (
        id,
        item_key,
        numero,
        ano,
        arp_id,
        item_id,
        uasg,
        quantidade,
        valor_unitario,
        valor_total,
        data,
        fornecedor,
        cnpj_fornecedor,
        unidade_interna_id,
        observacao,
        origem,
        status,
        criado_em,
        atualizado_em
      ) VALUES (
        v_emp_id,
        v_item_key,
        v_numero,
        v_ano,
        v_arp_id,
        v_item_id,
        v_uasg,
        v_quantidade,
        v_valor_unitario,
        v_valor_total,
        v_data,
        v_fornecedor,
        v_cnpj_fornecedor,
        v_unidade_interna_id,
        v_observacao,
        v_origem,
        v_status,
        NOW(),
        NOW()
      );
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 7: INCREMENTO DA VERSÃO DO AGREGADO E ATUALIZAÇÃO DE TIMESTAMP
  -- --------------------------------------------------------------------------
  UPDATE public.item_manual_empenho_state
     SET version = v_current_version + 1,
         updated_at = NOW()
   WHERE item_key = v_item_key
  RETURNING version INTO v_new_version;

  -- --------------------------------------------------------------------------
  -- PASSO 8: RESPOSTA CANÔNICA ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'previous_version', v_current_version,
    'new_version', v_new_version,
    'count', v_emp_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.save_manual_empenhos_atomic(TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_empenhos_atomic(TEXT, JSONB, INTEGER) TO authenticated;

-- ==============================================================================
-- 4. FUNÇÃO RPC: save_empenho_manual_quantities_atomic
-- ==============================================================================
-- Substitui de forma estritamente atômica e versionada a coleção de overrides
-- manuais de quantidades de empenho por item.

CREATE OR REPLACE FUNCTION public.save_empenho_manual_quantities_atomic(
  p_item_key TEXT,
  p_quantities JSONB,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item_key VARCHAR(100);
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_qty_count INTEGER := 0;
  v_elem JSONB;
  v_emp_key VARCHAR(50);
  v_quantidade NUMERIC(18, 4);
  v_key TEXT;
  v_val JSONB;
  v_seen_keys TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: SANITIZAÇÃO E VALIDAÇÃO DA CHAVE DO ITEM (item_key)
  -- --------------------------------------------------------------------------
  v_item_key := TRIM(COALESCE(p_item_key, ''));

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida ou fora do padrão canônico (formato esperado: 00037/2026-200331-00001). Valor recebido: "%"', p_item_key
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: VALIDAÇÃO DO PAYLOAD JSONB
  -- --------------------------------------------------------------------------
  IF p_quantities IS NULL OR NOT (jsonb_typeof(p_quantities) IN ('array', 'object')) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O parâmetro p_quantities deve ser um array ou objeto JSONB válido.'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 4: CONTROLE DE CONCORRÊNCIA E TRAVA DO AGREGADO (FOR UPDATE)
  -- --------------------------------------------------------------------------
  INSERT INTO public.item_manual_quantity_state (item_key, version, updated_at)
  VALUES (v_item_key, 1, NOW())
  ON CONFLICT (item_key) DO NOTHING;

  SELECT version INTO v_current_version
    FROM public.item_manual_quantity_state
   WHERE item_key = v_item_key
     FOR UPDATE;

  -- Semântica de First-Write vs Subsequent-Write
  IF v_current_version = 1 THEN
    IF p_expected_version IS NOT NULL AND p_expected_version != 1 THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de versão detectado no primeiro registro. Versão esperada: %, Versão atual do banco: %.',
        p_expected_version, v_current_version
        USING ERRCODE = '40001';
    END IF;
  ELSE
    IF p_expected_version IS NULL THEN
      RAISE EXCEPTION 'EXPECTED_VERSION_REQUIRED: O agregado de quantidades para o item "%" já possui versão %. O parâmetro p_expected_version é obrigatório.',
        v_item_key, v_current_version
        USING ERRCODE = '40001';
    END IF;

    IF p_expected_version != v_current_version THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de concorrência. Versão esperada: %, Versão atual do banco: %.',
        p_expected_version, v_current_version
        USING ERRCODE = '40001';
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 5: PRÉ-VALIDAÇÃO ESTATÍSTICA E RELACIONAL DOS ELEMENTOS
  -- --------------------------------------------------------------------------
  IF jsonb_typeof(p_quantities) = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_quantities)
    LOOP
      v_emp_key := TRIM(COALESCE(v_elem->>'emp_key', v_elem->>'empKey', ''));
      IF v_emp_key = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Identificador do empenho (emp_key) é obrigatório.'
          USING ERRCODE = '22023';
      END IF;

      BEGIN
        v_quantidade := (COALESCE(v_elem->>'quantidade', '0'))::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade inválida para o empenho "%".', v_emp_key
          USING ERRCODE = '22023';
      END;

      IF v_quantidade < 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: A quantidade não pode ser negativa (recebido: % para "%").', v_quantidade, v_emp_key
          USING ERRCODE = '22023';
      END IF;

      IF v_emp_key = ANY(v_seen_keys) THEN
        RAISE EXCEPTION 'DUPLICATE_LINK: Quantidade duplicada no payload para o empenho "%".', v_emp_key
          USING ERRCODE = '23505';
      END IF;
      v_seen_keys := array_append(v_seen_keys, v_emp_key);
      v_qty_count := v_qty_count + 1;
    END LOOP;
  ELSE
    -- Objeto JSON chave-valor: { "emp_key": quantidade }
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_quantities)
    LOOP
      v_emp_key := TRIM(COALESCE(v_key, ''));
      IF v_emp_key = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Identificador do empenho (emp_key) é obrigatório.'
          USING ERRCODE = '22023';
      END IF;

      BEGIN
        v_quantidade := (v_val#>>'{}')::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade inválida para o empenho "%".', v_emp_key
          USING ERRCODE = '22023';
      END;

      IF v_quantidade < 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: A quantidade não pode ser negativa (recebido: % para "%").', v_quantidade, v_emp_key
          USING ERRCODE = '22023';
      END IF;

      v_qty_count := v_qty_count + 1;
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 6: EXECUÇÃO ATÔMICA DA MUTAÇÃO
  -- --------------------------------------------------------------------------
  -- 6.1 Remove os overrides prévios deste item
  DELETE FROM public.empenho_manual_quantidades
   WHERE item_key = v_item_key;

  -- 6.2 Insere a nova coleção de overrides validados
  IF jsonb_typeof(p_quantities) = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_quantities)
    LOOP
      v_emp_key := TRIM(COALESCE(v_elem->>'emp_key', v_elem->>'empKey', ''));
      v_quantidade := (COALESCE(v_elem->>'quantidade', '0'))::NUMERIC;

      INSERT INTO public.empenho_manual_quantidades (
        id,
        item_key,
        emp_key,
        quantidade,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_item_key,
        v_emp_key,
        v_quantidade,
        NOW()
      );
    END LOOP;
  ELSE
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_quantities)
    LOOP
      v_emp_key := TRIM(COALESCE(v_key, ''));
      v_quantidade := (v_val#>>'{}')::NUMERIC;

      INSERT INTO public.empenho_manual_quantidades (
        id,
        item_key,
        emp_key,
        quantidade,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_item_key,
        v_emp_key,
        v_quantidade,
        NOW()
      );
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 7: INCREMENTO DA VERSÃO DO AGREGADO E ATUALIZAÇÃO DE TIMESTAMP
  -- --------------------------------------------------------------------------
  UPDATE public.item_manual_quantity_state
     SET version = v_current_version + 1,
         updated_at = NOW()
   WHERE item_key = v_item_key
  RETURNING version INTO v_new_version;

  -- --------------------------------------------------------------------------
  -- PASSO 8: RESPOSTA CANÔNICA ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'previous_version', v_current_version,
    'new_version', v_new_version,
    'count', v_qty_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.save_empenho_manual_quantities_atomic(TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_empenho_manual_quantities_atomic(TEXT, JSONB, INTEGER) TO authenticated;

-- ==============================================================================
-- 5. FECHAMENTO DE BYPASS DE ESCRITA DIRETA VIA POSTGREST (BACKEND AUTHORITY)
-- ==============================================================================
-- Revoga escrita direta via PostgREST em empenhos_manuais e empenho_manual_quantidades.
-- Todas as mutações devem transitar obrigatoriamente pelas RPCs atômicas e autorizadas.

DROP POLICY IF EXISTS "Gestor Write: empenhos_manuais" ON public.empenhos_manuais;
DROP POLICY IF EXISTS "Gestor Write: empenho_manual_quantidades" ON public.empenho_manual_quantidades;
