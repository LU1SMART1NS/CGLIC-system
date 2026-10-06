-- ==============================================================================
-- MIGRATION 81: CICLO DE VIDA DO VÍNCULO EMPENHO ↔ CONTRATO
-- Versão: 20261006000081_ciclo_de_vida_vinculo_empenho_contrato.sql
--
-- Contexto (auditoria de 06/10/2026, AUDITORIA_VINCULO_EMPENHOS_CONTRATOS.md, itens 4.4 e Fase 3):
-- o vínculo em contrato_empenhos só era inserido ou atualizado, um empenho por vez
-- (link_empenho_to_contract_atomic). Se o Contratos.gov.br deixasse de listar uma NE no contrato, o
-- vínculo ficava para sempre; valor zerado não era gravado (o cliente mandava NULL e a RPC mantinha o
-- antigo) e, nesse caso, a RPC ainda registrava uma ANULACAO_PARCIAL que não aconteceu.
--
-- O que muda
-- 1) sync_contract_empenhos_atomic(p_contract_key, p_empenhos, p_remover_ausentes): grava de uma vez o
--    conjunto de empenhos do contrato que a fonte listou. Insere os novos, atualiza o valor (inclusive
--    para 0) e, com p_remover_ausentes, remove os que a fonte não lista mais, com CANCELAMENTO_TOTAL no
--    histórico. Lista vazia com vínculos existentes não remove nada (proteção contra resposta vazia
--    por id errado): devolve remocao_bloqueada com a quantidade, para o cliente avisar.
--    Exige contrato existente em contratos_oficiais. Mesmo perfil das demais RPCs de empenho
--    (gestor ou coordenador) ou o servidor (service_role, migration 76).
-- 2) link_empenho_to_contract_atomic (continua em uso pelo fluxo do item): o evento de histórico usa
--    o valor que de fato fica gravado; com valor NULL (mantém o anterior) não há evento.
-- 3) contrato_empenhos.contract_key passa a ter o formato canônico validado no banco
--    (UASG-NNNNN-AAAA ou UASG-NEnnnnn-AAAA). Em 06/10/2026 nenhuma linha fugia do formato.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Formato da chave do contrato no vínculo
-- ------------------------------------------------------------------------------
ALTER TABLE public.contrato_empenhos
  DROP CONSTRAINT IF EXISTS contrato_empenhos_contract_key_formato;
ALTER TABLE public.contrato_empenhos
  ADD CONSTRAINT contrato_empenhos_contract_key_formato
  CHECK (contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$') NOT VALID;
ALTER TABLE public.contrato_empenhos
  VALIDATE CONSTRAINT contrato_empenhos_contract_key_formato;

-- ------------------------------------------------------------------------------
-- 2) Substituir o conjunto de empenhos do contrato
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_contract_empenhos_atomic(
  p_contract_key VARCHAR,
  p_empenhos JSONB,
  p_remover_ausentes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_elem JSONB;
  v_empenho_id UUID;
  v_valor NUMERIC(18, 4);
  v_existing public.contrato_empenhos%ROWTYPE;
  v_seen UUID[] := ARRAY[]::UUID[];
  v_removed RECORD;
  v_inseridos INTEGER := 0;
  v_atualizados INTEGER := 0;
  v_removidos INTEGER := 0;
  v_removidos_numeros TEXT[] := ARRAY[]::TEXT[];
  v_existentes INTEGER;
  v_remocao_bloqueada INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$') THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave do contrato fora do formato canônico (ex.: 200331-00012-2026). Valor: "%"', v_contract_key
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_contract_key) THEN
    RAISE EXCEPTION 'CONTRATO_DESCONHECIDO: O contrato "%" não está na carteira de contratos oficiais.', v_contract_key
      USING ERRCODE = 'P0002';
  END IF;

  IF p_empenhos IS NULL OR jsonb_typeof(p_empenhos) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de empenhos deve ser um array.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_empenhos) > 1000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 1000 empenhos por contrato.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_contract_empenhos:' || v_contract_key));

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_empenhos)
  LOOP
    BEGIN
      v_empenho_id := (v_elem->>'empenho_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_empenho_id := NULL;
    END;
    IF v_empenho_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_EMPENHO_ID: Empenho sem identificador válido na lista.'
        USING ERRCODE = '22023';
    END IF;
    IF v_empenho_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Empenho repetido na operação: "%"', v_empenho_id
        USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_empenho_id);

    IF NOT EXISTS (SELECT 1 FROM public.empenhos WHERE id = v_empenho_id) THEN
      RAISE EXCEPTION 'EMPENHO_NOT_FOUND: Empenho com ID "%" não encontrado.', v_empenho_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Valor vinculado obrigatório; 0 é valor (NE anulada ou ainda sem valor no SIAFI).
    BEGIN
      v_valor := (v_elem->>'valor_vinculado')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_valor := NULL;
    END;
    IF v_valor IS NULL OR v_valor < 0 THEN
      RAISE EXCEPTION 'INVALID_VALUE: Valor vinculado ausente ou negativo para o empenho "%".', v_empenho_id
        USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
      FROM public.contrato_empenhos
     WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id;

    IF NOT FOUND THEN
      INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado)
      VALUES (v_contract_key, v_empenho_id, v_valor);
      v_inseridos := v_inseridos + 1;

      INSERT INTO public.empenho_eventos_historico (
        empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
      ) VALUES (
        v_empenho_id, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_valor,
        jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'contract_key', v_contract_key, 'origem', 'SYNC_CONTRATO')
      );

    ELSIF v_existing.valor_vinculado IS DISTINCT FROM v_valor THEN
      UPDATE public.contrato_empenhos
         SET valor_vinculado = v_valor,
             updated_at = NOW()
       WHERE id = v_existing.id;
      v_atualizados := v_atualizados + 1;

      IF v_valor - COALESCE(v_existing.valor_vinculado, 0) <> 0 THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
        ) VALUES (
          v_empenho_id, v_contract_key, CURRENT_DATE,
          CASE WHEN v_valor > COALESCE(v_existing.valor_vinculado, 0) THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
          v_valor - COALESCE(v_existing.valor_vinculado, 0),
          jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'acao', 'ATUALIZACAO_VALOR', 'contract_key', v_contract_key, 'origem', 'SYNC_CONTRATO')
        );
      END IF;
    END IF;
  END LOOP;

  IF COALESCE(p_remover_ausentes, TRUE) THEN
    SELECT COUNT(*) INTO v_existentes
      FROM public.contrato_empenhos
     WHERE contract_key = v_contract_key AND NOT (empenho_id = ANY (v_seen));

    IF cardinality(v_seen) = 0 AND v_existentes > 0 THEN
      -- A fonte não listou nenhum empenho, mas o contrato tem vínculos: não remove (id errado devolve
      -- lista vazia no Contratos.gov.br). O cliente avisa e a equipe confere.
      v_remocao_bloqueada := v_existentes;
    ELSE
      FOR v_removed IN
        SELECT ce.*, e.numero_oficial
          FROM public.contrato_empenhos ce
          JOIN public.empenhos e ON e.id = ce.empenho_id
         WHERE ce.contract_key = v_contract_key AND NOT (ce.empenho_id = ANY (v_seen))
      LOOP
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
        ) VALUES (
          v_removed.empenho_id, v_contract_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL',
          -COALESCE(v_removed.valor_vinculado, 0),
          jsonb_build_object(
            'evento', 'DESVINCULADO_CONTRATO',
            'motivo', 'AUSENTE_NA_FONTE',
            'link_id', v_removed.id,
            'valor_estornado', v_removed.valor_vinculado,
            'origem', 'SYNC_CONTRATO'
          )
        );
        DELETE FROM public.contrato_empenhos WHERE id = v_removed.id;
        v_removidos := v_removidos + 1;
        v_removidos_numeros := array_append(v_removidos_numeros, v_removed.numero_oficial::TEXT);
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contract_key', v_contract_key,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'removidos', v_removidos,
    'removidos_numeros', to_jsonb(v_removidos_numeros),
    'remocao_bloqueada', v_remocao_bloqueada
  );
