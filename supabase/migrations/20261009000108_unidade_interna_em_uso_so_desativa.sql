-- ==============================================================================
-- MIGRATION 108: UNIDADE INTERNA EM USO SÓ SE DESATIVA
-- Versão: 20261009000108_unidade_interna_em_uso_so_desativa.sql
--
-- Decisão de 09/10/2026 (protótipo aprovado): unidade interna em uso não pode ser excluída, só
-- desativada; a tela mostra Excluir só para unidade sem uso, Desativar para a em uso e Reativar para
-- a inativa.
--
-- 1) uso_unidade_interna(sigla): o que usa a unidade. Antes a exclusão só olhava arp_allocations;
--    agora conta também contrato_item_divisao_unidades (migration 103, FK sem ON DELETE: a exclusão
--    caía num erro cru do banco) e user_scope_assignments por UNIT (sem FK: a exclusão deixava a
--    permissão solta, e uma unidade nova com a mesma sigla herdava o acesso).
--    As notas de empenho chegam à unidade pela alocação (empenho_links.allocation_id) e
--    empenhos_manuais.unidade_interna_id guarda o id da alocação: já contados pelas alocações.
-- 2) unidades_internas_em_uso(): sigla + em_uso para a tela (só o sim/não, sem os números).
-- 3) delete_internal_department_atomic: usa (1); p_force_deactivate = desativar, nunca apaga.
-- 4) save_allocations_atomic: até aqui, desativar uma unidade travava a edição de TODO item que
--    tivesse alocação dela (a lista inteira é regravada e a unidade inativa era recusada). Agora a
--    unidade inativa fica como está ou diminui; não entra em item novo nem aumenta.
-- 5) Trocar a sigla de uma unidade leva junto as permissões por unidade (as FKs já levavam
--    alocações e divisões por ON UPDATE CASCADE).
-- ==============================================================================

-- 1) O que usa a unidade
CREATE OR REPLACE FUNCTION public.uso_unidade_interna(p_sigla VARCHAR)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'alocacoes', a.n,
    'divisoes', d.n,
    'permissoes', p.n,
    'em_uso', (a.n + d.n + p.n) > 0
  )
  FROM (SELECT COUNT(*)::INTEGER AS n FROM public.arp_allocations WHERE unit_name = p_sigla) a,
       (SELECT COUNT(*)::INTEGER AS n FROM public.contrato_item_divisao_unidades WHERE unit_name = p_sigla) d,
       (SELECT COUNT(*)::INTEGER AS n FROM public.user_scope_assignments WHERE scope_type = 'UNIT' AND scope_value = p_sigla) p;
$$;

REVOKE ALL ON FUNCTION public.uso_unidade_interna(VARCHAR) FROM PUBLIC, anon, authenticated;

