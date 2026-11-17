-- ==============================================================================
-- Liquidado e pago das notas pelo Tesouro (17/11/2026). Estudo: docs/estudos/pago-das-notas-fonte-x-tesouro.md.
--
-- O Contratos.gov.br não acompanha a execução das notas: na UG 200331 as 188 notas de 2026 estão como na emissão
-- (liquidado e pago zerados); na UG 200330 falta a emissão e o pagamento vem em dobro em 11 de 30 notas pagas.
-- Em 2026 a fonte dava R$ 1,95 mi pagos contra R$ 205,6 mi no Tesouro. O empenhado já vinha do Tesouro
-- (migrations 136 e 196); agora também liquidado e pago, sem "o maior dos dois" (o maior manteria os dobros).
--
--   - empenhos.valor_liquidado_fonte e valor_pago_fonte guardam o que a fonte disse (como valor_empenhado_fonte);
--   - save_empenho_soberano_atomic: com a nota no saldo contábil, liquidado = pago + liquidado a pagar (exercício e
--     restos a pagar) e pago = pago de todos os anos (v_empenho_saldo_contabil); sem ela, o valor da fonte;
--   - aplicar_empenhado_do_tesouro (cron a cada 6 h): aplica a mesma regra a todas as notas que não são manuais,
--     não só às trazidas pelo Tesouro/Portal. Quando o Tesouro não é lido, fica a última leitura boa.
-- Mesmos corpos de produção com os trechos "Migration 324". CREATE OR REPLACE mantém as permissões.
-- ==============================================================================

ALTER TABLE public.empenhos
  ADD COLUMN IF NOT EXISTS valor_liquidado_fonte NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS valor_pago_fonte NUMERIC(18, 4);

COMMENT ON COLUMN public.empenhos.valor_liquidado_fonte IS 'Liquidado informado pelo Contratos.gov.br; valor_liquidado vem do Tesouro quando a nota está no saldo contábil (migration 324).';
COMMENT ON COLUMN public.empenhos.valor_pago_fonte IS 'Pago informado pelo Contratos.gov.br; valor_pago vem do Tesouro quando a nota está no saldo contábil (migration 324).';

-- Até aqui valor_liquidado/valor_pago das notas da fonte eram os da fonte.
UPDATE public.empenhos
   SET valor_liquidado_fonte = valor_liquidado, valor_pago_fonte = valor_pago
 WHERE fonte_origem NOT IN ('MANUAL', 'TESOURO', 'PORTAL')
   AND valor_liquidado_fonte IS NULL AND valor_pago_fonte IS NULL;

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
  v_liquidado_fonte NUMERIC(18, 4);
  v_pago_fonte NUMERIC(18, 4);
  v_tes RECORD;
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
  -- Migration 324: o que a fonte disse fica nas colunas _fonte.
  v_liquidado_fonte := v_valor_liquidado;
  v_pago_fonte := v_valor_pago;

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

  -- Migration 324: o Contratos.gov.br não acompanha a execução da nota (UG 200331: nota parada como na emissão;
  -- UG 200330: pagamento sem a emissão e às vezes em dobro). Com a nota no saldo contábil do Tesouro, liquidado e
  -- pago vêm de lá, sem "o maior dos dois": pago = pago de todos os anos; liquidado = pago + liquidado a pagar
  -- (exercício e restos a pagar). Mesma regra do Financeiro e do Contrato 360.
  IF v_fonte_origem <> 'MANUAL' THEN
    SELECT v.pago_total, v.exercicio_liquidado_a_pagar, v.rp_liquidado_a_pagar INTO v_tes
      FROM public.v_empenho_saldo_contabil v
     WHERE v.ug = v_uasg
       AND v.numero_empenho = upper(split_part(btrim(v_numero_oficial), ' ', 1))
     LIMIT 1;
    IF FOUND THEN
      v_valor_pago := GREATEST(v_tes.pago_total, 0);
      v_valor_liquidado := GREATEST(v_tes.pago_total + v_tes.exercicio_liquidado_a_pagar + v_tes.rp_liquidado_a_pagar, 0);
      IF v_fonte_negativa THEN
        v_pelo_tesouro := true;
      END IF;
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
  -- Migration 324: também liquidado e pago da fonte.
  IF v_fonte_origem <> 'MANUAL'
     AND (v_record.valor_empenhado_fonte, v_record.valor_liquidado_fonte, v_record.valor_pago_fonte)
         IS DISTINCT FROM (v_valor_empenhado_fonte, v_liquidado_fonte, v_pago_fonte) THEN
    UPDATE public.empenhos
       SET valor_empenhado_fonte = v_valor_empenhado_fonte,
           valor_liquidado_fonte = v_liquidado_fonte,
           valor_pago_fonte = v_pago_fonte
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