END;
$$;

COMMENT ON FUNCTION public.sync_contract_empenhos_atomic(VARCHAR, JSONB, BOOLEAN) IS
  'Substitui o conjunto de empenhos vinculados ao contrato pelo que a fonte listou: insere, atualiza o valor e remove os ausentes com CANCELAMENTO_TOTAL no histórico.';

REVOKE ALL ON FUNCTION public.sync_contract_empenhos_atomic(VARCHAR, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_contract_empenhos_atomic(VARCHAR, JSONB, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) link_empenho_to_contract_atomic: evento coerente com o valor gravado
-- ------------------------------------------------------------------------------
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
  v_novo_valor NUMERIC(18, 4);
  v_delta_valor NUMERIC(18, 4);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

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

  SELECT id INTO v_empenho_id_check FROM public.empenhos WHERE id = p_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMPENHO_NOT_FOUND: Empenho com ID "%" não encontrado.', p_empenho_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('link_ctr:' || v_contract_key || ':' || p_empenho_id::TEXT));

  SELECT * INTO v_existing_link
  FROM public.contrato_empenhos
  WHERE contract_key = v_contract_key AND empenho_id = p_empenho_id;

  IF FOUND THEN
    -- NULL mantém o valor anterior: o evento compara o valor que de fato fica gravado.
    v_novo_valor := COALESCE(p_valor_vinculado, v_existing_link.valor_vinculado);
    v_delta_valor := COALESCE(v_novo_valor, 0) - COALESCE(v_existing_link.valor_vinculado, 0);

    UPDATE public.contrato_empenhos
    SET
      valor_vinculado = v_novo_valor,
      updated_at = NOW()
    WHERE id = v_existing_link.id
    RETURNING * INTO v_record;

    IF v_delta_valor <> 0 THEN
      INSERT INTO public.empenho_eventos_historico (
        empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
      ) VALUES (
        p_empenho_id, v_contract_key, CURRENT_DATE,
        CASE WHEN v_delta_valor > 0 THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
        v_delta_valor,
        jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'acao', 'ATUALIZACAO_VALOR', 'contract_key', v_contract_key)
      );
    END IF;

  ELSE
    INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado)
    VALUES (v_contract_key, p_empenho_id, p_valor_vinculado)
    RETURNING * INTO v_record;

    INSERT INTO public.empenho_eventos_historico (
      empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
    ) VALUES (
      p_empenho_id, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', COALESCE(p_valor_vinculado, 0),
      jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'contract_key', v_contract_key)
    );
  END IF;

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
  'Vincula empenho como lastro financeiro de contrato oficial (N:N). Valor NULL mantém o anterior, sem evento.';
