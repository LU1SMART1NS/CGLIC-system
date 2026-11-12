-- ==============================================================================
-- Migration 234: conferência do ofício × pedido (protótipo aprovado em 28/10/2026)
--
-- A etapa "Conferido no SIOP" passa a conferir também o ofício com os itens do pedido:
--   1) minuta_precos: o preço unitário de cada item como saiu no quadro da minuta (MINUTA grava; a devolução apaga).
--      A conferência compara o valor do ofício com o pedido por esses preços e avisa quando o preço mudou depois.
--   2) Pontos do SIOP: nº, parlamentar, valor, GND, compra direta pelo MJ e UF, mais "itens_do_oficio".
--   3) conferir_oficio_pedido: ajusta as linhas do pedido ao ofício e registra a conferência ou a devolução (nova
--      minuta) numa transação só. Sem ajuste, é o mesmo que avancar_pedido_emenda.
-- ==============================================================================

ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS minuta_precos JSONB
  CHECK (minuta_precos IS NULL OR jsonb_typeof(minuta_precos) = 'object');
COMMENT ON COLUMN public.emenda_pedidos.minuta_precos IS
  'Preço unitário previsto de cada item (item_key → R$) no quadro da minuta registrada; a devolução apaga (migration 234).';

CREATE OR REPLACE FUNCTION public.avancar_pedido_emenda(p_id UUID, p_versao INTEGER, p_acao TEXT, p_dados JSONB)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_p      RECORD;
  v_nome   TEXT;
  v_acao   TEXT := upper(COALESCE(p_acao, ''));
  v_d      JSONB := COALESCE(p_dados, '{}'::jsonb);
  v_data   DATE;
  v_sei    TEXT;
  v_seis   TEXT[];
  v_conf   JSONB;
  v_rodada INTEGER;
  v_versao INTEGER;
  v_num    TEXT;
  v_ano    INTEGER;
  v_vemenda NUMERIC;
  v_voficio NUMERIC;
  v_seiof  TEXT;
  v_emenda RECORD;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram as etapas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_data := COALESCE(NULLIF(v_d->>'data', '')::DATE, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);

  IF v_acao IN ('OFICIO', 'SOLICITADO', 'CGOFI') THEN
    v_sei := regexp_replace(COALESCE(v_d->>'documento_sei', ''), '\D', '', 'g');
    IF v_sei !~ '^[0-9]{7,10}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o documento SEI (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
    END IF;
  ELSIF v_acao IN ('EMPENHADO', 'CONTRATACAO', 'ACRESCENTAR_SEI') THEN
    IF jsonb_typeof(v_d->'documentos_sei') <> 'array' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe pelo menos um documento SEI.' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT n ORDER BY n) INTO v_seis
      FROM (SELECT regexp_replace(p, '\D', '', 'g') AS n
              FROM jsonb_array_elements_text(v_d->'documentos_sei') x, regexp_split_to_table(x, '[,;[:space:]]+') p) t
     WHERE n <> '';
    IF v_seis IS NULL OR EXISTS (SELECT 1 FROM unnest(v_seis) n WHERE n !~ '^[0-9]{7,10}$') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe pelo menos um documento SEI (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_acao = 'MINUTA' THEN
    IF v_p.etapa <> 'RESERVADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A minuta é registrada em pedido reservado.' USING ERRCODE = '22023';
    END IF;
    -- Migration 234: o preço unitário de cada item como saiu no quadro da minuta, para a conferência do ofício.
    IF v_d ? 'precos' AND (jsonb_typeof(v_d->'precos') <> 'object' OR EXISTS (
      SELECT 1 FROM jsonb_each(v_d->'precos') x WHERE jsonb_typeof(x.value) <> 'number' OR (x.value)::NUMERIC < 0
    )) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: os preços da minuta são um objeto item → preço.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'MINUTA', minuta_em = v_data,
           minuta_precos = CASE WHEN jsonb_typeof(v_d->'precos') = 'object' THEN v_d->'precos' END
     WHERE id = p_id;

  ELSIF v_acao = 'OFICIO' THEN
    IF v_p.etapa NOT IN ('RESERVADO', 'MINUTA', 'OFICIO') THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O ofício é registrado antes da conferência com o SIOP.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'processo_sei'), '') = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o processo SEI.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'OFICIO', oficio_documento_sei = v_sei,
           oficio_processo_sei = left(btrim(v_d->>'processo_sei'), 40), oficio_em = v_data, divergencia = NULL WHERE id = p_id;

  ELSIF v_acao = 'DIVERGENCIA' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A divergência é registrada com o ofício recebido, antes da conferência.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'texto'), '') = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: descreva o que não bate.' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(max(rodada), 0) + 1 INTO v_rodada FROM public.emenda_pedido_devolucoes WHERE pedido_id = p_id;
    INSERT INTO public.emenda_pedido_devolucoes (pedido_id, rodada, minuta_em, oficio_em, oficio_documento_sei, oficio_processo_sei,
                                                 oficio_numero, motivo, devolvido_em, criado_por, criado_por_nome)
    VALUES (p_id, v_rodada, v_p.minuta_em, v_p.oficio_em, v_p.oficio_documento_sei, v_p.oficio_processo_sei,
            v_p.oficio_numero, btrim(v_d->>'texto'), v_data, auth.uid(), v_nome);
    -- Volta para a minuta: a nova minuta e o novo ofício entram no mesmo processo SEI.
    UPDATE public.emenda_pedidos SET etapa = 'RESERVADO', minuta_em = NULL, minuta_documento_sei = NULL, oficio_em = NULL,
           oficio_documento_sei = NULL, oficio_numero = NULL, divergencia = btrim(v_d->>'texto'), devolvido_em = v_data,
           minuta_precos = NULL
     WHERE id = p_id;

  ELSIF v_acao = 'CONFERIDO' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A conferência com o SIOP vem depois do ofício.' USING ERRCODE = '22023';
    END IF;
    v_conf := v_d->'conferencia';
    -- Migration 234: os pontos são o que o SIOP mostra. Na compra direta o beneficiário no SIOP é o próprio MJ e não há
    -- objeto: saem "beneficiario" e "objeto", entram "compra_direta" (modalidade 90, ação 21BM) e "uf" (localizador).
    -- Quem recebe e os itens são conferidos com o ofício, item por item ("itens_do_oficio").
    IF v_conf IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['numero_emenda', 'autor', 'valor', 'gnd', 'compra_direta', 'uf', 'itens_do_oficio']) k
       WHERE (v_conf->>k)::BOOLEAN IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: confira os itens do ofício e os 6 pontos do SIOP (nº da emenda, parlamentar, valor, GND, compra direta pelo MJ e UF).' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'emenda'), '') = '' OR (v_d->>'gnd') NOT IN ('GND-3', 'GND-4') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o número da emenda e o GND.' USING ERRCODE = '22023';
    END IF;
    -- Migration 186: 8 dígitos (autor + emenda) com o ano à parte, ou os 12 do código (ano + número).
    v_num := regexp_replace(v_d->>'emenda', '\D', '', 'g');
    IF v_num ~ '^20[0-9]{10}$' THEN
      v_ano := left(v_num, 4)::INTEGER;
      v_num := right(v_num, 8);
    ELSIF v_num ~ '^[0-9]{8}$' THEN
      v_ano := CASE WHEN COALESCE(v_d->>'ano', '') ~ '^[0-9]{4}$' THEN (v_d->>'ano')::INTEGER END;
    ELSE
      RAISE EXCEPTION 'INVALID_PAYLOAD: o nº da emenda tem 8 dígitos (ex.: 4095 0004), ou 12 com o ano na frente (2026 4095 0004).' USING ERRCODE = '22023';
    END IF;
    IF v_ano IS NULL OR v_ano NOT BETWEEN 2015 AND 2100 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o ano da emenda.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: todas as linhas precisam de beneficiário antes da conferência.' USING ERRCODE = '22023';
    END IF;
    -- Migration 232: o valor da emenda no SIOP fica na emenda (emendas_siop, um por emenda) e o do ofício no pedido.
    -- "valor" (formato antigo) vale como valor da emenda.
    v_vemenda := NULLIF(COALESCE(v_d->>'valor_emenda', v_d->>'valor'), '')::NUMERIC;
    v_voficio := NULLIF(v_d->>'valor_oficio', '')::NUMERIC;
    IF v_voficio IS NULL OR v_voficio <= 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o valor do ofício.' USING ERRCODE = '22023';
    END IF;
    v_seiof := NULLIF(regexp_replace(COALESCE(v_d->>'oficio_valor_documento_sei', ''), '\D', '', 'g'), '');
    IF v_seiof IS NOT NULL AND v_seiof !~ '^[0-9]{7,10}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: o documento SEI do ofício tem só números, 7 a 10 dígitos.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_emenda FROM public.emendas_siop WHERE ano = v_ano AND numero = v_num FOR UPDATE;
    IF NOT FOUND THEN
      IF v_vemenda IS NULL OR v_vemenda <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: informe o valor da emenda no SIOP.' USING ERRCODE = '22023';
      END IF;
      IF v_p.autor_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar do pedido antes da conferência.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.emendas_siop (ano, numero, autor_id, valor, gnd, vista_em, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
      VALUES (v_ano, v_num, v_p.autor_id, v_vemenda, v_d->>'gnd', v_data, auth.uid(), v_nome, auth.uid(), v_nome);
    ELSIF v_vemenda IS NOT NULL AND (v_vemenda IS DISTINCT FROM v_emenda.valor OR (v_d->>'gnd') IS DISTINCT FROM v_emenda.gnd) THEN
      IF v_vemenda <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: o valor da emenda no SIOP deve ser maior que zero.' USING ERRCODE = '22023';
      END IF;
      -- O SIOP mudou: a CAEP corrige na conferência e a data passa a ser a de hoje.
      UPDATE public.emendas_siop SET valor = v_vemenda, gnd = v_d->>'gnd', vista_em = v_data, versao = versao + 1,
             atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
       WHERE id = v_emenda.id;
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CONFERIDO', siop_emenda = v_num, siop_emenda_ano = v_ano,
           siop_valor = COALESCE(v_vemenda, v_emenda.valor), siop_gnd = v_d->>'gnd', siop_conferencia = v_conf,
           oficio_valor = v_voficio, oficio_valor_documento_sei = COALESCE(v_seiof, v_p.oficio_documento_sei),
           oficio_valor_retificador = COALESCE((v_d->>'oficio_retificador')::BOOLEAN, FALSE),
           conferido_em = v_data, divergencia = NULL WHERE id = p_id;

  ELSIF v_acao = 'SOLICITADO' THEN
    IF v_p.etapa <> 'CONFERIDO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A solicitação de empenho vem depois da conferência.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'SOLICITADO', solicitado_em = v_data, solicitado_documento_sei = v_sei WHERE id = p_id;

  ELSIF v_acao = 'AUTORIZADO' THEN
    IF v_p.etapa <> 'SOLICITADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A autorização de empenho vem depois da solicitação.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'AUTORIZADO', autorizado_em = v_data, autorizado_documento_sei = solicitado_documento_sei WHERE id = p_id;

  ELSIF v_acao = 'CGOFI' THEN
    IF v_p.etapa <> 'AUTORIZADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O envio à CGOFI vem depois da autorização.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CGOFI', cgofi_em = v_data, cgofi_documento_sei = v_sei WHERE id = p_id;

  ELSIF v_acao = 'EMPENHADO' THEN
    IF v_p.etapa <> 'CGOFI' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O empenho vem depois do envio à CGOFI.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'EMPENHADO', empenhado_em = v_data, empenhado_documentos_sei = v_seis WHERE id = p_id;

  ELSIF v_acao = 'CONTRATACAO' THEN
    IF v_p.etapa <> 'EMPENHADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O envio para contratação vem depois do empenho.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CONTRATACAO', contratacao_em = v_data, contratacao_documentos_sei = v_seis WHERE id = p_id;

  ELSIF v_acao = 'ACRESCENTAR_SEI' THEN
    -- Migration 230: a data vem junto quando a etapa avançou pela fonte sem data (comprovada pela nota ou pelo contrato).
    v_data := NULLIF(v_d->>'data', '')::DATE;
    IF v_d->>'etapa' = 'CGOFI' AND v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') AND v_p.cgofi_documento_sei IS NULL THEN
      -- Envio à CGOFI comprovado pela nota: a CAEP completa o documento depois (um só, como no registro da etapa).
      IF array_length(v_seis, 1) <> 1 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: o envio à CGOFI tem um documento SEI só.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.emenda_pedidos SET cgofi_documento_sei = v_seis[1], cgofi_em = COALESCE(cgofi_em, v_data) WHERE id = p_id;
    ELSIF v_d->>'etapa' = 'EMPENHADO' AND v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') THEN
      UPDATE public.emenda_pedidos SET empenhado_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(empenhado_documentos_sei, '{}') || v_seis) n ORDER BY n),
        empenhado_em = COALESCE(empenhado_em, v_data) WHERE id = p_id;
    ELSIF v_d->>'etapa' = 'CONTRATACAO' AND v_p.etapa = 'CONTRATACAO' THEN
      UPDATE public.emenda_pedidos SET contratacao_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(contratacao_documentos_sei, '{}') || v_seis) n ORDER BY n),
        contratacao_em = COALESCE(contratacao_em, v_data) WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'ETAPA_INVALIDA: Só se acrescenta número ao envio à CGOFI, ao empenho ou ao envio para contratação já registrados.' USING ERRCODE = '22023';
    END IF;

  ELSE
    RAISE EXCEPTION 'INVALID_PAYLOAD: ação desconhecida: %.', p_acao USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;