CREATE OR REPLACE FUNCTION public.aplicar_empenhado_do_tesouro()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_notas    INTEGER := 0;
  v_vinculos INTEGER := 0;
  v_tesouro  INTEGER := 0;
BEGIN
  -- pg_has_role: o db push entra com um papel de login membro de postgres (cli_login_postgres).
  IF NOT (public.eh_service_role() OR session_user IN ('postgres', 'supabase_admin')
          OR pg_has_role(session_user, 'postgres', 'MEMBER')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito.' USING ERRCODE = '42501';
  END IF;

  DROP TABLE IF EXISTS pg_temp.empenhado_tesouro_mudou;
  CREATE TEMP TABLE empenhado_tesouro_mudou ON COMMIT DROP AS
  WITH t AS (
    SELECT s.ug, s.numero_empenho, SUM(s.saldo) AS total
      FROM public.empenho_saldo_contabil s
     WHERE s.conta IN ('622920101', '622920102', '622920103', '622920104')
       AND s.numero_empenho ~ '^[0-9]{4}NE'
       AND s.ano = left(s.numero_empenho, 4)::INTEGER
     GROUP BY s.ug, s.numero_empenho
  ), anos AS (
    -- Mesmas condições de empenhado_confiavel_do_tesouro (migration 196), de uma vez para todas as notas.
    SELECT y.ug, y.ano,
           y.ano = MAX(y.ano) OVER (PARTITION BY y.ug) AS corrente,
           (y.lido_em >= make_date(y.ano + 1, 1, 1) AND y.a_liquidar > 0) AS antes_do_encerramento
      FROM (SELECT s.ug, s.ano, MAX(s.atualizado_tesouro) AS lido_em,
                   SUM(s.saldo) FILTER (WHERE s.conta = '622920101') AS a_liquidar
              FROM public.empenho_saldo_contabil s
             WHERE s.conta IN ('622920101', '622920102', '622920103', '622920104')
             GROUP BY s.ug, s.ano) y
  ), rp_processado AS (
    SELECT DISTINCT s.ug, s.numero_empenho
      FROM public.empenho_saldo_contabil s
     WHERE s.conta IN ('632100000', '632200000')
  ), c AS (
    SELECT t.ug, t.numero_empenho, t.total,
           CASE WHEN a.corrente
                  OR (a.antes_do_encerramento
                      AND NOT EXISTS (SELECT 1 FROM rp_processado r WHERE r.ug = t.ug AND r.numero_empenho = t.numero_empenho))
                THEN GREATEST(t.total, 0) END AS confiavel
      FROM t
      JOIN anos a ON a.ug = t.ug AND a.ano = left(t.numero_empenho, 4)::INTEGER
  ), n AS (
    SELECT e.id, e.valor_empenhado,
           -- Leitura confiável do Tesouro: vale o Tesouro; senão, o maior entre a fonte e o Tesouro (migrations 136 e 196).
           COALESCE(c.confiavel, GREATEST(e.valor_empenhado_fonte, COALESCE(c.total, 0))) AS depois
      FROM public.empenhos e
      LEFT JOIN c
        ON c.ug = e.uasg_emitente
       AND c.numero_empenho = upper(split_part(btrim(e.numero_oficial), ' ', 1))
     WHERE e.valor_empenhado_fonte IS NOT NULL
       AND e.fonte_origem <> 'MANUAL'
  )
  SELECT n.id, n.valor_empenhado AS antes, n.depois
    FROM n
   WHERE n.depois IS DISTINCT FROM n.valor_empenhado;

  UPDATE public.empenhos e
     SET valor_empenhado = m.depois, updated_at = NOW()
    FROM pg_temp.empenhado_tesouro_mudou m
   WHERE e.id = m.id;
  GET DIAGNOSTICS v_notas = ROW_COUNT;

  INSERT INTO public.empenho_eventos_historico (empenho_id, data_evento, tipo_evento, delta_valor, metadados)
  SELECT m.id, CURRENT_DATE,
         CASE WHEN m.depois > m.antes THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
         m.depois - m.antes,
         jsonb_build_object('evento', 'RECONCILIADO', 'origem', 'TESOURO')
    FROM pg_temp.empenhado_tesouro_mudou m;

  -- Vínculo que cobria a nota inteira acompanha (o gatilho refaz a divisão automática).
  WITH v AS (
    UPDATE public.contrato_empenhos ce
       SET valor_vinculado = m.depois, updated_at = NOW()
      FROM pg_temp.empenhado_tesouro_mudou m
     WHERE ce.empenho_id = m.id
       AND abs(ce.valor_vinculado - m.antes) < 0.005
    RETURNING ce.empenho_id, ce.contract_key, m.depois - m.antes AS delta
  ), ev AS (
    INSERT INTO public.empenho_eventos_historico (empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados)
    SELECT v.empenho_id, v.contract_key, CURRENT_DATE,
           CASE WHEN v.delta > 0 THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
           v.delta,
           jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'acao', 'ATUALIZACAO_VALOR', 'contract_key', v.contract_key, 'origem', 'TESOURO')
      FROM v
    RETURNING 1
  )
  SELECT count(*) INTO v_vinculos FROM ev;

  -- Notas trazidas pelo Tesouro ou pelo Portal (migrations 184 e 192): não têm valor da fonte; empenhado, liquidado
  -- e pago vêm todos do saldo contábil (migration 195). Migration 324: liquidado e pago do Tesouro em todas as notas
  -- que não são manuais (o empenhado das notas da fonte segue a regra de cima). Sem leitura do Tesouro para a nota,
  -- ficam como estão.
  DROP TABLE IF EXISTS pg_temp.notas_tesouro_mudaram;
  CREATE TEMP TABLE notas_tesouro_mudaram ON COMMIT DROP AS
  WITH n AS (
    SELECT e.id, e.uasg_emitente AS ug, upper(split_part(btrim(e.numero_oficial), ' ', 1)) AS numero,
           e.valor_empenhado, e.valor_liquidado, e.valor_pago, e.fonte_origem IN ('TESOURO', 'PORTAL') AS do_tesouro
      FROM public.empenhos e
     WHERE e.fonte_origem <> 'MANUAL'
  ), s AS (
    SELECT n.id,
           -- sem leitura confiável do ano de emissão, o empenhado fica como está (migration 196)
           CASE WHEN n.do_tesouro
                THEN COALESCE(public.empenhado_confiavel_do_tesouro(n.ug, n.numero), n.valor_empenhado)
                ELSE n.valor_empenhado END AS empenhado,
           GREATEST(v.pago_total, 0) AS pago,
           GREATEST(v.pago_total + v.exercicio_liquidado_a_pagar + v.rp_liquidado_a_pagar, 0) AS liquidado
      FROM n
      JOIN public.v_empenho_saldo_contabil v ON v.ug = n.ug AND v.numero_empenho = n.numero
  )
  SELECT n.id, n.do_tesouro, n.valor_empenhado AS antes, s.empenhado, s.liquidado, s.pago
    FROM n
    JOIN s ON s.id = n.id
   WHERE (s.empenhado, s.liquidado, s.pago) IS DISTINCT FROM (n.valor_empenhado, n.valor_liquidado, n.valor_pago);

  UPDATE public.empenhos e
     SET valor_empenhado = m.empenhado, valor_liquidado = m.liquidado, valor_pago = m.pago,
         last_synced_at = CASE WHEN m.do_tesouro THEN NOW() ELSE e.last_synced_at END, updated_at = NOW()
    FROM pg_temp.notas_tesouro_mudaram m
   WHERE e.id = m.id;
  GET DIAGNOSTICS v_tesouro = ROW_COUNT;

  INSERT INTO public.empenho_eventos_historico (empenho_id, data_evento, tipo_evento, delta_valor, metadados)
  SELECT m.id, CURRENT_DATE,
         CASE WHEN m.empenhado > m.antes THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
         m.empenhado - m.antes,
         jsonb_build_object('evento', 'RECONCILIADO', 'origem', 'TESOURO')
    FROM pg_temp.notas_tesouro_mudaram m
   WHERE abs(m.empenhado - m.antes) >= 0.005;

  RETURN jsonb_build_object('notas', v_notas, 'vinculos', v_vinculos, 'notas_execucao_tesouro', v_tesouro);
END;
$function$;

-- Aplica já a regra nova às notas gravadas.
SELECT public.aplicar_empenhado_do_tesouro();
