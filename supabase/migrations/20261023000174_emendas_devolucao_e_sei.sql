-- ==============================================================================
-- MIGRATION 174: EMENDAS PARLAMENTARES — OFÍCIO DEVOLVIDO VOLTA PARA A MINUTA E ETAPAS DO EMPENHO COM O SEI
-- Versão: 20261023000174_emendas_devolucao_e_sei.sql
--
-- Protótipo aprovado em 23-24/10/2026:
-- 1) Ofício com divergência volta para a minuta: a CAEP faz a nova minuta, manda ao gabinete e espera o novo ofício.
--    A tentativa devolvida (minuta, ofício e motivo) fica em emenda_pedido_devolucoes. O processo SEI continua o mesmo
--    (o novo ofício entra nele e pode ser trocado). O aviso "30 dias sem ofício" passa a contar da devolução
--    (devolvido_em). A divergência é registrada com o ofício recebido, antes ou durante a conferência no SIOP.
-- 2) Etapas do empenho como acontecem (9 etapas):
--      Reservado → Minuta enviada → Ofício recebido → Conferido no SIOP → Solicitação de empenho (CAEP → DGFNSP)
--      → Empenho autorizado (DGFNSP) → Enviado à CGOFI → Empenhado (CGOFI) → Enviado para contratação (CAEP → CCGA).
--    Antes eram 6: "Empenhado" juntava o empenho e o envio à CCGA.
-- 3) SEI obrigatório nas etapas com documento (só números, 7 a 10 dígitos): ofício (documento + processo), solicitação,
--    autorização e envio à CGOFI (um número cada); empenho e envio para contratação (um ou mais: sai um por nota, e uma
--    emenda tem uma nota por fornecedor). Número a mais depois: ação ACRESCENTAR_SEI. Reservado, minuta e
--    conferência no SIOP ficam só com a data.
-- 4) Sai o número do ofício (o pedido é identificado pelo processo SEI) e sai a nota de empenho do registro do
--    empenho: as notas são achadas pelo sistema (migration 164), agora também nos pedidos enviados para contratação.
-- 5) Pedido do empenho em diante não muda nem é cancelado; alterar itens da conferência até o envio à CGOFI volta o
--    pedido para "Ofício recebido" (como já era com Conferido e Autorizado).
--
-- Colunas antigas (minuta_documento_sei, oficio_numero, emenda_pedido_linhas.nota_empenho) ficam, sem uso novo:
-- em 23/10/2026 só um pedido de teste cancelado tinha minuta_documento_sei e oficio_numero, e nenhuma linha tinha nota.
-- Os pedidos da planilha passam para "Enviado para contratação" na carga dos despachos (fora desta migration).
-- ==============================================================================

ALTER TABLE public.emenda_pedidos
  ADD COLUMN IF NOT EXISTS oficio_documento_sei       VARCHAR(40),
  ADD COLUMN IF NOT EXISTS devolvido_em               DATE,
  ADD COLUMN IF NOT EXISTS solicitado_em              DATE,
  ADD COLUMN IF NOT EXISTS solicitado_documento_sei   VARCHAR(40),
  ADD COLUMN IF NOT EXISTS cgofi_em                   DATE,
  ADD COLUMN IF NOT EXISTS cgofi_documento_sei        VARCHAR(40),
  ADD COLUMN IF NOT EXISTS empenhado_documentos_sei   TEXT[],
  ADD COLUMN IF NOT EXISTS contratacao_em             DATE,
  ADD COLUMN IF NOT EXISTS contratacao_documentos_sei TEXT[];

ALTER TABLE public.emenda_pedidos DROP CONSTRAINT IF EXISTS emenda_pedidos_etapa;
ALTER TABLE public.emenda_pedidos ADD CONSTRAINT emenda_pedidos_etapa CHECK (etapa IN (
  'RESERVADO', 'MINUTA', 'OFICIO', 'CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI', 'EMPENHADO', 'CONTRATACAO', 'CANCELADO'));

COMMENT ON COLUMN public.emenda_pedidos.oficio_documento_sei IS 'Documento SEI do ofício recebido do parlamentar.';
COMMENT ON COLUMN public.emenda_pedidos.devolvido_em IS
  'Data da última devolução do ofício (o pedido voltou para a minuta). O aviso "30 dias sem ofício" conta daqui.';
