-- ==============================================================================
-- Migration 231: valor da emenda no SIOP × valor do ofício (protótipo aprovado em 28/10/2026, D1–D7)
--
-- Até aqui cada pedido guardava um só "valor no SIOP" (siop_valor), que às vezes era o valor da emenda e às vezes o do
-- ofício (Sargento Fahur: SIOP R$ 6.595.176, ofício retificador R$ 6.194.520; a sobra de R$ 400.656 sumia).
--   D1 o valor da emenda fica na emenda (emendas_siop, um por ano + nº), com a data da leitura (vista_em) e quem leu;
--   D2 o valor do ofício fica em cada pedido (oficio_valor), com o documento SEI e a marca de retificador;
--   D3 sobra = valor da emenda − soma dos ofícios (conta nas telas);
--   D5 passagem: pedido único da emenda → o valor de hoje vira o do ofício; vários pedidos → "a informar".
-- siop_valor fica no banco como o valor visto na conferência (histórico); as telas deixam de usá-lo.
-- ==============================================================================

-- 1) Valor do ofício no pedido
ALTER TABLE public.emenda_pedidos
  ADD COLUMN IF NOT EXISTS oficio_valor NUMERIC(18, 2) CHECK (oficio_valor IS NULL OR oficio_valor > 0),
  ADD COLUMN IF NOT EXISTS oficio_valor_documento_sei VARCHAR(10) CHECK (oficio_valor_documento_sei IS NULL OR oficio_valor_documento_sei ~ '^[0-9]{7,10}$'),
  ADD COLUMN IF NOT EXISTS oficio_valor_retificador BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.emenda_pedidos.oficio_valor IS
  'Valor pedido no ofício do parlamentar (com retificador, o do retificador). O valor da emenda fica em emendas_siop (migration 231).';
COMMENT ON COLUMN public.emenda_pedidos.oficio_valor_documento_sei IS 'Documento SEI do ofício (ou do retificador) que deu o valor (migration 231).';
COMMENT ON COLUMN public.emenda_pedidos.siop_valor IS
  'Valor da emenda visto na conferência (histórico). O valor que vale é o de emendas_siop; o do pedido é oficio_valor (migration 231).';

-- 2) Pedido que volta à reserva (anulação total) perde o valor do ofício junto com a conferência.
CREATE OR REPLACE FUNCTION public.trg_emendas_pedido_limpa_oficio_valor()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.etapa = 'RESERVADO' AND OLD.etapa <> 'RESERVADO' AND NEW.siop_emenda IS NULL THEN
    NEW.oficio_valor := NULL;
    NEW.oficio_valor_documento_sei := NULL;
    NEW.oficio_valor_retificador := FALSE;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_pedido_limpa_oficio_valor() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_emendas_pedido_limpa_oficio_valor ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_pedido_limpa_oficio_valor
  BEFORE UPDATE OF etapa ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_pedido_limpa_oficio_valor();

-- 3) Passagem dos dados de hoje (D5)
-- 3a) Emenda registrada para todo nº conferido que ainda não tem registro (valor = o maior dos pedidos).
INSERT INTO public.emendas_siop (ano, numero, autor_id, valor, gnd, vista_em, observacao, criado_por_nome, atualizado_por_nome)
SELECT x.ano, x.numero, x.autor_id, x.valor, x.gnd, x.vista_em,
       'Valor trazido dos pedidos (migration 231).', 'Sistema (migration 231)', 'Sistema (migration 231)'
  FROM (SELECT DISTINCT ON (p.siop_emenda_ano, p.siop_emenda)
               p.siop_emenda_ano AS ano, p.siop_emenda AS numero, p.autor_id, max(p.siop_valor) OVER w AS valor,
               COALESCE(p.siop_gnd, 'GND-4') AS gnd,
               COALESCE(min(p.conferido_em) OVER w, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE) AS vista_em
          FROM public.emenda_pedidos p
         WHERE p.etapa <> 'CANCELADO' AND p.siop_emenda ~ '^[0-9]{8}$' AND p.siop_emenda_ano IS NOT NULL AND p.autor_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.emendas_siop e WHERE e.ano = p.siop_emenda_ano AND e.numero = p.siop_emenda)
        WINDOW w AS (PARTITION BY p.siop_emenda_ano, p.siop_emenda)
         ORDER BY p.siop_emenda_ano, p.siop_emenda, p.siop_valor DESC NULLS LAST, p.numero) x
 WHERE x.valor > 0;
