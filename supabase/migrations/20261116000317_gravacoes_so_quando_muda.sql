-- ==============================================================================
-- Gravações da sincronização só quando a fonte mudou (16/11/2026).
--
-- Medido no banco real (ensaio desfeito, docs/estudos/inicio-atualizacao-carga.md, proposta 6):
-- 1. gravar_unidades_itens era a gravação mais cara do banco (1.265 s em 18 dias, 2,9 s por chamada). Gravar 100
--    itens iguais levava 25,7 s, dos quais 25,0 s no gatilho trg_base_senasp_da_copia: ele roda em todo
--    UPDATE OF unidades (o upsert sempre cita a coluna) e procurava o item pela chave montada, varrendo atas × itens
--    (227 ms por item). Agora: (a) lista igual não é regravada, só as datas; (b) a busca do item usa o índice da ata
--    (1,7 ms), com a mesma chave conferida no fim: mesmos 667 pares cópia → item.
-- 2. save_empenho_soberano_atomic: 3,6 ms por nota, 3,2 ms na consulta ao Tesouro. empenhado_confiavel_do_tesouro
--    somava o ano inteiro do Tesouro mesmo para nota do ano corrente; agora só soma quando precisa. Mesmo valor em
--    3.900 casos (todas as notas + 1.500 do Tesouro + casos inválidos); 5,7 s → 2,0 s. Nota igual à fonte deixa de
--    ser regravada (só last_synced_at avança; updated_at passa a marcar mudança real).
-- gravar_reajuste_fontes ficou como está: não aparece entre as 25 chamadas mais caras.
-- CREATE OR REPLACE mantém as permissões das funções que já existem.
-- ==============================================================================

-- Confere a quantidade SENASP do item da ata pela lista de órgãos da cópia (era o corpo do gatilho).
-- A chave do item é numero_ata-uasg-item(5 dígitos); a ata é achada pelo índice uq_ata_uasg e a chave
-- inteira é conferida no fim, como antes.
CREATE OR REPLACE FUNCTION public.acertar_senasp_do_item(p_item_key text, p_unidades jsonb, p_lida_em timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_unidades IS NULL OR jsonb_typeof(p_unidades) <> 'array' OR jsonb_array_length(p_unidades) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.itens_ata i
     SET quantidade_senasp = x.qtd,
         quantidade_senasp_lida_em = COALESCE(p_lida_em, NOW())
    FROM public.atas_registro_preco a
    CROSS JOIN LATERAL (SELECT public.senasp_das_unidades(p_unidades, a.codigo_uasg) AS qtd) x
   WHERE a.id = i.ata_id
     AND a.numero_ata = substring(p_item_key from '^(.*)-[^-]*-[^-]*$')
     AND a.codigo_uasg = substring(p_item_key from '^.*-([^-]*)-[^-]*$')
     AND (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::TEXT, 5, '0')) = p_item_key
     AND x.qtd IS NOT NULL
     AND i.quantidade_senasp IS DISTINCT FROM x.qtd;
