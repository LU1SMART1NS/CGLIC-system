-- ==============================================================================
-- MIGRATION 06: HARDENING DE BACKEND AUTHORITY & FECHAMENTO DE BYPASS — SALDOARP 3.0
-- Versão: 20260917000006_backend_authority_hardening.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P7 (Least Privilege)
-- Resolução: ACH-01 (Backend Authority), ACH-02 (Domínio Empenho), ACH-03 (Optimistic Locking)
-- ==============================================================================

-- ==============================================================================
-- 1. RESOLUÇÃO ACH-01: FECHAR O BYPASS DE ESCRITA DIRETA VIA POSTGREST
-- ==============================================================================
-- As tabelas sob autoridade exclusiva das RPCs transacionais NÃO devem permitir
-- mutações diretas (INSERT, UPDATE, DELETE) por clientes via PostgREST, mesmo com
-- papel de Gestor ou Admin. As mutações devem ocorrer ESTRITAMENTE via RPCs SECURITY DEFINER.

-- 1.1 arp_allocations: Revoga escrita direta de clientes
DROP POLICY IF EXISTS "Gestor Write: arp_allocations" ON public.arp_allocations;

-- 1.2 item_allocation_state: Revoga escrita direta de clientes
DROP POLICY IF EXISTS "Gestor Write: item_allocation_state" ON public.item_allocation_state;

-- 1.3 contratos_manuais: Revoga escrita direta de clientes
DROP POLICY IF EXISTS "Gestor Write: contratos_manuais" ON public.contratos_manuais;

-- 1.4 contrato_empenho_links: Revoga escrita direta de clientes
DROP POLICY IF EXISTS "Gestor Write: contrato_empenho_links" ON public.contrato_empenho_links;

-- ==============================================================================
-- 2. HARDENING DE PRIVILÉGIOS DE ROTINA (EXECUTE GRANTS)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.save_allocations_atomic(TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_allocations_atomic(TEXT, JSONB, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.save_manual_contrato_atomic(JSONB, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_contrato_atomic(JSONB, TEXT[]) TO authenticated;

-- ==============================================================================
-- 3. HARDENING DA RPC: save_allocations_atomic
-- ==============================================================================
-- Aperfeiçoamento da semântica de First-Write vs Subsequent-Write e Optimistic Locking.
-- Regra: Se o agregado já possui versão > 1, p_expected_version é OBRIGATÓRIO (impede force-write cego).

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
  v_is_first_write BOOLEAN := FALSE;
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
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O parâmetro p_allocations deve ser um array JSONB válido.'
      USING ERRCODE = '22023';
  END IF;

  v_alloc_count := jsonb_array_length(p_allocations);

  -- --------------------------------------------------------------------------
  -- PASSO 4: CONTROLE DE CONCORRÊNCIA E TRAVA DO AGREGADO (FOR UPDATE)
  -- --------------------------------------------------------------------------
  -- Inicialização segura do estado do agregado (first write guard)
  INSERT INTO public.item_allocation_state (item_key, version, updated_at)
  VALUES (v_item_key, 1, NOW())
  ON CONFLICT (item_key) DO NOTHING;

  -- Adquire lock exclusivo de linha no agregado
  SELECT version INTO v_current_version
    FROM public.item_allocation_state
   WHERE item_key = v_item_key
     FOR UPDATE;

  -- Semântica de First-Write vs Subsequent-Write:
  -- Se o item já passou por mutações prévias (version > 1), p_expected_version é mandatário.
  IF v_current_version > 1 AND p_expected_version IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_VERSION_REQUIRED: O item "%" possui versão ativa %. O parâmetro p_expected_version é obrigatório para prevenir concorrência.',
      v_item_key, v_current_version
      USING ERRCODE = '40001';
  END IF;

  -- Se p_expected_version foi fornecido, deve coincidir exatamente com v_current_version
  IF p_expected_version IS NOT NULL AND p_expected_version != v_current_version THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de concorrência. Versão esperada: %, Versão atual do banco: %.',
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
  -- 6.1 Remove alocações prévias do item_key
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

-- ==============================================================================
-- 4. HARDENING DA RPC: save_manual_contrato_atomic
-- ==============================================================================
-- Aperfeiçoamento da validação de domínio para empenho_id (ACH-02).
-- Valida que cada empenho_id respeita a sintaxe canônica do SIAFI/Compras ou identificador válido.

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
  v_clean_emp_id TEXT;
  v_links_count INTEGER;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
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
  -- PASSO 4: VALIDAÇÃO DE DOMÍNIO DOS IDENTIFICADORES DE EMPENHO (ACH-02)
  -- --------------------------------------------------------------------------
  FOREACH v_emp_id IN ARRAY p_empenho_ids
  LOOP
    v_clean_emp_id := TRIM(COALESCE(v_emp_id, ''));
    
    -- Exige formato canônico SIAFI (ex: 2026NE000123) ou identificador alfanumérico válido
    IF v_clean_emp_id = '' OR NOT (v_clean_emp_id ~ '^[0-9A-Za-z\-_/]{4,50}$') THEN
      RAISE EXCEPTION 'INVALID_EMPENHO_ID_FORMAT: Identificador de empenho "%" inválido para vinculação.', v_emp_id
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- PASSO 5: EXTRAÇÃO DOS DADOS OPCIONAIS DO CONTRATO
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
  -- PASSO 6: UPSERT ATÔMICO DO CONTRATO MANUAL
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
  -- PASSO 7: SINCRONIZAÇÃO ATÔMICA DOS VÍNCULOS CONTRATO <-> EMPENHO
  -- --------------------------------------------------------------------------
  DELETE FROM public.contrato_empenho_links
   WHERE contrato_id = v_contrato_id;

  FOREACH v_emp_id IN ARRAY p_empenho_ids
  LOOP
    v_clean_emp_id := TRIM(v_emp_id);

    INSERT INTO public.contrato_empenho_links (
      id,
      item_key,
      contrato_id,
      empenho_id,
      data_vinculo,
      origem
    ) VALUES (
      'link_' || v_contrato_id || '_' || v_clean_emp_id,
      v_item_key,
      v_contrato_id,
      v_clean_emp_id,
      NOW(),
      'MANUAL'
    );
  END LOOP;

  -- --------------------------------------------------------------------------
  -- PASSO 8: RETORNO CANÔNICO ESTRUTURADO
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