-- (emenda sem valor em nenhum pedido fica de fora: entra pela leitura do SIOP)

-- 3b) Pedidos ligados à emenda registrada.
UPDATE public.emenda_pedidos p SET emenda_id = e.id
  FROM public.emendas_siop e
 WHERE p.emenda_id IS NULL AND p.etapa <> 'CANCELADO' AND e.numero = p.siop_emenda AND e.ano = p.siop_emenda_ano;

-- 3c) Valor do ofício: só quando o pedido é o único da emenda (vários pedidos guardavam o valor da emenda repetido).
UPDATE public.emenda_pedidos p SET oficio_valor = p.siop_valor, oficio_valor_documento_sei = p.oficio_documento_sei
 WHERE p.etapa <> 'CANCELADO' AND p.siop_valor > 0 AND p.oficio_valor IS NULL AND p.siop_emenda IS NOT NULL
   AND (p.oficio_documento_sei IS NULL OR p.oficio_documento_sei ~ '^[0-9]{7,10}$')
   AND NOT EXISTS (SELECT 1 FROM public.emenda_pedidos o
                    WHERE o.id <> p.id AND o.etapa <> 'CANCELADO' AND o.siop_emenda = p.siop_emenda
                      AND o.siop_emenda_ano IS NOT DISTINCT FROM p.siop_emenda_ano);

