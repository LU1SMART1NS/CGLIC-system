-- ==============================================================================
-- Nota com valor negativo no Contratos.gov.br (17/11/2026).
--
-- 8 contratos da UASG 200331 falhavam toda hora ("Dados inválidos fornecidos para a operação") e deixavam a
-- sincronização das notas PARCIAL desde 21/10/2026. Causa: 9 notas de 2026 da UG 200330 em que o Contratos.gov.br
-- devolve empenhado e liquidado negativos e pago positivo (ex.: 2026NE000024: -499.804,33 / -431.944,33 /
-- +431.944,33). Sem o sinal os números também não conferem (2026NE000197: o dobro do Tesouro), então o sinal não
-- é ignorado. Essas notas estavam paradas desde a última leitura boa (a 2026NE000024 com pago 67.860,00; o Tesouro
-- diz 499.804,33).
--
-- Agora, com valor negativo da fonte:
--   - nota no saldo contábil do Tesouro: empenhado (já era), liquidado (conta 622920103) e pago (622920104) do
--     Tesouro. Conferido: o liquidado do Contratos.gov.br bate com a 622920103 em 173 de 187 notas de 2026;
--   - nota fora do Tesouro: a gravada fica como está e o contrato não falha; a nova espera, com o motivo.
-- O vínculo ao contrato (sync_contract_empenhos_atomic) recebe o mesmo valor negativo: igual ao guardado na nota,
-- vale o empenhado gravado (regra da migration 136), em vez de recusar o vínculo do contrato inteiro.
-- Mesmos corpos de produção com os trechos "Migration 321". CREATE OR REPLACE mantém as permissões.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.save_empenho_soberano_atomic(p_empenho jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_valor_empenhado_fonte NUMERIC(18, 4);
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
  v_fonte_negativa BOOLEAN := false;
  v_pelo_tesouro BOOLEAN := false;
  v_num_tes TEXT;
  v_tes_linhas INTEGER := 0;
  v_tes_liq NUMERIC;
  v_tes_pago NUMERIC;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO RIGOROSA (RBAC)
  -- --------------------------------------------------------------------------
  IF NOT (public.eh_service_role() OR public.has_role('gestor') OR public.has_role('admin')) THEN
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
  -- O Contratos.gov.br não acompanha o reforço feito no SIAFI e às vezes mostra o dobro: com leitura confiável do
  -- Tesouro vale o Tesouro; sem ela, o maior entre a fonte e o Tesouro (migrations 136 e 196).
  v_valor_empenhado_fonte := v_valor_empenhado;
  IF v_fonte_origem <> 'MANUAL' THEN
    v_valor_empenhado := COALESCE(public.empenhado_confiavel_do_tesouro(v_uasg, v_numero_oficial),
                                  GREATEST(v_valor_empenhado, COALESCE(public.empenhado_do_tesouro(v_uasg, v_numero_oficial), 0)));
  END IF;
  v_valor_liquidado := COALESCE((p_empenho->>'valor_liquidado')::NUMERIC, 0);
  v_valor_pago := COALESCE((p_empenho->>'valor_pago')::NUMERIC, 0);
  v_valor_rpinscrito := COALESCE((p_empenho->>'valor_rpinscrito')::NUMERIC, 0);

  -- Migration 321: o Contratos.gov.br às vezes troca o sinal da nota (empenhado e liquidado negativos, pago
  -- positivo; 9 notas da UG 200330 em 17/11/2026) e os módulos também não conferem. O sinal não é ignorado:
  -- com a nota no saldo contábil do Tesouro, liquidado (conta 622920103, liquidado a pagar) e pago (622920104)
  -- vêm de lá, como o empenhado já vem; sem ela, nada é regravado (ver abaixo).
  IF v_fonte_origem <> 'MANUAL'
     AND (v_valor_empenhado_fonte < 0 OR v_valor_liquidado < 0 OR v_valor_pago < 0 OR v_valor_rpinscrito < 0) THEN
    v_fonte_negativa := true;
    v_num_tes := upper(split_part(btrim(v_numero_oficial), ' ', 1));
    IF v_num_tes ~ '^[0-9]{4}NE' THEN
      SELECT count(*), SUM(s.saldo) FILTER (WHERE s.conta = '622920103'), SUM(s.saldo) FILTER (WHERE s.conta = '622920104')
        INTO v_tes_linhas, v_tes_liq, v_tes_pago
        FROM public.empenho_saldo_contabil s
       WHERE s.ug = v_uasg
         AND s.numero_empenho = v_num_tes
         AND s.ano = left(v_num_tes, 4)::INTEGER
         AND s.conta IN ('622920101', '622920102', '622920103', '622920104');
    END IF;
    IF v_tes_linhas > 0 THEN
      v_pelo_tesouro := true;
      v_valor_liquidado := GREATEST(COALESCE(v_tes_liq, 0), 0);
      v_valor_pago := GREATEST(COALESCE(v_tes_pago, 0), 0);
    END IF;
  END IF;

  IF NOT v_fonte_negativa AND (v_valor_empenhado < 0 OR v_valor_liquidado < 0 OR v_valor_pago < 0 OR v_valor_rpinscrito < 0) THEN
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
  PERFORM public.exigir_alcance_da_nota(v_canonical_key);  -- alcance do gestor (migration 199)
  SELECT * INTO v_existing FROM public.empenhos WHERE canonical_key = v_canonical_key;

  -- Migration 321: valor negativo na fonte e nota fora do Tesouro. Nota já gravada fica como está (o contrato não
  -- falha por isso); nota nova espera o Tesouro, com o motivo na mensagem.
  IF v_fonte_negativa AND NOT v_pelo_tesouro THEN
    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: o Contratos.gov.br trouxe valor negativo na nota % e o Tesouro ainda não tem essa nota; ela será gravada quando o Tesouro a ler.', v_numero_oficial
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('success', true, 'is_new', false, 'fonte_negativa', true, 'valores_do_tesouro', false,
                              'empenho', to_jsonb(v_existing));
  END IF;
  -- RP inscrito negativo com a nota no Tesouro: fica o gravado (nota nova: 0, a nota do ano não tem RP inscrito).
  IF v_fonte_negativa AND v_valor_rpinscrito < 0 THEN
    v_valor_rpinscrito := COALESCE(v_existing.valor_rpinscrito, 0);
  END IF;

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

    -- Migration 317: a fonte trouxe a nota igual. Nada se regrava; só last_synced_at avança (leitura oficial).
    ELSIF (v_numero_oficial, v_data_emissao, v_valor_empenhado, v_valor_liquidado, v_valor_pago, v_valor_rpinscrito,
           COALESCE(v_credor_nome, v_existing.credor_nome), COALESCE(v_credor_cnpj_cpf, v_existing.credor_cnpj_cpf),
           COALESCE(v_situacao, v_existing.situacao),
           CASE WHEN v_fonte_origem = 'MANUAL' THEN v_existing.fonte_origem ELSE v_fonte_origem END,
           COALESCE(v_identificador_fonte, v_existing.identificador_fonte), COALESCE(v_url_oficial, v_existing.url_oficial))
          IS NOT DISTINCT FROM
          (v_existing.numero_oficial, v_existing.data_emissao, v_existing.valor_empenhado, v_existing.valor_liquidado,
           v_existing.valor_pago, v_existing.valor_rpinscrito, v_existing.credor_nome, v_existing.credor_cnpj_cpf,
           v_existing.situacao, v_existing.fonte_origem, v_existing.identificador_fonte, v_existing.url_oficial) THEN
      IF v_fonte_origem <> 'MANUAL' THEN
        UPDATE public.empenhos SET last_synced_at = NOW() WHERE id = v_existing.id RETURNING * INTO v_record;
      ELSE
        SELECT * INTO v_record FROM public.empenhos WHERE id = v_existing.id;
      END IF;

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
  -- Guarda o que a fonte disse (migration 136).
  IF v_fonte_origem <> 'MANUAL' AND v_record.valor_empenhado_fonte IS DISTINCT FROM v_valor_empenhado_fonte THEN
    UPDATE public.empenhos SET valor_empenhado_fonte = v_valor_empenhado_fonte
     WHERE id = v_record.id
     RETURNING * INTO v_record;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_new', v_is_new,
    'fonte_negativa', v_fonte_negativa,
    'valores_do_tesouro', v_pelo_tesouro,
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
$function$;

CREATE OR REPLACE FUNCTION public.sync_contract_empenhos_atomic(p_contract_key character varying, p_empenhos jsonb, p_remover_ausentes boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_promovidos INTEGER := 0;
  v_removidos INTEGER := 0;
  v_removidos_numeros TEXT[] := ARRAY[]::TEXT[];
  v_ignorados INTEGER := 0;
  v_ignorados_numeros TEXT[] := ARRAY[]::TEXT[];
  v_existentes INTEGER;
  v_remocao_bloqueada INTEGER := 0;
  v_a_conferir INTEGER := 0;
  v_a_conferir_numeros TEXT[] := ARRAY[]::TEXT[];
  v_com_trabalho BOOLEAN;
BEGIN
  PERFORM public.exigir_alcance_do_gestor((p_contract_key)::text, NULL);  -- alcance do gestor (migration 126)
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
    -- Migration 321: o Contratos.gov.br às vezes manda a nota com sinal trocado. Valor negativo igual ao que a fonte
    -- disse na nota vale o empenhado gravado (Tesouro), a mesma regra da migration 136 logo abaixo.
    IF v_valor < 0 THEN
      v_valor := COALESCE((
        SELECT e.valor_empenhado FROM public.empenhos e
         WHERE e.id = v_empenho_id
           AND e.valor_empenhado_fonte IS NOT NULL
           AND abs(v_valor - e.valor_empenhado_fonte) < 0.005
      ), v_valor);
    END IF;
    IF v_valor IS NULL OR v_valor < 0 THEN
      RAISE EXCEPTION 'INVALID_VALUE: Valor vinculado ausente ou negativo para o empenho "%".', v_empenho_id
        USING ERRCODE = '22023';
    END IF;

    -- A equipe disse que este empenho não é deste contrato: a fonte lista, mas não vincula.
    IF EXISTS (
      SELECT 1 FROM public.contrato_empenho_descartes
       WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id
    ) THEN
      v_ignorados := v_ignorados + 1;
      v_ignorados_numeros := array_append(v_ignorados_numeros, (SELECT numero_oficial::TEXT FROM public.empenhos WHERE id = v_empenho_id));
      CONTINUE;
    END IF;

    -- Vínculo da nota inteira acompanha o valor corrigido pelo Tesouro (migration 136).
    v_valor := COALESCE((
      SELECT e.valor_empenhado FROM public.empenhos e
       WHERE e.id = v_empenho_id
         AND e.valor_empenhado_fonte IS NOT NULL
         AND abs(v_valor - e.valor_empenhado_fonte) < 0.005
    ), v_valor);

    SELECT * INTO v_existing
      FROM public.contrato_empenhos
     WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id;

    IF NOT FOUND THEN
      INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado, origem)
      VALUES (v_contract_key, v_empenho_id, v_valor, 'FONTE');
      v_inseridos := v_inseridos + 1;

      INSERT INTO public.empenho_eventos_historico (
        empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
      ) VALUES (
        v_empenho_id, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_valor,
        jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'contract_key', v_contract_key, 'origem', 'SYNC_CONTRATO')
      );

    ELSE
      -- A fonte voltou a listar a nota: deixa de estar a conferir (migration 113).
      DELETE FROM public.contrato_empenho_ausente_da_fonte WHERE contrato_empenho_id = v_existing.id;

      -- Vínculo feito à mão que a fonte passou a listar: vira FONTE (a fonte confirmou).
      IF v_existing.origem IN ('MANUAL', 'EMENDA') THEN  -- (migration 255) EMENDA também vira FONTE
        UPDATE public.contrato_empenhos SET origem = 'FONTE', updated_at = NOW() WHERE id = v_existing.id;
        v_promovidos := v_promovidos + 1;
      END IF;

      IF v_existing.valor_vinculado IS DISTINCT FROM v_valor THEN
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
    END IF;
  END LOOP;

  IF COALESCE(p_remover_ausentes, TRUE) THEN
    -- Só os vínculos que vieram da fonte saem quando ela deixa de listá-los; os MANUAIS ficam.
    SELECT COUNT(*) INTO v_existentes
      FROM public.contrato_empenhos
     WHERE contract_key = v_contract_key AND origem = 'FONTE' AND NOT (empenho_id = ANY (v_seen));

    IF jsonb_array_length(p_empenhos) = 0 AND v_existentes > 0 THEN
      -- A fonte não listou nenhum empenho, mas o contrato tem vínculos: não remove (id errado devolve
      -- lista vazia no Contratos.gov.br). O cliente avisa e a equipe confere.
      v_remocao_bloqueada := v_existentes;
    ELSE
      FOR v_removed IN
        SELECT ce.*, e.numero_oficial
          FROM public.contrato_empenhos ce
          JOIN public.empenhos e ON e.id = ce.empenho_id
         WHERE ce.contract_key = v_contract_key AND ce.origem = 'FONTE' AND NOT (ce.empenho_id = ANY (v_seen))
      LOOP
        -- Nota com trabalho do gestor não é apagada (migration 113): a exclusão levaria junto a distribuição
        -- entre os itens feita por ele, a quantidade que ele informou por item e, na tela do item, a unidade
        -- interna escolhida para a nota. Fica a conferir; o coordenador decide.
        -- Nota em edição pelo gestor agora: fica para a próxima rodada (migration 131).
        IF NOT pg_try_advisory_xact_lock(hashtext('distribuir_empenho:' || v_removed.id::TEXT)) THEN
          CONTINUE;
        END IF;
        v_com_trabalho :=
          EXISTS (SELECT 1 FROM public.contrato_empenho_distribuicoes d
                   WHERE d.contrato_empenho_id = v_removed.id AND d.origem = 'USUARIO')
          OR EXISTS (SELECT 1 FROM public.contrato_empenho_itens i
                      WHERE i.contrato_empenho_id = v_removed.id AND i.quantidade_informada IS NOT NULL)
          OR EXISTS (SELECT 1 FROM public.empenho_links el
                       JOIN public.arp_item_contract_links l ON l.item_key = el.item_key AND l.contract_key = v_contract_key
                      WHERE el.empenho_numero = v_removed.numero_oficial::TEXT);
        IF v_com_trabalho THEN
          INSERT INTO public.contrato_empenho_ausente_da_fonte (contrato_empenho_id, contract_key, empenho_id, detectado_em, visto_em)
          VALUES (v_removed.id, v_contract_key, v_removed.empenho_id, NOW(), NOW())
          ON CONFLICT (contrato_empenho_id) DO UPDATE SET visto_em = NOW();
          v_a_conferir := v_a_conferir + 1;
          v_a_conferir_numeros := array_append(v_a_conferir_numeros, v_removed.numero_oficial::TEXT);
          CONTINUE;
        END IF;

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
    'promovidos', v_promovidos,
    'removidos', v_removidos,
    'removidos_numeros', to_jsonb(v_removidos_numeros),
    'ignorados_descartados', v_ignorados,
    'ignorados_numeros', to_jsonb(v_ignorados_numeros),
    'remocao_bloqueada', v_remocao_bloqueada,
    'a_conferir', v_a_conferir,
    'a_conferir_numeros', to_jsonb(v_a_conferir_numeros)
  );
END;
$function$;
