-- ==============================================================================
-- MIGRATION 07: RPC TRANSACIONAL DE VÍNCULOS DE EMPENHOS E HARDENING — SALDOARP 3.0
-- Versão: 20260917000007_rpc_empenho_links.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade), P7 (Least Privilege)
-- Resolução: GAP-25-02 (Backend Authority), GAP-25-03 (Atomicidade), GAP-25-04 (Concorrência), GAP-25-09 (Auditoria)
-- ==============================================================================

-- ==============================================================================
-- 1. TABELA DE ESTADO DO AGREGADO: item_empenho_link_state
-- ==============================================================================
-- Mantém o versionamento canônico e controle de concorrência otimista (optimistic locking)
-- para o agregado de vínculos de empenhos por item de ARP.

CREATE TABLE IF NOT EXISTS public.item_empenho_link_state (
  item_key VARCHAR(100) PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS na tabela de estado
ALTER TABLE public.item_empenho_link_state ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública/autenticada
CREATE POLICY "Public Read: item_empenho_link_state" ON public.item_empenho_link_state
  FOR SELECT TO public
  USING (true);

-- Nenhuma política de escrita direta para clientes (mutações exclusivas via RPC)

-- ==============================================================================
-- 2. HARDENING DE BACKEND AUTHORITY PARA empenho_links
-- ==============================================================================
-- Revoga escrita direta via PostgREST na tabela empenho_links. Todas as alterações
-- devem ser executadas exclusivamente através da RPC transacional save_empenho_links_atomic.

DROP POLICY IF EXISTS "Gestor Write: empenho_links" ON public.empenho_links;

-- ==============================================================================
-- 3. VINCULAÇÃO DO TRIGGER DE AUDITORIA A empenho_links
-- ==============================================================================
-- Registra automaticamente todas as inserções, alterações e deleções na tabela audit_logs.

DROP TRIGGER IF EXISTS trg_audit_empenho_links ON public.empenho_links;
CREATE TRIGGER trg_audit_empenho_links
AFTER INSERT OR UPDATE OR DELETE ON public.empenho_links
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ==============================================================================
-- 4. FUNÇÃO RPC TRANSACIONAL: save_empenho_links_atomic
-- ==============================================================================
-- Substitui de forma estritamente atômica e versionada o conjunto completo de vínculos
-- de empenhos de um item da ARP, garantindo controle de concorrência e integridade referencial.
--
-- Parâmetros:
--   p_item_key: Chave Canônica do Item (${numeroAta}-${uasg}-${Pad5(numeroItem)})
--   p_links: Array JSONB com os vínculos [{ empenho_numero, allocation_id }]
--   p_expected_version: Versão esperada do agregado (para detecção de concorrência / optimistic lock)
--
-- Retorno:
--   JSONB: { success: true, item_key: TEXT, previous_version: INT, new_version: INT, count: INT, timestamp: TIMESTAMPTZ }
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_empenho_links_atomic(
  p_item_key TEXT,
  p_links JSONB,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item_key VARCHAR(100);
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_link_count INTEGER;
  v_elem JSONB;
  v_empenho_numero VARCHAR(50);
  v_allocation_id VARCHAR(100);
  v_alloc_item_key VARCHAR(100);
  v_seen_empenhos TEXT[] := ARRAY[]::TEXT[];
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
  IF p_links IS NULL OR jsonb_typeof(p_links) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O parâmetro p_links deve ser um array JSONB válido.'
      USING ERRCODE = '22023';
  END IF;

  v_link_count := jsonb_array_length(p_links);

  -- --------------------------------------------------------------------------
  -- PASSO 4: CONTROLE DE CONCORRÊNCIA E TRAVA DO AGREGADO (FOR UPDATE)
  -- --------------------------------------------------------------------------
  -- Garante a existência do registro na tabela de estado do agregado
  INSERT INTO public.item_empenho_link_state (item_key, version, updated_at)
  VALUES (v_item_key, 1, NOW())
  ON CONFLICT (item_key) DO NOTHING;

  -- Adquire lock exclusivo de linha na chave do agregado
  SELECT version INTO v_current_version
    FROM public.item_empenho_link_state
   WHERE item_key = v_item_key
     FOR UPDATE;

  -- Validação de First-Write vs Subsequent-Write (Hardening de Concorrência)
  IF v_current_version = 1 THEN
    IF p_expected_version IS NOT NULL AND p_expected_version != 1 THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de versão detectado no primeiro registro. Versão esperada: %, Versão atual do banco: %.',
        p_expected_version, v_current_version
        USING ERRCODE = '40001';
    END IF;
  ELSE
    IF p_expected_version IS NULL THEN
      RAISE EXCEPTION 'EXPECTED_VERSION_REQUIRED: O agregado de vínculos para o item "%" já possui versão %. O parâmetro p_expected_version é obrigatório.',
        v_item_key, v_current_version
        USING ERRCODE = '40001';
    END IF;

    IF p_expected_version != v_current_version THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de versão detectado. Versão esperada: %, Versão atual do banco: %.',
        p_expected_version, v_current_version
        USING ERRCODE = '40001';
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 5: PRÉ-VALIDAÇÃO ESTATÍSTICA E RELACIONAL DOS ELEMENTOS
  -- --------------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_links)
  LOOP
    v_empenho_numero := TRIM(COALESCE(v_elem->>'empenho_numero', v_elem->>'empenhoNumero', ''));
    v_allocation_id := TRIM(COALESCE(v_elem->>'allocation_id', v_elem->>'allocationId', ''));

    IF v_empenho_numero = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Todo vínculo deve conter o número do empenho (empenho_numero).'
        USING ERRCODE = '22023';
    END IF;

    IF v_allocation_id = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Todo vínculo deve conter a identificação da alocação (allocation_id).'
        USING ERRCODE = '22023';
    END IF;

    -- Validação de duplicidade no próprio payload
    IF v_empenho_numero = ANY(v_seen_empenhos) THEN
      RAISE EXCEPTION 'DUPLICATE_LINK: Número de empenho "%" duplicado no payload para o item "%".', v_empenho_numero, v_item_key
        USING ERRCODE = '23505';
    END IF;
    v_seen_empenhos := array_append(v_seen_empenhos, v_empenho_numero);

    -- Validação de integridade referencial: allocation_id deve existir e pertencer ao mesmo item_key
    SELECT item_key INTO v_alloc_item_key
      FROM public.arp_allocations
     WHERE id = v_allocation_id;

    IF v_alloc_item_key IS NULL THEN
      RAISE EXCEPTION 'INVALID_ALLOCATION: A alocação "%" informada para o empenho "%" não existe no catálogo de alocações.', v_allocation_id, v_empenho_numero
        USING ERRCODE = '23503';
    END IF;

    IF v_alloc_item_key != v_item_key THEN
      RAISE EXCEPTION 'INVALID_ALLOCATION: A alocação "%" pertence ao item "%", e não ao item "%" sob alteração.', v_allocation_id, v_alloc_item_key, v_item_key
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- PASSO 6: EXECUÇÃO ATÔMICA DA MUTAÇÃO
  -- --------------------------------------------------------------------------
  -- 6.1 Remove vínculos prévios deste item_key
  DELETE FROM public.empenho_links
   WHERE item_key = v_item_key;

  -- 6.2 Insere os novos vínculos validados
  IF v_link_count > 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_links)
    LOOP
      v_empenho_numero := TRIM(COALESCE(v_elem->>'empenho_numero', v_elem->>'empenhoNumero', ''));
      v_allocation_id := TRIM(COALESCE(v_elem->>'allocation_id', v_elem->>'allocationId', ''));

      INSERT INTO public.empenho_links (
        id,
        item_key,
        empenho_numero,
        allocation_id,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_item_key,
        v_empenho_numero,
        v_allocation_id,
        NOW()
      );
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 7: INCREMENTO DA VERSÃO DO AGREGADO E ATUALIZAÇÃO DE TIMESTAMP
  -- --------------------------------------------------------------------------
  UPDATE public.item_empenho_link_state
     SET version = v_current_version + 1,
         updated_at = NOW()
   WHERE item_key = v_item_key
  RETURNING version INTO v_new_version;

  -- --------------------------------------------------------------------------
  -- PASSO 8: RETORNO ESTRUTURADO DE SUCESSO
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'previous_version', v_current_version,
    'new_version', v_new_version,
    'count', v_link_count,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Permissões de Execução
REVOKE ALL ON FUNCTION public.save_empenho_links_atomic(TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_empenho_links_atomic(TEXT, JSONB, INTEGER) TO authenticated;