-- 4) Valor do ofício depois da conferência (ofício a informar, ou retificador que muda o valor).
CREATE OR REPLACE FUNCTION public.salvar_valor_oficio_pedido(p_id UUID, p_versao INTEGER, p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_valor  NUMERIC;
  v_sei    TEXT;
  v_nome   TEXT;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram o valor do ofício.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa = 'CANCELADO' OR v_p.siop_emenda IS NULL THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: o valor do ofício é registrado no pedido conferido com o SIOP.' USING ERRCODE = '22023';
  END IF;
  v_valor := NULLIF(p->>'valor', '')::NUMERIC;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o valor do ofício.' USING ERRCODE = '22023';
  END IF;
  v_sei := NULLIF(regexp_replace(COALESCE(p->>'documento_sei', ''), '\D', '', 'g'), '');
  IF v_sei IS NULL OR v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o documento SEI do ofício (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  UPDATE public.emenda_pedidos SET oficio_valor = v_valor, oficio_valor_documento_sei = v_sei,
         oficio_valor_retificador = COALESCE((p->>'retificador')::BOOLEAN, FALSE),
         versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_valor_oficio_pedido(UUID, INTEGER, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_valor_oficio_pedido(UUID, INTEGER, JSONB) TO authenticated;

-- 5) Conferência com o SIOP: grava o valor da emenda na emenda e o do ofício no pedido.
--    Igual à da migration 230, só o bloco CONFERIDO muda. CREATE OR REPLACE mantém as permissões.
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
    UPDATE public.emenda_pedidos SET etapa = 'MINUTA', minuta_em = v_data WHERE id = p_id;

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
           oficio_documento_sei = NULL, oficio_numero = NULL, divergencia = btrim(v_d->>'texto'), devolvido_em = v_data
     WHERE id = p_id;

  ELSIF v_acao = 'CONFERIDO' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A conferência com o SIOP vem depois do ofício.' USING ERRCODE = '22023';
    END IF;
    v_conf := v_d->'conferencia';
    IF v_conf IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['numero_emenda', 'autor', 'valor', 'gnd', 'beneficiario', 'objeto']) k
       WHERE (v_conf->>k)::BOOLEAN IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: os 6 pontos da conferência (nº da emenda, autor, valor, GND, beneficiário e objeto) precisam bater.' USING ERRCODE = '22023';
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
    -- Migration 231: o valor da emenda no SIOP fica na emenda (emendas_siop, um por emenda) e o do ofício no pedido.
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


-- 6) Registrar emenda cujo nº já está em pedido: em vez de recusar, registra e liga os pedidos (D1, uma por emenda).
CREATE OR REPLACE FUNCTION public.salvar_emenda_siop(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id      UUID;
  v_nome    TEXT;
  v_numero  CHAR(8);
  v_ano     SMALLINT;
  v_autor   TEXT;
  v_valor   NUMERIC;
  v_gnd     TEXT;
  v_benef   UUID;
  v_vista   DATE;
  v_atual   RECORD;
  v_versao  INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram emendas.' USING ERRCODE = '42501';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(p->>'id', '')::UUID;
  SELECT n.numero, n.ano INTO v_numero, v_ano FROM public.emendas_numero_e_ano(p->>'numero', NULLIF(p->>'ano', '')::INTEGER) n;
  v_autor := NULLIF(btrim(COALESCE(p->>'autor_id', '')), '');
  IF v_autor IS NULL OR NOT EXISTS (SELECT 1 FROM public.emenda_autores WHERE id = v_autor) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar ou a bancada.' USING ERRCODE = '22023';
  END IF;
  v_valor := NULLIF(p->>'valor', '')::NUMERIC;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o valor da emenda no SIOP.' USING ERRCODE = '22023';
  END IF;
  v_gnd := p->>'gnd';
  IF v_gnd IS NULL OR v_gnd NOT IN ('GND-3', 'GND-4') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o GND (3 ou 4).' USING ERRCODE = '22023';
  END IF;
  v_benef := NULLIF(p->>'beneficiario_id', '')::UUID;
  IF v_benef IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emenda_beneficiarios WHERE id = v_benef) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: beneficiário não encontrado.' USING ERRCODE = '22023';
  END IF;
  v_vista := COALESCE(NULLIF(p->>'vista_em', '')::DATE, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
  IF v_vista > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a data em que a emenda foi vista no SIOP não pode ser futura.' USING ERRCODE = '22023';
  END IF;

  -- Migration 231: nº que já está em pedido também se registra (uma emenda por ano + nº) e os pedidos passam a apontar
  -- para ela; antes a RPC recusava com JA_TEM_PEDIDO.

  IF v_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.emendas_siop WHERE ano = v_ano AND numero = v_numero) THEN
      RAISE EXCEPTION 'JA_REGISTRADA: A emenda % % de % já está registrada.', left(v_numero, 4), right(v_numero, 4), v_ano USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.emendas_siop (ano, numero, autor_id, valor, gnd, beneficiario_id, objeto, vista_em, observacao,
                                     criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_ano, v_numero, v_autor, v_valor, v_gnd, v_benef, NULLIF(btrim(p->>'objeto'), ''), v_vista, NULLIF(btrim(p->>'observacao'), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao INTO v_id, v_versao;
    UPDATE public.emenda_pedidos SET emenda_id = v_id
     WHERE etapa <> 'CANCELADO' AND emenda_id IS NULL AND siop_emenda = v_numero AND COALESCE(siop_emenda_ano, v_ano) = v_ano;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
  END IF;

  SELECT * INTO v_atual FROM public.emendas_siop WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Emenda não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF (p->>'versao')::INTEGER IS DISTINCT FROM v_atual.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou esta emenda. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF (v_numero, v_ano) IS DISTINCT FROM (v_atual.numero, v_atual.ano) THEN
    IF EXISTS (SELECT 1 FROM public.emenda_pedidos WHERE emenda_id = v_id AND etapa <> 'CANCELADO') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda já tem pedido; o nº não muda.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.emendas_siop WHERE ano = v_ano AND numero = v_numero AND id <> v_id) THEN
      RAISE EXCEPTION 'JA_REGISTRADA: A emenda % % de % já está registrada.', left(v_numero, 4), right(v_numero, 4), v_ano USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE public.emendas_siop SET
    ano = v_ano, numero = v_numero, autor_id = v_autor, valor = v_valor, gnd = v_gnd, beneficiario_id = v_benef,
    objeto = NULLIF(btrim(p->>'objeto'), ''), vista_em = v_vista, observacao = NULLIF(btrim(p->>'observacao'), ''),
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
END;
$$;