COMMENT ON COLUMN public.emenda_pedidos.divergencia IS
  'O que não bateu no último ofício devolvido; some quando chega o novo ofício.';
COMMENT ON COLUMN public.emenda_pedidos.solicitado_documento_sei IS 'Documento SEI da solicitação de empenho (CAEP → DGFNSP).';
COMMENT ON COLUMN public.emenda_pedidos.autorizado_documento_sei IS 'Documento SEI da autorização de empenho (DGFNSP).';
COMMENT ON COLUMN public.emenda_pedidos.cgofi_documento_sei IS 'Documento SEI do envio à CGOFI para o empenho.';
COMMENT ON COLUMN public.emenda_pedidos.empenhado_documentos_sei IS 'Documentos SEI do empenho (CGOFI): um por nota.';
COMMENT ON COLUMN public.emenda_pedidos.contratacao_documentos_sei IS 'Documentos SEI do despacho para contratação (CAEP → CCGA): um por nota.';

ALTER TABLE public.emenda_pedido_linhas ADD COLUMN IF NOT EXISTS despacho_documento_sei VARCHAR(40);
COMMENT ON COLUMN public.emenda_pedido_linhas.despacho_documento_sei IS
  'Documento SEI do despacho para contratação da nota desta linha (planilha de execução da CAEP).';

CREATE TABLE IF NOT EXISTS public.emenda_pedido_devolucoes (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id            UUID         NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  rodada               INTEGER      NOT NULL CHECK (rodada > 0),
  minuta_em            DATE,
  oficio_em            DATE,
  oficio_documento_sei VARCHAR(40),
  oficio_processo_sei  VARCHAR(40),
  oficio_numero        VARCHAR(80),
  motivo               TEXT         NOT NULL,
  devolvido_em         DATE         NOT NULL,
  criado_por           UUID,
  criado_por_nome      VARCHAR(200),
  criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_pedido_devolucoes_rodada UNIQUE (pedido_id, rodada)
);
COMMENT ON TABLE public.emenda_pedido_devolucoes IS
  'Tentativas devolvidas do pedido: a minuta e o ofício com divergência, e o motivo. Grava só por avancar_pedido_emenda.';

DO $$
DECLARE v_t TEXT := 'emenda_pedido_devolucoes';
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leitura das emendas: ' || v_t, v_t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_permission(''emendas.view'')))',
                 'Leitura das emendas: ' || v_t, v_t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Somente usuario ativo', v_t);
  EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
                 'USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))', 'Somente usuario ativo', v_t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', v_t);
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || v_t, v_t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()', 'trg_audit_' || v_t, v_t);
  END IF;
END $$;

-- Avança o pedido de etapa. p_acao e p_dados (documento_sei: só números, 7 a 10 dígitos; documentos_sei: lista deles):
--   MINUTA         { data }                              (de Reservado; também a nova minuta depois da devolução)
--   OFICIO         { documento_sei, processo_sei, data } (de Reservado ou Minuta; também corrige o ofício)
--   DIVERGENCIA    { texto, data }                       (de Ofício recebido: volta para a minuta)
--   CONFERIDO      { emenda, valor, gnd, data, conferencia: {numero_emenda, autor, valor, gnd, beneficiario, objeto} } (de Ofício)
--   SOLICITADO     { documento_sei, data }               (de Conferido: solicitação de empenho à DGFNSP)
--   AUTORIZADO     { documento_sei, data }               (de Solicitado: autorização da DGFNSP)
--   CGOFI          { documento_sei, data }               (de Autorizado: envio à CGOFI)
--   EMPENHADO      { documentos_sei, data }              (de Enviado à CGOFI)
--   CONTRATACAO    { documentos_sei, data }              (de Empenhado: despacho para contratação à CCGA)
--   ACRESCENTAR_SEI { etapa: EMPENHADO | CONTRATACAO, documentos_sei } (número de uma nota nova, sem mudar de etapa)
CREATE OR REPLACE FUNCTION public.avancar_pedido_emenda(p_id UUID, p_versao INTEGER, p_acao TEXT, p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF v_acao IN ('OFICIO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN
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
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: todas as linhas precisam de beneficiário antes da conferência.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CONFERIDO', siop_emenda = left(btrim(v_d->>'emenda'), 40),
           siop_valor = NULLIF(v_d->>'valor', '')::NUMERIC, siop_gnd = v_d->>'gnd', siop_conferencia = v_conf,
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
    UPDATE public.emenda_pedidos SET etapa = 'AUTORIZADO', autorizado_em = v_data, autorizado_documento_sei = v_sei WHERE id = p_id;

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
    IF v_d->>'etapa' = 'EMPENHADO' AND v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') THEN
      UPDATE public.emenda_pedidos SET empenhado_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(empenhado_documentos_sei, '{}') || v_seis) n ORDER BY n) WHERE id = p_id;
    ELSIF v_d->>'etapa' = 'CONTRATACAO' AND v_p.etapa = 'CONTRATACAO' THEN
      UPDATE public.emenda_pedidos SET contratacao_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(contratacao_documentos_sei, '{}') || v_seis) n ORDER BY n) WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'ETAPA_INVALIDA: Só se acrescenta número ao empenho ou ao envio para contratação já registrados.' USING ERRCODE = '22023';
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

