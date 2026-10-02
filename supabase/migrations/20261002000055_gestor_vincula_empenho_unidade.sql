-- ==============================================================================
-- MIGRATION 55: gestor (Gestor de Atas e Contratos) vincula empenho -> unidade interna
-- ==============================================================================
-- A migration 33 tirou allocations.manage do 'gestor' (correto: criar/editar
-- alocações é do Gestor de Saldo). Mas isso também o impediu de escolher a
-- unidade interna de um empenho na tela do item, que é o fluxo dele.
--
-- Nova permissão 'allocations.link_empenho': só o vínculo empenho -> alocação já
-- existente, sem criar, editar nem apagar alocações. save_empenho_links_atomic
-- passa a aceitar allocations.manage OU allocations.link_empenho; o restante da
-- função (escopo por alocação, versionamento, delete+insert) é cópia exata da
-- migration 26.
-- ==============================================================================

INSERT INTO public.permissions (key, domain) VALUES
  ('allocations.link_empenho', 'allocations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('admin',         'allocations.link_empenho'),
  ('gestor',        'allocations.link_empenho'),
  ('gestor_saldos', 'allocations.link_empenho')
ON CONFLICT (role_id, permission_key) DO NOTHING;

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
  v_alloc_unit_name VARCHAR(50);
  v_seen_empenhos TEXT[] := ARRAY[]::TEXT[];
  v_key_parts TEXT[];
  v_numero_ata VARCHAR(30);
  v_codigo_uasg VARCHAR(10);
  v_numero_item VARCHAR(10);
  v_ata_id UUID;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO — permission (Fase 2B-2: a checagem antiga baseada
  -- em roles foi substituída por has_permission('allocations.manage'); o
  -- escopo por alocação é verificado por linha no Passo 5)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_permission('allocations.manage') OR public.has_permission('allocations.link_empenho')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a usuários com a permissão allocations.manage ou allocations.link_empenho.'
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

  -- Resolução de ata_id (uma única vez por chamada — todas as linhas do
  -- payload pertencem ao mesmo item_key, só a unidade varia por linha).
  -- Mesma derivação de 20260925000025: item_key -> (numero_ata, codigo_uasg,
  -- numero_item) -> itens_ata (traz ata_id) -> atas_registro_preco.
  v_key_parts := regexp_match(v_item_key, '^([0-9]{5})/([0-9]{4})-([0-9]{6})-([0-9]{5})$');
  v_numero_ata := v_key_parts[1];
  v_codigo_uasg := v_key_parts[3];
  v_numero_item := v_key_parts[4];

  SELECT ia.ata_id INTO v_ata_id
    FROM public.atas_registro_preco arp
    JOIN public.itens_ata ia ON ia.ata_id = arp.id AND ia.numero_item = v_numero_item
   WHERE arp.numero_ata = v_numero_ata
     AND arp.codigo_uasg = v_codigo_uasg;

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
  -- (inclui, por linha: ESCOPO sobre a alocação vinculada — obrigatório
  -- verificar aqui, já que item_key sozinho não garante que todas as
  -- alocações do payload pertencem à mesma unidade)
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

    -- Validação de integridade referencial: allocation_id deve existir e pertencer ao mesmo item_key.
    -- unit_name é obtido do registro persistido (nunca do payload do cliente,
    -- que nem envia esse campo) para servir de base à checagem de escopo abaixo.
    SELECT item_key, unit_name INTO v_alloc_item_key, v_alloc_unit_name
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

    -- ESCOPO (Fase 2B-2): a autorização é derivada da ALOCAÇÃO vinculada
    -- (unit_name persistido) OU da ATA do item — nunca de dado enviado pelo
    -- cliente. GLOBAL é resolvido internamente por has_scope() em qualquer
    -- uma das duas chamadas. Este loop roda inteiramente antes do
    -- DELETE/INSERT do Passo 6: uma falha aqui aborta a transação inteira,
    -- sem gravar nenhum vínculo.
    IF NOT (
      public.has_scope('allocations', 'UNIT', v_alloc_unit_name)
      OR public.has_scope('allocations', 'ARP', v_ata_id::TEXT)
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Usuário sem escopo de alocação sobre a unidade "%" (alocação "%").', v_alloc_unit_name, v_allocation_id
        USING ERRCODE = '42501';
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

-- GRANTs preservados exatamente como já eram: apenas `authenticated` pode
-- chamar; anon/public seguem sem acesso algum. A autorização real acontece
-- inteiramente dentro da função, via has_permission()/has_scope().
REVOKE ALL ON FUNCTION public.save_empenho_links_atomic(TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_empenho_links_atomic(TEXT, JSONB, INTEGER) TO authenticated;