END;
$$;
REVOKE ALL ON FUNCTION public.acertar_senasp_do_item(text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;

-- Mesmo gatilho de antes, agora pela função acima.
CREATE OR REPLACE FUNCTION public.trg_base_senasp_da_copia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.acertar_senasp_do_item(NEW.item_key, NEW.unidades, NEW.copiado_em);
  RETURN NEW;
END;
$function$;

-- Mesmo resultado, sem somar o ano do Tesouro quando a nota é do ano mais recente lido.
CREATE OR REPLACE FUNCTION public.empenhado_confiavel_do_tesouro(p_ug text, p_numero text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_num  TEXT := upper(split_part(btrim(p_numero), ' ', 1));
  v_ano  INTEGER;
  v_emp  NUMERIC;
  v_lido TIMESTAMPTZ;
  v_aliq NUMERIC;
BEGIN
  IF v_num !~ '^[0-9]{4}NE' THEN RETURN NULL; END IF;
  v_ano := left(v_num, 4)::INTEGER;
  v_emp := public.empenhado_do_tesouro(p_ug, v_num);
  IF v_emp IS NULL THEN RETURN NULL; END IF;

  IF v_ano = (SELECT MAX(s.ano) FROM public.empenho_saldo_contabil s WHERE s.ug = p_ug) THEN
    RETURN GREATEST(v_emp, 0);
  END IF;

  -- Ano anterior: vale se o Tesouro já leu o ano seguinte, ainda há a liquidar e a nota não foi inscrita/cancelada.
  SELECT MAX(s.atualizado_tesouro), SUM(s.saldo) FILTER (WHERE s.conta = '622920101') INTO v_lido, v_aliq
    FROM public.empenho_saldo_contabil s
   WHERE s.ug = p_ug AND s.ano = v_ano AND s.conta IN ('622920101', '622920102', '622920103', '622920104');
  IF v_lido >= make_date(v_ano + 1, 1, 1) AND v_aliq > 0
     AND NOT EXISTS (SELECT 1 FROM public.empenho_saldo_contabil r
                      WHERE r.ug = p_ug AND r.numero_empenho = v_num AND r.conta IN ('632100000', '632200000')) THEN
    RETURN GREATEST(v_emp, 0);
  END IF;
  RETURN NULL;
END;
$function$;

-- Mesmo corpo de produção, com a lista igual sem regravação (ver "Migration 317").
CREATE OR REPLACE FUNCTION public.gravar_unidades_itens(p_uasg character varying, p_itens jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item     JSONB;
  v_key      TEXT;
  v_unidades JSONB;
  v_adesoes  JSONB;
  v_total    INTEGER := 0;
  v_anteriores JSONB;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'unidades_itens'
       AND uasg = p_uasg
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização dos órgãos dos itens da UASG % não reservada por este usuário.', p_uasg
      USING ERRCODE = '55000';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_itens deve ser um array JSON.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 100 itens por chamada.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT valor FROM jsonb_array_elements(p_itens) AS e(valor) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;
    v_key := left(btrim(COALESCE(v_item->>'item_key', '')), 100);
    IF v_key = '' THEN CONTINUE; END IF;

    -- Só objetos entram nas listas; o resto é descartado sem derrubar o lote.
    SELECT COALESCE(jsonb_agg(u.valor ORDER BY u.ordem), '[]'::jsonb)
      INTO v_unidades
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_item->'unidades') = 'array' THEN v_item->'unidades' ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS u(valor, ordem)
     WHERE jsonb_typeof(u.valor) = 'object';

    IF jsonb_array_length(v_unidades) > 500 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 unidades por item (%).', v_key
        USING ERRCODE = '22023';
    END IF;

    v_adesoes := NULL;
    IF jsonb_typeof(v_item->'adesoes') = 'array' THEN
      SELECT COALESCE(jsonb_agg(a.valor ORDER BY a.ordem), '[]'::jsonb)
        INTO v_adesoes
        FROM jsonb_array_elements(v_item->'adesoes') WITH ORDINALITY AS a(valor, ordem)
       WHERE jsonb_typeof(a.valor) = 'object';
      IF jsonb_array_length(v_adesoes) > 1000 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 1000 adesões por item (%).', v_key
          USING ERRCODE = '22023';
      END IF;
    END IF;

    -- Migration 143: a lista não pode ter o mesmo órgão duas vezes para o mesmo fornecedor (a fonte repetia
    -- cada órgão desde 09/10/2026; o servidor tira as cópias antes de gravar). Lista assim fica de fora: a
    -- cópia anterior e o histórico não mudam.
    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_unidades) u
       GROUP BY regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g'), btrim(COALESCE(u->>'fornecedor', ''))
      HAVING count(*) > 1
    ) THEN
      RAISE WARNING 'gravar_unidades_itens: item % com órgão repetido na lista; não gravado.', v_key;
      CONTINUE;
    END IF;

    IF jsonb_array_length(v_unidades) > 0 THEN
      -- Migration 109: histórico do registrado. Compara com a cópia anterior, órgão a órgão, e grava cada
      -- quantidade que mudou (a primeira cópia do item é só o ponto de partida).
      v_anteriores := NULL;
      SELECT c.unidades INTO v_anteriores FROM public.itens_ata_unidades_copia c WHERE c.item_key = v_key;

      -- Migration 317: a mesma lista de antes não é regravada. Só as datas avançam (a fila de leitura usa lido_em),
      -- os gatilhos de "unidades" não rodam, e a quantidade SENASP do item é conferida como o gatilho faria.
      IF v_anteriores IS NOT DISTINCT FROM v_unidades THEN
        UPDATE public.itens_ata_unidades_copia
           SET copiado_em = NOW(), lido_em = NOW(), ultima_leitura_vazia = FALSE
         WHERE item_key = v_key;
        PERFORM public.acertar_senasp_do_item(v_key, v_unidades, NOW());
        v_total := v_total + 1;
      ELSE
        IF v_anteriores IS NOT NULL AND jsonb_typeof(v_anteriores) = 'array' AND jsonb_array_length(v_anteriores) > 0 THEN
          INSERT INTO public.itens_ata_unidades_historico (item_key, uasg, quantidade_anterior, quantidade_nova, atualizado_na_fonte)
          SELECT v_key, COALESCE(n.uasg, a.uasg), a.quantidade, n.quantidade, COALESCE(n.atualizado_em, a.atualizado_em)
            FROM public.registrado_por_uasg(v_anteriores) a
            FULL JOIN public.registrado_por_uasg(v_unidades) n ON n.uasg = a.uasg
           WHERE a.quantidade IS DISTINCT FROM n.quantidade;
        END IF;

        INSERT INTO public.itens_ata_unidades_copia AS c
          (item_key, unidades, total_unidades, copiado_em, lido_em, ultima_leitura_vazia)
        VALUES (v_key, v_unidades, jsonb_array_length(v_unidades), NOW(), NOW(), FALSE)
        ON CONFLICT (item_key) DO UPDATE
          SET unidades = EXCLUDED.unidades,
              total_unidades = EXCLUDED.total_unidades,
              copiado_em = EXCLUDED.copiado_em,
              lido_em = EXCLUDED.lido_em,
              ultima_leitura_vazia = FALSE;
        v_total := v_total + 1;
      END IF;
    ELSE
      INSERT INTO public.itens_ata_unidades_copia AS c (item_key, lido_em, ultima_leitura_vazia)
      VALUES (v_key, NOW(), TRUE)
      ON CONFLICT (item_key) DO UPDATE
        SET lido_em = EXCLUDED.lido_em, ultima_leitura_vazia = TRUE;
    END IF;

    IF v_adesoes IS NOT NULL THEN
      -- Migration 317: mesma lista de adesões, só a data avança.
      UPDATE public.itens_ata_unidades_copia
         SET adesoes = v_adesoes,
             total_adesoes = jsonb_array_length(v_adesoes),
             adesoes_copiado_em = NOW()
       WHERE item_key = v_key AND adesoes IS DISTINCT FROM v_adesoes;
      IF NOT FOUND THEN
        UPDATE public.itens_ata_unidades_copia SET adesoes_copiado_em = NOW() WHERE item_key = v_key;
      END IF;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- Mesmo corpo de produção, com a nota igual sem regravação (ver "Migration 317").
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
  PERFORM public.exigir_alcance_da_nota(v_canonical_key);  -- alcance do gestor (migration 199)
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