REVOKE ALL ON FUNCTION public.avancar_pedido_emenda(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.avancar_pedido_emenda(UUID, INTEGER, TEXT, JSONB) TO authenticated;

-- p_linhas: as linhas do pedido ajustadas ao ofício, como em salvar_pedido_emenda (a que fica de fora é tirada, com
-- p_motivo); NULL = sem ajuste. p_acao: CONFERIDO (tudo confere) ou DIVERGENCIA (nova minuta). O ajuste muda a versão
-- do pedido; a etapa usa a versão nova, tudo na mesma transação.
CREATE OR REPLACE FUNCTION public.conferir_oficio_pedido(p_id UUID, p_versao INTEGER, p_acao TEXT, p_dados JSONB, p_linhas JSONB, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_versao INTEGER := p_versao;
  v_salvo  JSONB;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram as etapas.' USING ERRCODE = '42501';
  END IF;
  IF upper(COALESCE(p_acao, '')) NOT IN ('CONFERIDO', 'DIVERGENCIA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a conferência do ofício termina em CONFERIDO ou DIVERGENCIA.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.etapa <> 'OFICIO' THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: A conferência do ofício é feita com o ofício recebido.' USING ERRCODE = '22023';
  END IF;
  IF p_linhas IS NOT NULL THEN
    v_salvo := public.salvar_pedido_emenda(jsonb_build_object(
      'id', p_id, 'versao', p_versao, 'autor_id', v_p.autor_id, 'observacao', v_p.observacao,
      'contato_nome', v_p.contato_nome, 'contato_telefone', v_p.contato_telefone, 'contato_email', v_p.contato_email,
      'motivo', NULLIF(btrim(COALESCE(p_motivo, '')), ''), 'linhas', p_linhas));
    v_versao := (v_salvo->>'versao')::INTEGER;
  END IF;
  RETURN public.avancar_pedido_emenda(p_id, v_versao, p_acao, p_dados);
END;
$$;
REVOKE ALL ON FUNCTION public.conferir_oficio_pedido(UUID, INTEGER, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.conferir_oficio_pedido(UUID, INTEGER, TEXT, JSONB, JSONB, TEXT) TO authenticated;