-- Alterar o pedido: as etapas novas da conferência ao envio à CGOFI voltam ao ofício; do empenho em diante não muda.
-- p_pedido: { id?, versao? (obrigatória ao alterar), autor_id?, para_orgao?, observacao, contato_nome?, contato_telefone?,
--   contato_email?, motivo? (das linhas tiradas), linhas: [{ id?, tipo: ITEM|KIT, item_key | kit_id, quantidade, beneficiario_id? }] }.
-- Novo pedido nasce Reservado: com autor_id, ou sem autor quando para_orgao = true (aí toda linha tem beneficiário).
-- Reserva sem autor recebe o autor_id depois; pedido com autor não troca de autor. Alterar itens/quantidades de pedido
-- da conferência no SIOP até o envio à CGOFI volta o pedido para "Ofício recebido" (migration 174). Empenhado, enviado para
-- contratação ou cancelado não muda.
CREATE OR REPLACE FUNCTION public.salvar_pedido_emenda(p_pedido JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id     UUID;
  v_autor  TEXT;
  v_orgao  BOOLEAN;
  v_nome   TEXT;
  v_atual  RECORD;
  v_mudou  BOOLEAN;
  v_versao INTEGER;
  v_numero INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram pedidos.' USING ERRCODE = '42501';
  END IF;
  IF p_pedido IS NULL OR jsonb_typeof(p_pedido) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(p_pedido->>'id', '')::UUID;
  v_autor := NULLIF(btrim(COALESCE(p_pedido->>'autor_id', '')), '');
  v_orgao := COALESCE((p_pedido->>'para_orgao')::BOOLEAN, FALSE);
  IF v_autor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emenda_autores WHERE id = v_autor) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: autor não encontrado.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF v_autor IS NULL AND NOT v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar ou a bancada, ou marque a reserva para um órgão.' USING ERRCODE = '22023';
    END IF;
    IF v_autor IS NOT NULL AND v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: reserva para um órgão não tem parlamentar.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedidos (autor_id, observacao, contato_nome, contato_telefone, contato_email, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_autor, NULLIF(btrim(p_pedido->>'observacao'), ''), NULLIF(btrim(p_pedido->>'contato_nome'), ''),
            NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''), NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao, numero INTO v_id, v_versao, v_numero;
    PERFORM public.emendas_gravar_linhas(v_id, p_pedido->'linhas', NULL);
    IF v_autor IS NULL AND EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = v_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: na reserva para um órgão, todas as linhas precisam do beneficiário.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
  END IF;

  SELECT * INTO v_atual FROM public.emenda_pedidos WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (p_pedido->>'versao')::INTEGER IS DISTINCT FROM v_atual.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_atual.etapa IN ('EMPENHADO', 'CONTRATACAO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Pedido % não pode ser alterado.', CASE v_atual.etapa WHEN 'CANCELADO' THEN 'cancelado' ELSE 'empenhado' END USING ERRCODE = '22023';
  END IF;
  IF v_autor IS NOT NULL AND v_atual.autor_id IS NOT NULL AND v_autor <> v_atual.autor_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o autor do pedido não muda. Cancele e faça uma nova reserva.' USING ERRCODE = '22023';
  END IF;

  v_mudou := public.emendas_gravar_linhas(v_id, p_pedido->'linhas', p_pedido->>'motivo');
  IF COALESCE(v_autor, v_atual.autor_id) IS NULL
     AND EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = v_id AND NOT cancelada AND beneficiario_id IS NULL AND beneficiario_nome IS NULL) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: na reserva para um órgão, todas as linhas precisam do beneficiário.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET
    autor_id = COALESCE(autor_id, v_autor),
    observacao = NULLIF(btrim(p_pedido->>'observacao'), ''),
    contato_nome = NULLIF(btrim(p_pedido->>'contato_nome'), ''),
    contato_telefone = NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''),
    contato_email = NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
    etapa = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN 'OFICIO' ELSE etapa END,
    siop_conferencia = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE siop_conferencia END,
    conferido_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE conferido_em END,
    solicitado_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE solicitado_em END,
    solicitado_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE solicitado_documento_sei END,
    autorizado_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE autorizado_em END,
    autorizado_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE autorizado_documento_sei END,
    cgofi_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE cgofi_em END,
    cgofi_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE cgofi_documento_sei END,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao, numero INTO v_versao, v_numero;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_pedido_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_pedido_emenda(JSONB) TO authenticated;

