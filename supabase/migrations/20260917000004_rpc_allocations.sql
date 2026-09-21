-- ==============================================================================
-- MIGRATION 04: RPC TRANSACIONAL DE ALOCAÇÕES — SALDOARP 3.0
-- Versão: 20260917000004_rpc_allocations.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P7 (Least Privilege)
-- ==============================================================================

-- ==============================================================================
-- 1. FUNÇÃO RPC: save_allocations_atomic
-- ==============================================================================
-- Substitui de forma estritamente atômica e versionada o conjunto de alocações 
-- departamentais de um item da ARP, garantindo controle de concorrência e integridade.
--
-- Parâmetros:
--   p_item_key: Chave Canônica do Item (${numeroAta}-${uasg}-${Pad5(numeroItem)})
--   p_allocations: Array JSONB com as alocações [{ id?, unit_name, allocated_qty, empenhada_qty?, processo_sei_id? }]
--   p_expected_version: Versão esperada do agregado (para detecção de concorrência / optimistic lock)
--
-- Retorno:
--   JSONB: { success: true, item_key: TEXT, previous_version: INT, new_version: INT, count: INT, timestamp: TIMESTAMPTZ }
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_allocations_atomic(
  p_item_key TEXT,
  p_allocations JSONB,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item_key VARCHAR(100);
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_alloc_count INTEGER;
  v_elem JSONB;
  v_alloc_id VARCHAR(100);
  v_unit_name VARCHAR(50);
  v_allocated_qty NUMERIC(18, 4);
  v_empenhada_qty NUMERIC(18, 4);
  v_processo_sei_id VARCHAR(50);
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: VERIFICAÇÃO RIGOROSA DE AUTORIZAÇÃO (RBAC)
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
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O parâmetro p_allocations deve ser um array JSONB válido.'
      USING ERRCODE = '22023';
  END IF;

  v_alloc_count := jsonb_array_length(p_allocations);

  -- --------------------------------------------------------------------------
  -- PASSO 4: CONTROLE DE CONCORRÊNCIA E TRAVA DO AGREGADO (FOR UPDATE)
  -- --------------------------------------------------------------------------
  -- Garante a existência do registro na tabela de estado do agregado
  INSERT INTO public.item_allocation_state (item_key, version, updated_at)
  VALUES (v_item_key, 1, NOW())
  ON CONFLICT (item_key) DO NOTHING;

  -- Adquire lock exclusivo de linha na chave do agregado
  SELECT version INTO v_current_version
    FROM public.item_allocation_state
   WHERE item_key = v_item_key
     FOR UPDATE;

  -- Valida a versão se fornecida (Optimistic Lock Guard)
  IF p_expected_version IS NOT NULL AND p_expected_version != v_current_version THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de versão detectado. Versão esperada: %, Versão atual do banco: %.',
      p_expected_version, v_current_version
      USING ERRCODE = '40001';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 5: PRÉ-VALIDAÇÃO ESTATÍSTICA E RELACIONAL DOS ELEMENTOS
  -- --------------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_unit_name := TRIM(COALESCE(v_elem->>'unit_name', v_elem->>'unitName', ''));
    
    IF v_unit_name = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Toda alocação deve possuir a identificação do departamento (unit_name).'
        USING ERRCODE = '22023';
    END IF;

    -- Validação de quantidade alocada
    BEGIN
      v_allocated_qty := (COALESCE(v_elem->>'allocated_qty', v_elem->>'allocatedQty', '0'))::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade alocada inválida para o departamento %.', v_unit_name
        USING ERRCODE = '22023';
    END;

    IF v_allocated_qty < 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade alocada não pode ser negativa (% para %).', v_allocated_qty, v_unit_name
        USING ERRCODE = '22023';
    END IF;

    -- Validação de integridade referencial do departamento
    IF NOT EXISTS (
      SELECT 1 FROM public.internal_departments 
       WHERE sigla = v_unit_name 
         AND ativo = TRUE
    ) THEN
      RAISE EXCEPTION 'INVALID_DEPARTMENT: Departamento "%" não existe ou está inativo no catálogo oficial.', v_unit_name
        USING ERRCODE = '23503';
    END IF;

    -- Validação opcional de processo SEI
    v_processo_sei_id := TRIM(COALESCE(v_elem->>'processo_sei_id', v_elem->>'processoSeiId', ''));
    IF v_processo_sei_id <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM public.processos_sei WHERE id = v_processo_sei_id) THEN
        RAISE EXCEPTION 'INVALID_PROCESS_SEI: Processo SEI "%" informado não foi encontrado.', v_processo_sei_id
          USING ERRCODE = '23503';
      END IF;
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- PASSO 6: EXECUÇÃO ATÔMICA DA MUTAÇÃO
  -- --------------------------------------------------------------------------
  -- 6.1 Remove alocações prévias deste item_key
  DELETE FROM public.arp_allocations
   WHERE item_key = v_item_key;

  -- 6.2 Insere as novas alocações validadas
  IF v_alloc_count > 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_unit_name := TRIM(COALESCE(v_elem->>'unit_name', v_elem->>'unitName', ''));
      v_allocated_qty := (COALESCE(v_elem->>'allocated_qty', v_elem->>'allocatedQty', '0'))::NUMERIC;
      v_empenhada_qty := (COALESCE(v_elem->>'empenhada_qty', v_elem->>'empenhadaQty', '0'))::NUMERIC;
      v_processo_sei_id := NULLIF(TRIM(COALESCE(v_elem->>'processo_sei_id', v_elem->>'processoSeiId', '')), '');
      
      v_alloc_id := COALESCE(
        v_elem->>'id',
        'alloc_' || v_item_key || '_' || v_unit_name || '_' || gen_random_uuid()::TEXT
      );

      INSERT INTO public.arp_allocations (
        id,
        item_key,
        unit_name,
        allocated_qty,
        empenhada_qty,
        processo_sei_id,
        created_at
      ) VALUES (
        v_alloc_id,
        v_item_key,
        v_unit_name,
        v_allocated_qty,
        v_empenhada_qty,
        v_processo_sei_id,
        NOW()
      );
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 7: INCREMENTO DA VERSÃO DO AGREGADO E ATUALIZAÇÃO DE TIMESTAMP
  -- --------------------------------------------------------------------------
  UPDATE public.item_allocation_state
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
    'count', v_alloc_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Concede permissão de execução aos usuários autenticados (RBAC interno aplica checagem de role)
GRANT EXECUTE ON FUNCTION public.save_allocations_atomic(TEXT, JSONB, INTEGER) TO authenticated;