-- 2) Para a tela: só se está em uso
CREATE OR REPLACE FUNCTION public.unidades_internas_em_uso()
RETURNS TABLE (sigla VARCHAR, em_uso BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.sigla,
         EXISTS (SELECT 1 FROM public.arp_allocations a WHERE a.unit_name = d.sigla)
      OR EXISTS (SELECT 1 FROM public.contrato_item_divisao_unidades c WHERE c.unit_name = d.sigla)
      OR EXISTS (SELECT 1 FROM public.user_scope_assignments u WHERE u.scope_type = 'UNIT' AND u.scope_value = d.sigla)
    FROM public.internal_departments d
   WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.unidades_internas_em_uso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unidades_internas_em_uso() TO authenticated;

-- 3) Excluir só sem uso; desativar nunca apaga
CREATE OR REPLACE FUNCTION public.delete_internal_department_atomic(
  p_id VARCHAR(50),
  p_force_deactivate BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id VARCHAR(50);
  v_dep RECORD;
  v_uso JSONB;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO — permission (Fase 2B-3: mesma substituição de
  -- save_internal_department_atomic, sem escopo adicional)
  -- --------------------------------------------------------------------------
  IF NOT public.has_permission('departments.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a usuários com a permissão departments.manage.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: LOCALIZAÇÃO DO DEPARTAMENTO
  -- --------------------------------------------------------------------------
  v_id := TRIM(COALESCE(p_id, ''));
  IF v_id = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O identificador do departamento é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dep FROM public.internal_departments WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND: Departamento com ID "%" não encontrado.', v_id
      USING ERRCODE = 'P0002';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: USO DA UNIDADE (migration 108)
  -- Em uso = tem alocação, divisão do contratado (migration 103) ou permissão de usuário por
  -- unidade. Em uso: só desativa. Desativar (p_force_deactivate) nunca apaga.
  -- --------------------------------------------------------------------------
  v_uso := public.uso_unidade_interna(v_dep.sigla);

  IF COALESCE(p_force_deactivate, FALSE) THEN
    UPDATE public.internal_departments
       SET ativo = FALSE,
           updated_at = NOW()
     WHERE id = v_id;

    RETURN jsonb_build_object(
      'success', true,
      'deleted', false,
      'deactivated', true,
      'id', v_id,
      'sigla', v_dep.sigla,
      'allocations_count', (v_uso->>'alocacoes')::INTEGER,
      'message', 'Unidade desativada.'
    );
  END IF;

  IF (v_uso->>'em_uso')::BOOLEAN THEN
    RAISE EXCEPTION 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS: A unidade "%" está em uso (% alocação(ões), % divisão(ões) do contratado, % permissão(ões) de usuário) e não pode ser excluída. Desative-a.',
      v_dep.sigla, v_uso->>'alocacoes', v_uso->>'divisoes', v_uso->>'permissoes'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.internal_departments WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', true,
    'deactivated', false,
    'id', v_id,
    'sigla', v_dep.sigla,
    'allocations_count', 0,
    'message', 'Unidade excluída.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_internal_department_atomic(VARCHAR, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_internal_department_atomic(VARCHAR, BOOLEAN) TO authenticated;

-- 4) Alocações: unidade desativada fica como está ou diminui
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
  v_dep_ativo BOOLEAN;
  v_prev_count INTEGER;
  v_prev_qty NUMERIC(18, 4);
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

    -- Validação de integridade referencial do departamento.
    -- Migration 108: unidade DESATIVADA continua no item como já estava (a lista inteira do item é
    -- regravada a cada edição); só não entra em item novo nem aumenta a quantidade alocada.
    SELECT ativo INTO v_dep_ativo
      FROM public.internal_departments
     WHERE sigla = v_unit_name;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_DEPARTMENT: Departamento "%" não existe no catálogo oficial.', v_unit_name
        USING ERRCODE = '23503';
    END IF;

    IF v_dep_ativo IS NOT TRUE THEN
      SELECT COUNT(*), COALESCE(SUM(allocated_qty), 0)
        INTO v_prev_count, v_prev_qty
        FROM public.arp_allocations
       WHERE item_key = v_item_key
         AND unit_name = v_unit_name;
      IF v_prev_count = 0 THEN
        RAISE EXCEPTION 'INACTIVE_DEPARTMENT: A unidade "%" está desativada e não pode receber novas alocações.', v_unit_name
          USING ERRCODE = '22023';
      END IF;
      IF v_allocated_qty > v_prev_qty THEN
        RAISE EXCEPTION 'INACTIVE_DEPARTMENT: A unidade "%" está desativada: a alocação dela pode ficar como está ou diminuir, mas não aumentar (hoje: %).', v_unit_name, trim_scale(v_prev_qty)
          USING ERRCODE = '22023';
      END IF;
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

-- 5) Sigla trocada leva as permissões por unidade
CREATE OR REPLACE FUNCTION public.trg_unidade_interna_sigla_permissoes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Quem já tinha permissão com a sigla nova (sobra de uma unidade apagada) fica com uma só.
  UPDATE public.user_scope_assignments usa
     SET scope_value = NEW.sigla
   WHERE usa.scope_type = 'UNIT'
     AND usa.scope_value = OLD.sigla
     AND NOT EXISTS (
       SELECT 1 FROM public.user_scope_assignments o
        WHERE o.user_id = usa.user_id AND o.domain = usa.domain
          AND o.scope_type = 'UNIT' AND o.scope_value = NEW.sigla
     );
  DELETE FROM public.user_scope_assignments
   WHERE scope_type = 'UNIT'
     AND scope_value = OLD.sigla;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_unidade_interna_sigla_permissoes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_unidade_interna_sigla_permissoes ON public.internal_departments;
CREATE TRIGGER trg_unidade_interna_sigla_permissoes
  AFTER UPDATE OF sigla ON public.internal_departments
  FOR EACH ROW
  WHEN (OLD.sigla IS DISTINCT FROM NEW.sigla)
  EXECUTE FUNCTION public.trg_unidade_interna_sigla_permissoes();