-- Cancela o pedido inteiro (antes do empenho): a quantidade volta ao saldo da CAEP.
CREATE OR REPLACE FUNCTION public.cancelar_pedido_emenda(p_id UUID, p_versao INTEGER, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p RECORD;
  v_nome TEXT;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador cancelam pedidos.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa IN ('EMPENHADO', 'CONTRATACAO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Pedido % não pode ser cancelado.', CASE v_p.etapa WHEN 'CANCELADO' THEN 'já cancelado' ELSE 'empenhado' END USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o motivo do cancelamento.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  UPDATE public.emenda_pedidos
     SET etapa = 'CANCELADO', cancelado_em = (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, cancelado_motivo = left(btrim(p_motivo), 500),
         versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_pedido_emenda(UUID, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_emenda(UUID, INTEGER, TEXT) TO authenticated;

-- Notas das linhas: também dos pedidos enviados para contratação (antes eram só os empenhados).
CREATE OR REPLACE FUNCTION public.emendas_ligar_notas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_res  JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador atualizam as notas.' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_emenda_notas (
    linha_id UUID PRIMARY KEY, empenho_id UUID, regra TEXT, motivo TEXT, contract_key TEXT
  ) ON COMMIT DROP;
  TRUNCATE tmp_emenda_notas;

  WITH l AS (
    SELECT l.id, l.item_key, l.contrato_numero, p.siop_emenda AS emenda,
           EXTRACT(YEAR FROM COALESCE(p.empenhado_em, (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE))::INTEGER AS ano
      FROM public.emenda_pedido_linhas l
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id
     WHERE NOT l.cancelada AND p.etapa IN ('EMPENHADO', 'CONTRATACAO') AND l.item_key IS NOT NULL),
  ne AS (
    SELECT e.id, e.ano_exercicio, ce.contract_key, co.numero AS contrato,
           substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') AS emenda_txt,
           substring(e.plano_interno from '^SP999S?9?([0-9]{4})') AS autor_pi
      FROM public.empenhos e
      JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
      JOIN public.contratos_oficiais co ON co.contract_key = ce.contract_key),
  ic AS (SELECT DISTINCT item_key, contract_key FROM public.arp_item_contract_links),
  a AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ne ON ne.contrato = l.contrato_numero AND ne.emenda_txt = l.emenda AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  b AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt = l.emenda AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  c AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt IS NULL AND ne.autor_pi = substr(l.emenda, 1, 4) AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  ctr AS (SELECT DISTINCT co.numero, co.contract_key,
                 EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.contract_key = co.contract_key) AS tem_nota
            FROM public.contratos_oficiais co WHERE co.uasg = '200331')
  INSERT INTO tmp_emenda_notas (linha_id, empenho_id, regra, motivo, contract_key)
  SELECT l.id,
         CASE WHEN a.n = 1 THEN a.empenho_id WHEN COALESCE(a.n, 0) = 0 AND b.n = 1 THEN b.empenho_id
              WHEN COALESCE(a.n, 0) = 0 AND COALESCE(b.n, 0) = 0 AND c.n = 1 THEN c.empenho_id END,
         CASE WHEN a.n = 1 THEN 'CONTRATO' WHEN COALESCE(a.n, 0) = 0 AND b.n = 1 THEN 'ITEM'
              WHEN COALESCE(a.n, 0) = 0 AND COALESCE(b.n, 0) = 0 AND c.n = 1 THEN 'AUTOR' END,
         CASE WHEN a.n = 1 OR (COALESCE(a.n, 0) = 0 AND b.n = 1) OR (COALESCE(a.n, 0) = 0 AND COALESCE(b.n, 0) = 0 AND c.n = 1) THEN NULL
              WHEN a.n > 1 OR b.n > 1 OR c.n > 1 THEN 'VARIAS'
              WHEN l.emenda IS NULL THEN 'SEM_EMENDA'
              WHEN l.contrato_numero IS NULL THEN 'SEM_CONTRATO'
              WHEN ctr.contract_key IS NULL THEN 'CONTRATO_FORA'
              WHEN NOT ctr.tem_nota THEN 'CONTRATO_SEM_NOTA'
              ELSE 'OUTRAS_EMENDAS' END,
         CASE WHEN a.n = 1 THEN a.contract_key WHEN COALESCE(a.n, 0) = 0 AND b.n = 1 THEN b.contract_key
              WHEN COALESCE(a.n, 0) = 0 AND COALESCE(b.n, 0) = 0 AND c.n = 1 THEN c.contract_key ELSE ctr.contract_key END
    FROM l
    LEFT JOIN a ON a.id = l.id
    LEFT JOIN b ON b.id = l.id
    LEFT JOIN c ON c.id = l.id
    LEFT JOIN ctr ON ctr.numero = l.contrato_numero;

  DELETE FROM public.emenda_linha_notas n WHERE NOT EXISTS (SELECT 1 FROM tmp_emenda_notas t WHERE t.linha_id = n.linha_id);

  INSERT INTO public.emenda_linha_notas AS d (linha_id, empenho_id, nota, regra, motivo, contract_key, valor_empenhado, valor_liquidado,
                                              valor_pago, entrega_prevista, entrega_prevista_valor, atualizado_em)
  SELECT t.linha_id, t.empenho_id, e.numero_oficial, t.regra, t.motivo, t.contract_key, e.valor_empenhado, e.valor_liquidado, e.valor_pago,
         ep.data_prevista, ep.valor, NOW()
    FROM tmp_emenda_notas t
    LEFT JOIN public.empenhos e ON e.id = t.empenho_id
    LEFT JOIN LATERAL (
      SELECT x.data_prevista, x.valor FROM public.contrato_entregas_previstas x
       WHERE x.contract_key = t.contract_key AND x.situacao = 'PREVISTA' AND x.data_prevista >= v_hoje
         AND (x.empenho_canonical_key IS NULL OR x.empenho_canonical_key = e.canonical_key)
       ORDER BY x.data_prevista LIMIT 1) ep ON TRUE
  ON CONFLICT (linha_id) DO UPDATE SET
    empenho_id = EXCLUDED.empenho_id, nota = EXCLUDED.nota, regra = EXCLUDED.regra, motivo = EXCLUDED.motivo,
    contract_key = EXCLUDED.contract_key, valor_empenhado = EXCLUDED.valor_empenhado, valor_liquidado = EXCLUDED.valor_liquidado,
    valor_pago = EXCLUDED.valor_pago, entrega_prevista = EXCLUDED.entrega_prevista, entrega_prevista_valor = EXCLUDED.entrega_prevista_valor,
    atualizado_em = EXCLUDED.atualizado_em;

  SELECT jsonb_build_object('linhas', count(*), 'com_nota', count(*) FILTER (WHERE empenho_id IS NOT NULL),
                            'por_motivo', (SELECT jsonb_object_agg(motivo, n) FROM (SELECT motivo, count(*) n FROM public.emenda_linha_notas WHERE motivo IS NOT NULL GROUP BY 1) s))
    INTO v_res FROM public.emenda_linha_notas;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_ligar_notas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_ligar_notas() TO authenticated, service_role;
