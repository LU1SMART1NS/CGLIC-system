-- ==============================================================================
-- MIGRATION 17: RPCs TRANSACIONAIS ATÔMICAS DE EMPENHOS — SALDOARP 3.0
-- Versão: 20260924000017_rpc_empenhos_atomic.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P6 (Auditabilidade), P7 (Least Privilege)
-- Resoluções: FASE 7.2-B (Planejamento Técnico e Arquitetural de RPCs Soberanas)
-- Tabelas Alvo: public.empenhos, public.arp_item_empenhos, public.contrato_empenhos, public.empenho_eventos_historico
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC: save_empenho_soberano_atomic
-- ------------------------------------------------------------------------------
-- Responsabilidade: Criar ou reconciliar a Nota de Empenho soberana com idempotência
-- estrita por canonical_key ({uasg}-{ano}-{numeroNormalizado}), controle de concorrência
-- via advisory lock e proteção de proveniência (dados oficiais jamais sobrescritos por manuais).
CREATE OR REPLACE FUNCTION public.save_empenho_soberano_atomic(
  p_empenho JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uasg VARCHAR(10);
  v_ano INTEGER;
  v_numero_oficial VARCHAR(50);
  v_numero_norm VARCHAR(50);
  v_canonical_key VARCHAR(100);
  v_data_emissao_str VARCHAR(50);
  v_data_emissao DATE;
  v_fonte_origem VARCHAR(20);
  v_valor_empenhado NUMERIC(18, 4);
  v_valor_liquidado NUMERIC(18, 4);
  v_valor_pago NUMERIC(18, 4);
  v_valor_rpinscrito NUMERIC(18, 4);
  v_credor_nome VARCHAR(255);
  v_credor_cnpj_cpf VARCHAR(20);
  v_situacao VARCHAR(50);
  v_identificador_fonte VARCHAR(100);
  v_url_oficial TEXT;
  v_existing RECORD;
  v_record RECORD;
  v_is_new BOOLEAN := false;
  v_informado_manualmente BOOLEAN := false;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: HIGIENIZAÇÃO E VALIDAÇÃO DO PAYLOAD
  -- --------------------------------------------------------------------------
  IF p_empenho IS NULL OR jsonb_typeof(p_empenho) != 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O parâmetro p_empenho deve ser um objeto JSONB válido.'
      USING ERRCODE = '22023';
  END IF;

  v_uasg := TRIM(COALESCE(p_empenho->>'uasg_emitente', p_empenho->>'uasg', ''));
  IF v_uasg = '' OR NOT (v_uasg ~ '^[0-9]{6}$') THEN
    RAISE EXCEPTION 'INVALID_UASG: UASG emitente inválida (deve conter exatamente 6 dígitos numéricos). Valor: "%"', v_uasg
      USING ERRCODE = '22023';
  END IF;

  v_ano := (COALESCE(p_empenho->>'ano_exercicio', p_empenho->>'ano', '0'))::INTEGER;
  IF v_ano < 2000 OR v_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_ANO: Ano de exercício deve estar entre 2000 e 2100. Valor: %', v_ano
      USING ERRCODE = '22023';
  END IF;

  v_numero_oficial := TRIM(COALESCE(p_empenho->>'numero_oficial', p_empenho->>'numero', ''));
  IF v_numero_oficial = '' THEN
    RAISE EXCEPTION 'INVALID_NUMERO_OFICIAL: O número oficial do empenho é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  v_numero_norm := TRIM(COALESCE(p_empenho->>'numero_normalizado', ''));
  IF v_numero_norm = '' THEN
    v_numero_norm := regexp_replace(UPPER(v_numero_oficial), '[^A-Z0-9]', '', 'g');
    IF v_numero_norm = '' THEN
      v_numero_norm := v_numero_oficial;
    END IF;
  END IF;

  -- Chave canônica determinística SSOT: {uasg}-{ano}-{numeroNormalizado}
  v_canonical_key := v_uasg || '-' || v_ano::TEXT || '-' || v_numero_norm;

  v_data_emissao_str := TRIM(COALESCE(p_empenho->>'data_emissao', ''));
  IF v_data_emissao_str = '' THEN
    RAISE EXCEPTION 'INVALID_DATA_EMISSAO: A data de emissão é obrigatória.'
      USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_data_emissao := v_data_emissao_str::DATE;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_DATA_EMISSAO: Formato de data de emissão inválido ("%"). Esperado YYYY-MM-DD.', v_data_emissao_str
      USING ERRCODE = '22023';
  END;

  v_fonte_origem := UPPER(TRIM(COALESCE(p_empenho->>'fonte_origem', 'MANUAL')));
  IF v_fonte_origem NOT IN ('COMPRASNET', 'CONTRATOSNET', 'PNCP', 'MANUAL', 'SINCRONIZADO') THEN
    RAISE EXCEPTION 'INVALID_FONTE_ORIGEM: Fonte de origem inválida ("%"). Permitidos: COMPRASNET, CONTRATOSNET, PNCP, MANUAL, SINCRONIZADO.', v_fonte_origem
      USING ERRCODE = '22023';
  END IF;

  v_valor_empenhado := COALESCE((p_empenho->>'valor_empenhado')::NUMERIC, 0);
  v_valor_liquidado := COALESCE((p_empenho->>'valor_liquidado')::NUMERIC, 0);
  v_valor_pago := COALESCE((p_empenho->>'valor_pago')::NUMERIC, 0);
  v_valor_rpinscrito := COALESCE((p_empenho->>'valor_rpinscrito')::NUMERIC, 0);

  IF v_valor_empenhado < 0 OR v_valor_liquidado < 0 OR v_valor_pago < 0 OR v_valor_rpinscrito < 0 THEN
    RAISE EXCEPTION 'INVALID_FINANCIAL_VALUE: Valores financeiros de empenho não podem ser negativos.'
      USING ERRCODE = '22023';
  END IF;

  v_credor_nome := NULLIF(TRIM(COALESCE(p_empenho->>'credor_nome', '')), '');
  v_credor_cnpj_cpf := NULLIF(TRIM(COALESCE(p_empenho->>'credor_cnpj_cpf', '')), '');
  v_situacao := NULLIF(TRIM(COALESCE(p_empenho->>'situacao', '')), '');
  v_identificador_fonte := NULLIF(TRIM(COALESCE(p_empenho->>'identificador_fonte', '')), '');
  v_url_oficial := NULLIF(TRIM(COALESCE(p_empenho->>'url_oficial', '')), '');

  -- --------------------------------------------------------------------------
  -- PASSO 3: ISOLAMENTO E CONTROLE DE CONCORRÊNCIA (ADVISORY LOCK)
  -- --------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('save_empenho:' || v_canonical_key));

  -- --------------------------------------------------------------------------
  -- PASSO 4: UPSERT E RECONCILIAÇÃO COM PROTEÇÃO DE PROVENIÊNCIA
  -- --------------------------------------------------------------------------
  SELECT * INTO v_existing FROM public.empenhos WHERE canonical_key = v_canonical_key;

  IF NOT FOUND THEN
    -- Inserção de Novo Empenho
    v_is_new := true;
    v_informado_manualmente := (v_fonte_origem = 'MANUAL');

    INSERT INTO public.empenhos (
      canonical_key,
      numero_oficial,
      ano_exercicio,
      uasg_emitente,
      numero_normalizado,
      data_emissao,
      valor_empenhado,
      valor_liquidado,
      valor_pago,
      valor_rpinscrito,
      credor_nome,
      credor_cnpj_cpf,
      situacao,
      fonte_origem,
      informado_manualmente_inicialmente,
      identificador_fonte,
      url_oficial,
      last_synced_at
    ) VALUES (
      v_canonical_key,
      v_numero_oficial,
      v_ano,
      v_uasg,
      v_numero_norm,
      v_data_emissao,
      v_valor_empenhado,
      v_valor_liquidado,
      v_valor_pago,
      v_valor_rpinscrito,
      v_credor_nome,
      v_credor_cnpj_cpf,
      v_situacao,
      v_fonte_origem,
      v_informado_manualmente,
      v_identificador_fonte,
      v_url_oficial,
      CASE WHEN v_fonte_origem <> 'MANUAL' THEN NOW() ELSE NULL END
    ) RETURNING * INTO v_record;

    -- Registro do evento funcional inicial no histórico
    INSERT INTO public.empenho_eventos_historico (
      empenho_id,
      data_evento,
      tipo_evento,
      delta_valor,
      metadados
    ) VALUES (
      v_record.id,
      v_data_emissao,
      'EMISSAO_INICIAL',
      v_valor_empenhado,
      jsonb_build_object(
        'evento', 'CRIADO',
        'fonte_origem', v_fonte_origem,
        'canonical_key', v_canonical_key
      )
    );

  ELSE
    -- Empenho já existe: reconciliação ou atualização controlada
    v_is_new := false;

    -- REGRA DE PROTEÇÃO CONTÁBIL:
    -- Se registro existente possui fonte oficial e payload é MANUAL, NÃO sobrescreve fatos oficiais
    IF v_existing.fonte_origem IN ('COMPRASNET', 'CONTRATOSNET', 'PNCP', 'SINCRONIZADO') AND v_fonte_origem = 'MANUAL' THEN
      UPDATE public.empenhos
      SET
        identificador_fonte = COALESCE(v_identificador_fonte, empenhos.identificador_fonte),
        url_oficial = COALESCE(v_url_oficial, empenhos.url_oficial),
        updated_at = NOW()
      WHERE id = v_existing.id
      RETURNING * INTO v_record;

    -- PROMOÇÃO MANUAL -> SINCRONIZADO:
    -- Se registro existente era MANUAL e payload é oficial, promove preservando informado_manualmente_inicialmente
    ELSIF v_existing.fonte_origem = 'MANUAL' AND v_fonte_origem IN ('COMPRASNET', 'CONTRATOSNET', 'PNCP', 'SINCRONIZADO') THEN
      UPDATE public.empenhos
      SET
        numero_oficial = v_numero_oficial,
        data_emissao = v_data_emissao,
        valor_empenhado = v_valor_empenhado,
        valor_liquidado = v_valor_liquidado,
        valor_pago = v_valor_pago,
        valor_rpinscrito = v_valor_rpinscrito,
        credor_nome = COALESCE(v_credor_nome, empenhos.credor_nome),
        credor_cnpj_cpf = COALESCE(v_credor_cnpj_cpf, empenhos.credor_cnpj_cpf),
        situacao = COALESCE(v_situacao, empenhos.situacao),
        fonte_origem = 'SINCRONIZADO',
        identificador_fonte = COALESCE(v_identificador_fonte, empenhos.identificador_fonte),
        url_oficial = COALESCE(v_url_oficial, empenhos.url_oficial),
        last_synced_at = NOW(),
        updated_at = NOW()
      WHERE id = v_existing.id
      RETURNING * INTO v_record;

      INSERT INTO public.empenho_eventos_historico (
        empenho_id,
        data_evento,
        tipo_evento,
        delta_valor,
        metadados
      ) VALUES (
        v_record.id,
        CURRENT_DATE,
        'AJUSTE_AUDITORIA',
        v_valor_empenhado - v_existing.valor_empenhado,
        jsonb_build_object(
          'evento', 'RECONCILIADO',
          'fonte_origem_anterior', v_existing.fonte_origem,
          'fonte_origem_nova', 'SINCRONIZADO',
          'last_synced_at', NOW()
        )
      );

    -- ATUALIZAÇÃO OFICIAL -> OFICIAL OU MANUAL -> MANUAL
    ELSE
      UPDATE public.empenhos
      SET
        numero_oficial = v_numero_oficial,
        data_emissao = v_data_emissao,
        valor_empenhado = v_valor_empenhado,
        valor_liquidado = v_valor_liquidado,
        valor_pago = v_valor_pago,
        valor_rpinscrito = v_valor_rpinscrito,
        credor_nome = COALESCE(v_credor_nome, empenhos.credor_nome),
        credor_cnpj_cpf = COALESCE(v_credor_cnpj_cpf, empenhos.credor_cnpj_cpf),
        situacao = COALESCE(v_situacao, empenhos.situacao),
        fonte_origem = CASE WHEN v_fonte_origem = 'MANUAL' THEN empenhos.fonte_origem ELSE v_fonte_origem END,
        identificador_fonte = COALESCE(v_identificador_fonte, empenhos.identificador_fonte),
        url_oficial = COALESCE(v_url_oficial, empenhos.url_oficial),
        last_synced_at = CASE WHEN v_fonte_origem <> 'MANUAL' THEN NOW() ELSE empenhos.last_synced_at END,
        updated_at = NOW()
      WHERE id = v_existing.id
      RETURNING * INTO v_record;

      IF (v_valor_empenhado - v_existing.valor_empenhado) <> 0 THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id,
          data_evento,
          tipo_evento,
          delta_valor,
          metadados
        ) VALUES (
          v_record.id,
          CURRENT_DATE,
          CASE WHEN (v_valor_empenhado - v_existing.valor_empenhado) > 0 THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
          v_valor_empenhado - v_existing.valor_empenhado,
          jsonb_build_object(
            'evento', 'RECONCILIADO',
            'fonte_origem', v_record.fonte_origem
          )
        );
      END IF;
    END IF;

  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 5: RESPOSTA JSONB ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'is_new', v_is_new,
    'empenho', jsonb_build_object(
      'id', v_record.id,
      'canonical_key', v_record.canonical_key,
      'numero_oficial', v_record.numero_oficial,
      'ano_exercicio', v_record.ano_exercicio,
      'uasg_emitente', v_record.uasg_emitente,
      'data_emissao', v_record.data_emissao,
      'valor_empenhado', v_record.valor_empenhado,
      'valor_liquidado', v_record.valor_liquidado,
      'valor_pago', v_record.valor_pago,
      'valor_rpinscrito', v_record.valor_rpinscrito,
      'credor_nome', v_record.credor_nome,
      'credor_cnpj_cpf', v_record.credor_cnpj_cpf,
      'situacao', v_record.situacao,
      'fonte_origem', v_record.fonte_origem,
      'informado_manualmente_inicialmente', v_record.informado_manualmente_inicialmente,
      'last_synced_at', v_record.last_synced_at,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

COMMENT ON FUNCTION public.save_empenho_soberano_atomic(JSONB) IS
  'Salva ou reconcilia nota de empenho soberana com idempotência e proteção de proveniência.';

-- ------------------------------------------------------------------------------
-- 2. RPC: link_empenho_to_item_atomic
-- ------------------------------------------------------------------------------
-- Responsabilidade: Vincular Nota de Empenho soberana ao item de Ata de Registro de Preços,
-- debitando fisicamente o quantitativo com validação de formato e registro na série temporal.
CREATE OR REPLACE FUNCTION public.link_empenho_to_item_atomic(
  p_item_key VARCHAR,
  p_empenho_id UUID,
  p_quantidade_consumida NUMERIC,
  p_tipo_consumo VARCHAR DEFAULT 'ORDINARIO',
  p_numero_item_minuta VARCHAR DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100);
  v_tipo_consumo VARCHAR(20);
  v_empenho_id_check UUID;
  v_existing_link RECORD;
  v_record RECORD;
  v_delta_qtd NUMERIC(18, 4);
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: HIGIENIZAÇÃO E VALIDAÇÃO DOS PARÂMETROS
  -- --------------------------------------------------------------------------
  v_item_key := TRIM(COALESCE(p_item_key, ''));
  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF p_empenho_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_EMPENHO_ID: O identificador do empenho é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidade_consumida IS NULL OR p_quantidade_consumida < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade consumida não pode ser negativa.'
      USING ERRCODE = '22023';
  END IF;

  v_tipo_consumo := UPPER(TRIM(COALESCE(p_tipo_consumo, 'ORDINARIO')));
  IF v_tipo_consumo NOT IN ('ORDINARIO', 'REFORCO', 'AJUSTE_MANUAL') THEN
    RAISE EXCEPTION 'INVALID_TIPO_CONSUMO: Tipo de consumo inválido ("%"). Permitidos: ORDINARIO, REFORCO, AJUSTE_MANUAL.', v_tipo_consumo
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: VERIFICAÇÃO DE EXISTÊNCIA DO EMPENHO PAI
  -- --------------------------------------------------------------------------
  SELECT id INTO v_empenho_id_check FROM public.empenhos WHERE id = p_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMPENHO_NOT_FOUND: Empenho com ID "%" não encontrado.', p_empenho_id
      USING ERRCODE = 'P0002';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 4: ISOLAMENTO E CONTROLE DE CONCORRÊNCIA (ADVISORY LOCK)
  -- --------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('link_item:' || v_item_key || ':' || p_empenho_id::TEXT));

  -- --------------------------------------------------------------------------
  -- PASSO 5: UPSERT EM public.arp_item_empenhos E REGISTRO HISTÓRICO
  -- --------------------------------------------------------------------------
  SELECT * INTO v_existing_link
  FROM public.arp_item_empenhos
  WHERE item_key = v_item_key AND empenho_id = p_empenho_id;

  IF FOUND THEN
    v_delta_qtd := p_quantidade_consumida - v_existing_link.quantidade_consumida;

    UPDATE public.arp_item_empenhos
    SET
      quantidade_consumida = p_quantidade_consumida,
      tipo_consumo = v_tipo_consumo,
      numero_item_minuta = COALESCE(NULLIF(TRIM(COALESCE(p_numero_item_minuta, '')), ''), arp_item_empenhos.numero_item_minuta),
      observacoes = CASE WHEN p_observacoes IS NOT NULL THEN NULLIF(TRIM(p_observacoes), '') ELSE arp_item_empenhos.observacoes END,
      updated_at = NOW()
    WHERE id = v_existing_link.id
    RETURNING * INTO v_record;

    IF v_delta_qtd <> 0 THEN
      INSERT INTO public.empenho_eventos_historico (
        empenho_id,
        item_key,
        data_evento,
        tipo_evento,
        delta_quantidade,
        metadados
      ) VALUES (
        p_empenho_id,
        v_item_key,
        CURRENT_DATE,
        CASE WHEN v_delta_qtd > 0 THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
        v_delta_qtd,
        jsonb_build_object(
          'evento', 'VINCULADO_ITEM',
          'acao', 'ATUALIZACAO_QUANTIDADE',
          'tipo_consumo', v_tipo_consumo,
          'observacoes', p_observacoes
        )
      );
    END IF;

  ELSE
    INSERT INTO public.arp_item_empenhos (
      item_key,
      empenho_id,
      quantidade_consumida,
      tipo_consumo,
      numero_item_minuta,
      observacoes
    ) VALUES (
      v_item_key,
      p_empenho_id,
      p_quantidade_consumida,
      v_tipo_consumo,
      NULLIF(TRIM(COALESCE(p_numero_item_minuta, '')), ''),
      NULLIF(TRIM(COALESCE(p_observacoes, '')), '')
    ) RETURNING * INTO v_record;

    INSERT INTO public.empenho_eventos_historico (
      empenho_id,
      item_key,
      data_evento,
      tipo_evento,
      delta_quantidade,
      metadados
    ) VALUES (
      p_empenho_id,
      v_item_key,
      CURRENT_DATE,
      CASE WHEN v_tipo_consumo = 'REFORCO' THEN 'REFORCO' ELSE 'EMISSAO_INICIAL' END,
      p_quantidade_consumida,
      jsonb_build_object(
        'evento', 'VINCULADO_ITEM',
        'tipo_consumo', v_tipo_consumo,
        'observacoes', p_observacoes
      )
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 6: RESPOSTA JSONB ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'link', jsonb_build_object(
      'id', v_record.id,
      'item_key', v_record.item_key,
      'empenho_id', v_record.empenho_id,
      'quantidade_consumida', v_record.quantidade_consumida,
      'tipo_consumo', v_record.tipo_consumo,
      'numero_item_minuta', v_record.numero_item_minuta,
      'observacoes', v_record.observacoes,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

COMMENT ON FUNCTION public.link_empenho_to_item_atomic(VARCHAR, UUID, NUMERIC, VARCHAR, VARCHAR, TEXT) IS
  'Vincula empenho a item de Ata com débito físico-quantitativo e registro na série temporal.';

-- ------------------------------------------------------------------------------
-- 3. RPC: unlink_empenho_from_item_atomic
-- ------------------------------------------------------------------------------
-- Responsabilidade: Desvincular empenho de item de Ata em public.arp_item_empenhos,
-- estornando o consumo físico no histórico sem jamais excluir a Nota de Empenho soberana.
CREATE OR REPLACE FUNCTION public.unlink_empenho_from_item_atomic(
  p_link_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link RECORD;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: VALIDAÇÃO DO IDENTIFICADOR DO VÍNCULO
  -- --------------------------------------------------------------------------
  IF p_link_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_LINK_ID: O identificador do vínculo é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: ISOLAMENTO E BUSCA DO VÍNCULO
  -- --------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('unlink_item:' || p_link_id::TEXT));

  SELECT * INTO v_link FROM public.arp_item_empenhos WHERE id = p_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LINK_NOT_FOUND: Vínculo item-empenho com ID "%" não encontrado.', p_link_id
      USING ERRCODE = 'P0002';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 4: REGISTRO DO EVENTO DE ESTORNO NO HISTÓRICO
  -- --------------------------------------------------------------------------
  INSERT INTO public.empenho_eventos_historico (
    empenho_id,
    item_key,
    data_evento,
    tipo_evento,
    delta_quantidade,
    metadados
  ) VALUES (
    v_link.empenho_id,
    v_link.item_key,
    CURRENT_DATE,
    'CANCELAMENTO_TOTAL',
    -v_link.quantidade_consumida,
    jsonb_build_object(
      'evento', 'DESVINCULADO_ITEM',
      'link_id', p_link_id,
      'quantidade_estornada', v_link.quantidade_consumida
    )
  );

  -- --------------------------------------------------------------------------
  -- PASSO 5: EXCLUSÃO DO VÍNCULO (EMPENHO PAI PERMANECE INTACTO)
  -- --------------------------------------------------------------------------
  DELETE FROM public.arp_item_empenhos WHERE id = p_link_id;

  RETURN jsonb_build_object(
    'success', true,
    'unlinked_id', p_link_id,
    'empenho_id', v_link.empenho_id,
    'item_key', v_link.item_key,
    'quantidade_estornada', v_link.quantidade_consumida
  );
END;
$$;

COMMENT ON FUNCTION public.unlink_empenho_from_item_atomic(UUID) IS
  'Desvincula empenho de item de Ata com estorno histórico, mantendo empenho intacto.';

-- ------------------------------------------------------------------------------
-- 4. RPC: link_empenho_to_contract_atomic
-- ------------------------------------------------------------------------------
-- Responsabilidade: Vincular Nota de Empenho como lastro orçamentário/financeiro de
-- Contrato Oficial em public.contrato_empenhos, suportando contratos com ou sem Ata.
CREATE OR REPLACE FUNCTION public.link_empenho_to_contract_atomic(
  p_contract_key VARCHAR,
  p_empenho_id UUID,
  p_valor_vinculado NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150);
  v_empenho_id_check UUID;
  v_existing_link RECORD;
  v_record RECORD;
  v_delta_valor NUMERIC(18, 4);
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: HIGIENIZAÇÃO E VALIDAÇÃO DOS PARÂMETROS
  -- --------------------------------------------------------------------------
  v_contract_key := TRIM(COALESCE(p_contract_key, ''));
  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: A contract_key é obrigatória e não pode ser vazia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_empenho_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_EMPENHO_ID: O identificador do empenho é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF p_valor_vinculado IS NOT NULL AND p_valor_vinculado < 0 THEN
    RAISE EXCEPTION 'INVALID_VALUE: O valor vinculado não pode ser negativo.'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: VERIFICAÇÃO DE EXISTÊNCIA DO EMPENHO PAI
  -- --------------------------------------------------------------------------
  SELECT id INTO v_empenho_id_check FROM public.empenhos WHERE id = p_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMPENHO_NOT_FOUND: Empenho com ID "%" não encontrado.', p_empenho_id
      USING ERRCODE = 'P0002';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 4: ISOLAMENTO E CONTROLE DE CONCORRÊNCIA (ADVISORY LOCK)
  -- --------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('link_ctr:' || v_contract_key || ':' || p_empenho_id::TEXT));

  -- --------------------------------------------------------------------------
  -- PASSO 5: UPSERT EM public.contrato_empenhos E REGISTRO HISTÓRICO
  -- --------------------------------------------------------------------------
  SELECT * INTO v_existing_link
  FROM public.contrato_empenhos
  WHERE contract_key = v_contract_key AND empenho_id = p_empenho_id;

  IF FOUND THEN
    v_delta_valor := COALESCE(p_valor_vinculado, 0) - COALESCE(v_existing_link.valor_vinculado, 0);

    UPDATE public.contrato_empenhos
    SET
      valor_vinculado = COALESCE(p_valor_vinculado, contrato_empenhos.valor_vinculado),
      updated_at = NOW()
    WHERE id = v_existing_link.id
    RETURNING * INTO v_record;

    IF v_delta_valor <> 0 THEN
      INSERT INTO public.empenho_eventos_historico (
        empenho_id,
        contract_key,
        data_evento,
        tipo_evento,
        delta_valor,
        metadados
      ) VALUES (
        p_empenho_id,
        v_contract_key,
        CURRENT_DATE,
        CASE WHEN v_delta_valor > 0 THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
        v_delta_valor,
        jsonb_build_object(
          'evento', 'VINCULADO_CONTRATO',
          'acao', 'ATUALIZACAO_VALOR',
          'contract_key', v_contract_key
        )
      );
    END IF;

  ELSE
    INSERT INTO public.contrato_empenhos (
      contract_key,
      empenho_id,
      valor_vinculado
    ) VALUES (
      v_contract_key,
      p_empenho_id,
      p_valor_vinculado
    ) RETURNING * INTO v_record;

    INSERT INTO public.empenho_eventos_historico (
      empenho_id,
      contract_key,
      data_evento,
      tipo_evento,
      delta_valor,
      metadados
    ) VALUES (
      p_empenho_id,
      v_contract_key,
      CURRENT_DATE,
      'EMISSAO_INICIAL',
      COALESCE(p_valor_vinculado, 0),
      jsonb_build_object(
        'evento', 'VINCULADO_CONTRATO',
        'contract_key', v_contract_key
      )
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 6: RESPOSTA JSONB ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'link', jsonb_build_object(
      'id', v_record.id,
      'contract_key', v_record.contract_key,
      'empenho_id', v_record.empenho_id,
      'valor_vinculado', v_record.valor_vinculado,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

COMMENT ON FUNCTION public.link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC) IS
  'Vincula empenho como lastro financeiro de contrato oficial com suporte a múltiplos empenhos (N:N).';

-- ------------------------------------------------------------------------------
-- 5. RPC: unlink_empenho_from_contract_atomic
-- ------------------------------------------------------------------------------
-- Responsabilidade: Desvincular empenho de Contrato Oficial em public.contrato_empenhos,
-- registrando estorno no histórico sem jamais excluir a Nota de Empenho soberana.
CREATE OR REPLACE FUNCTION public.unlink_empenho_from_contract_atomic(
  p_link_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link RECORD;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: VALIDAÇÃO DO IDENTIFICADOR DO VÍNCULO
  -- --------------------------------------------------------------------------
  IF p_link_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_LINK_ID: O identificador do vínculo é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: ISOLAMENTO E BUSCA DO VÍNCULO
  -- --------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('unlink_ctr:' || p_link_id::TEXT));

  SELECT * INTO v_link FROM public.contrato_empenhos WHERE id = p_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LINK_NOT_FOUND: Vínculo contrato-empenho com ID "%" não encontrado.', p_link_id
      USING ERRCODE = 'P0002';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 4: REGISTRO DO EVENTO DE ESTORNO NO HISTÓRICO
  -- --------------------------------------------------------------------------
  INSERT INTO public.empenho_eventos_historico (
    empenho_id,
    contract_key,
    data_evento,
    tipo_evento,
    delta_valor,
    metadados
  ) VALUES (
    v_link.empenho_id,
    v_link.contract_key,
    CURRENT_DATE,
    'CANCELAMENTO_TOTAL',
    -COALESCE(v_link.valor_vinculado, 0),
    jsonb_build_object(
      'evento', 'DESVINCULADO_CONTRATO',
      'link_id', p_link_id,
      'valor_estornado', v_link.valor_vinculado
    )
  );

  -- --------------------------------------------------------------------------
  -- PASSO 5: EXCLUSÃO DO VÍNCULO (EMPENHO PAI PERMANECE INTACTO)
  -- --------------------------------------------------------------------------
  DELETE FROM public.contrato_empenhos WHERE id = p_link_id;

  RETURN jsonb_build_object(
    'success', true,
    'unlinked_id', p_link_id,
    'empenho_id', v_link.empenho_id,
    'contract_key', v_link.contract_key,
    'valor_estornado', v_link.valor_vinculado
  );
END;
$$;

COMMENT ON FUNCTION public.unlink_empenho_from_contract_atomic(UUID) IS
  'Desvincula empenho de contrato oficial com estorno histórico, mantendo empenho intacto.';

-- ------------------------------------------------------------------------------
-- 6. PERMISSÕES E HARDENING DE SEGURANÇA (P7 - LEAST PRIVILEGE)
-- ------------------------------------------------------------------------------
-- Revoga execução pública e anônima; concede estritamente a authenticated.
-- O controle fino de perfil é reforçado internamente pelas RPCs via public.has_role.
REVOKE ALL ON FUNCTION public.save_empenho_soberano_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_empenho_soberano_atomic(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.link_empenho_to_item_atomic(VARCHAR, UUID, NUMERIC, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_empenho_to_item_atomic(VARCHAR, UUID, NUMERIC, VARCHAR, VARCHAR, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.unlink_empenho_from_item_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_empenho_from_item_atomic(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC) TO authenticated;

REVOKE ALL ON FUNCTION public.unlink_empenho_from_contract_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_empenho_from_contract_atomic(UUID) TO authenticated;
