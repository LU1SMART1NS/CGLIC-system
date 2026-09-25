-- ==============================================================================
-- MIGRATION 25: FASE 2B-1 — MIGRAÇÃO DE save_allocations_atomic PARA
-- has_permission()/has_scope()
-- ==============================================================================
-- Escopo estrito desta migration: SOMENTE save_allocations_atomic. Nenhuma
-- outra RPC (save_empenho_links_atomic, departamentos, contratos, SEI,
-- financeiro, governança) é tocada. has_role() permanece intacta e continua
-- em uso por todas as outras RPCs.
--
-- O QUE MUDA: a autorização, exclusivamente.
--   ANTES: has_role('gestor') OR has_role('admin')  -- sem escopo, tudo ou nada
--   DEPOIS: has_permission('allocations.manage')
--           AND (has_scope('allocations','UNIT', unit_name)
--                OR has_scope('allocations','ARP', ata_id))
--
-- Não há bypass via has_role(): um usuário com role 'gestor' só continua
-- autorizado porque a Fase 1 fez o backfill de role_permissions/
-- role_domain_scopes refletindo fielmente o comportamento atual de 'gestor'
-- (allocations.manage + escopo GLOBAL) — não porque o código ainda consulta
-- has_role() em algum ponto. Isso é verificado explicitamente pelos testes
-- desta fase (Caso 12).
--
-- O restante da função (cálculo de saldo, validação de quantidade, formato do
-- payload, ordenação, delete+insert, optimistic locking por versão, formato
-- do retorno) é uma cópia EXATA de 20260917000006_backend_authority_hardening.sql,
-- sem nenhuma alteração de negócio.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- RESOLUÇÃO item_key -> ata_id (reaproveitando o modelo existente, sem
-- duplicar ata_id em arp_allocations)
-- ------------------------------------------------------------------------------
-- item_key já é validado antes (regex ^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$),
-- no formato numero_ata/ano_compra-codigo_uasg-numero_item (ex.: 00037/2026-200331-00001).
-- A cadeia usada é exatamente a documentada: item_key -> (numero_ata,
-- codigo_uasg, numero_item) -> itens_ata (que carrega ata_id) -> atas_registro_preco.
-- ano_compra é extraído do item_key mas não participa da busca porque a chave
-- relacional real de uma ata é UNIQUE(numero_ata, codigo_uasg)
-- (20260917000001_canonical_schema.sql) — usar também ano_compra seria
-- redundante e não é garantido pela constraint existente.
--
-- Todas as linhas de um único payload de save_allocations_atomic pertencem ao
-- MESMO item_key (só unit_name varia por linha) — por isso ata_id é resolvido
-- UMA ÚNICA VEZ por chamada, não por linha.
--
-- Se a ata/item não estiver no cache local (nunca sincronizada), v_ata_id fica
-- NULL: has_scope('allocations','ARP', NULL) nunca casará com nenhuma
-- atribuição (comparação NULL-safe, sem erro), então essa via de autorização
-- simplesmente não se aplica — usuários GLOBAL ou UNIT continuam funcionando
-- normalmente, só a via ARP fica indisponível para um item não cacheado.

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
  v_key_parts TEXT[];
  v_numero_ata VARCHAR(30);
  v_codigo_uasg VARCHAR(10);
  v_numero_item VARCHAR(10);
  v_ata_id UUID;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO — permission (Fase 2B-1: a checagem antiga baseada
  -- em roles foi substituída por has_permission; o escopo por unidade/ATA é
  -- verificado por linha no Passo 5)
  -- --------------------------------------------------------------------------
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a usuários com a permissão allocations.manage.'
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

  -- Resolução de ata_id (uma única vez por chamada — ver comentário acima).
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
  -- (inclui, por linha: permissão já confirmada no Passo 1 + ESCOPO por
  -- unidade/ATA — obrigatório verificar aqui, não só uma vez para o usuário)
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

    -- ESCOPO (Fase 2B-1): esta linha, especificamente, precisa estar dentro
    -- do alcance do usuário — por unidade OU pela ATA do item (o que for
    -- concedido). GLOBAL já é resolvido internamente por has_scope() em
    -- qualquer uma das duas chamadas. Nenhuma linha autorizada é persistida
    -- se QUALQUER outra linha do mesmo payload falhar aqui: este loop roda
    -- inteiramente antes do DELETE/INSERT do Passo 6, então uma exceção
    -- aqui aborta a transação inteira sem gravar nada.
    IF NOT (
      public.has_scope('allocations', 'UNIT', v_unit_name)
      OR public.has_scope('allocations', 'ARP', v_ata_id::TEXT)
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Usuário sem escopo de alocação sobre a unidade "%".', v_unit_name
        USING ERRCODE = '42501';
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

-- GRANTs preservados exatamente como já eram (migration 06): apenas
-- `authenticated` pode chamar; anon/public seguem sem acesso algum. A
-- autorização real acontece inteiramente dentro da função, via
-- has_permission()/has_scope().
REVOKE ALL ON FUNCTION public.save_allocations_atomic(TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_allocations_atomic(TEXT, JSONB, INTEGER) TO authenticated;
