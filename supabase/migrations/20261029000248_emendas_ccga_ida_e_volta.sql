-- ==============================================================================
-- Envio à CCGA por ata, devolução à CAEP e Voltar etapa (protótipo aprovado em 29/10/2026, D1–D8)
--
-- 1) emenda_pedido_linhas.ccga_*: situação de cada item na CCGA (ENVIADA ou DEVOLVIDA; vazio = não enviado), com a data,
--    o motivo e a explicação da devolução. O despacho continua em despacho_documento_sei.
-- 2) emenda_pedido_movimentos: histórico do vai e volta (envio, devolução, envio desfeito) e das etapas voltadas, com
--    o que foi apagado. É dele que sai o aviso "Envio desfeito pela CAEP" ao gestor da ata.
-- 3) enviar_pedido_ccga: a CAEP envia uma ou mais atas, com o despacho SEI de cada uma (D1). Vale em EMPENHADO e em
--    CONTRATACAO (o pedido que chegou à contratação pelo contrato da fonte ainda pode ter itens a enviar).
-- 4) devolver_itens_ccga: o gestor da ata (ou o coordenador) devolve itens da sua ata, com motivo e explicação (D3, D4).
-- 5) desfazer_envio_ccga: a CAEP tira itens da CCGA sem esperar o gestor da ata (D6); também encerra uma devolução.
-- 6) voltar_etapa_pedido: desfaz o último passo até o envio à CGOFI, com motivo (D7). Nota emitida não volta.
-- 7) emendas_a_contratar: o que cada gestor de ata vê no Início (D1, D2): itens enviados sem contrato e os envios
--    desfeitos nos últimos 7 dias. Item com contrato no Contratos.gov.br sai sozinho (D3).
-- 8) Gatilhos: o envio antigo (pedido inteiro) marca os itens; anulação, cancelamento e volta para antes do empenho
--    limpam a situação na CCGA.
-- 9) Carga: os itens dos pedidos já enviados à CCGA (sem ser pela fonte) ficam ENVIADA na data do envio.
-- ==============================================================================

-- 1) Situação do item na CCGA -----------------------------------------------------------------------------------
ALTER TABLE public.emenda_pedido_linhas
  ADD COLUMN IF NOT EXISTS ccga_situacao   VARCHAR(9),
  ADD COLUMN IF NOT EXISTS ccga_em         DATE,
  ADD COLUMN IF NOT EXISTS ccga_motivo     VARCHAR(60),
  ADD COLUMN IF NOT EXISTS ccga_explicacao TEXT,
  ADD COLUMN IF NOT EXISTS ccga_por_nome   VARCHAR(200);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_pedido_linhas_ccga_situacao') THEN
    ALTER TABLE public.emenda_pedido_linhas ADD CONSTRAINT emenda_pedido_linhas_ccga_situacao
      CHECK (ccga_situacao IS NULL OR ccga_situacao IN ('ENVIADA', 'DEVOLVIDA'));
  END IF;
END $$;
COMMENT ON COLUMN public.emenda_pedido_linhas.ccga_situacao IS
  'Item na CCGA (migration 248): ENVIADA (aguarda contrato com o gestor da ata) ou DEVOLVIDA (voltou à CAEP); vazio = não enviado.';
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_linhas_ccga ON public.emenda_pedido_linhas (ccga_situacao) WHERE ccga_situacao IS NOT NULL;

-- 2) Histórico ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_pedido_movimentos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID         NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  acao            VARCHAR(14)  NOT NULL,
  ata_key         VARCHAR(30),
  linha_ids       UUID[]       NOT NULL DEFAULT '{}',
  etapa_de        VARCHAR(12),
  etapa_para      VARCHAR(12),
  documento_sei   VARCHAR(10),
  motivo          VARCHAR(200),
  explicacao      TEXT,
  apagado         JSONB,
  data            DATE         NOT NULL,
  criado_por      UUID,
  criado_por_nome VARCHAR(200),
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_pedido_movimentos_acao CHECK (acao IN ('ENVIO_CCGA', 'DEVOLUCAO_CCGA', 'DESFEITO_CCGA', 'VOLTOU_ETAPA'))
);
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_movimentos_pedido ON public.emenda_pedido_movimentos (pedido_id);
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_movimentos_desfeito ON public.emenda_pedido_movimentos (data) WHERE acao = 'DESFEITO_CCGA';
COMMENT ON TABLE public.emenda_pedido_movimentos IS
  'Vai e volta do pedido com a CCGA e etapas voltadas pela CAEP, com o motivo e o que foi apagado (migration 248). Grava só pelas RPCs.';

ALTER TABLE public.emenda_pedido_movimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_pedido_movimentos" ON public.emenda_pedido_movimentos;
CREATE POLICY "Leitura das emendas: emenda_pedido_movimentos" ON public.emenda_pedido_movimentos
  FOR SELECT TO authenticated USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_pedido_movimentos;
CREATE POLICY "Somente usuario ativo" ON public.emenda_pedido_movimentos AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_pedido_movimentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_pedido_movimentos TO authenticated;
GRANT ALL ON public.emenda_pedido_movimentos TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_pedido_movimentos ON public.emenda_pedido_movimentos;
    CREATE TRIGGER trg_audit_emenda_pedido_movimentos AFTER INSERT OR UPDATE OR DELETE ON public.emenda_pedido_movimentos
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- Ata do item como nas telas de Emendas ("NÚMERO-UASG"); a chave de gestão (ata_managers) sai de chave_gestao_ata.
CREATE OR REPLACE FUNCTION public.emendas_ata_da_linha(p_item_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(split_part(COALESCE(p_item_key, ''), '-', 1) || '-' || split_part(COALESCE(p_item_key, ''), '-', 2), '-');
$$;
REVOKE ALL ON FUNCTION public.emendas_ata_da_linha(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_ata_da_linha(TEXT) TO authenticated, service_role;

-- Item com contrato no Contratos.gov.br: já é contrato assinado e não volta (D3).
CREATE OR REPLACE FUNCTION public.emendas_linha_contratada(p_linha_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.emenda_linha_notas n WHERE n.linha_id = p_linha_id AND n.contract_key IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.emendas_linha_contratada(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_linha_contratada(UUID) TO service_role;

-- Sem item na CCGA e sem contrato, o pedido volta para "Nota de empenho emitida". Chamada só pelas RPCs abaixo.
CREATE OR REPLACE FUNCTION public.emendas_acertar_etapa_ccga(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.emenda_pedidos WHERE id = p_id AND etapa = 'CONTRATACAO')
     AND NOT EXISTS (
       SELECT 1 FROM public.emenda_pedido_linhas l
        WHERE l.pedido_id = p_id AND NOT l.cancelada
          AND (l.ccga_situacao = 'ENVIADA' OR public.emendas_linha_contratada(l.id))
     ) THEN
    UPDATE public.emenda_pedidos
       SET etapa = 'EMPENHADO', contratacao_em = NULL, contratacao_documentos_sei = NULL, contratacao_pela_fonte = FALSE
     WHERE id = p_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_acertar_etapa_ccga(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_acertar_etapa_ccga(UUID) TO service_role;

-- 3) Enviar à CCGA ----------------------------------------------------------------------------------------------
-- p_dados: { data: 'AAAA-MM-DD', envios: [{ ata_key: 'NÚMERO-UASG', documento_sei: '41234567' }] }
CREATE OR REPLACE FUNCTION public.enviar_pedido_ccga(p_id UUID, p_versao INTEGER, p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_nome   TEXT;
  v_d      JSONB := COALESCE(p_dados, '{}'::jsonb);
  v_data   DATE;
  v_hoje   DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_env    JSONB;
  v_ata    TEXT;
  v_sei    TEXT;
  v_linhas UUID[];
  v_seis   TEXT[] := '{}';
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador enviam à CCGA.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa NOT IN ('EMPENHADO', 'CONTRATACAO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: O envio à CCGA vem depois da nota de empenho.' USING ERRCODE = '22023';
  END IF;
  v_data := COALESCE(NULLIF(v_d->>'data', '')::DATE, v_hoje);
  IF v_data > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a data do envio não pode ser futura.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_d->'envios') <> 'array' OR jsonb_array_length(v_d->'envios') = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha pelo menos uma ata.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);

  FOR v_env IN SELECT * FROM jsonb_array_elements(v_d->'envios') LOOP
    v_ata := btrim(COALESCE(v_env->>'ata_key', ''));
    v_sei := regexp_replace(COALESCE(v_env->>'documento_sei', ''), '\D', '', 'g');
    IF v_sei !~ '^[0-9]{7,10}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o despacho SEI da ata % (só números, 7 a 10 dígitos).', split_part(v_ata, '-', 1) USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(l.id ORDER BY l.ordem) INTO v_linhas
      FROM public.emenda_pedido_linhas l
     WHERE l.pedido_id = p_id AND NOT l.cancelada AND public.emendas_ata_da_linha(l.item_key) = v_ata
       AND l.ccga_situacao IS DISTINCT FROM 'ENVIADA' AND NOT public.emendas_linha_contratada(l.id);
    IF v_linhas IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a ata % não tem item a enviar neste pedido.', split_part(v_ata, '-', 1) USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedido_linhas
       SET ccga_situacao = 'ENVIADA', ccga_em = v_data, despacho_documento_sei = v_sei,
           ccga_motivo = NULL, ccga_explicacao = NULL, ccga_por_nome = v_nome
     WHERE id = ANY (v_linhas);
    INSERT INTO public.emenda_pedido_movimentos (pedido_id, acao, ata_key, linha_ids, documento_sei, data, criado_por, criado_por_nome)
    VALUES (p_id, 'ENVIO_CCGA', v_ata, v_linhas, v_sei, v_data, auth.uid(), v_nome);
    v_seis := v_seis || v_sei;
  END LOOP;

  -- Os itens já foram marcados um a um: o gatilho do envio antigo (pedido inteiro) não marca os outros.
  PERFORM set_config('emendas.envio_ccga_por_ata', 'sim', true);
  UPDATE public.emenda_pedidos
     SET etapa = 'CONTRATACAO',
         contratacao_em = CASE WHEN etapa = 'CONTRATACAO' AND contratacao_em IS NOT NULL THEN contratacao_em ELSE v_data END,
         contratacao_documentos_sei = ARRAY(SELECT DISTINCT n FROM unnest(COALESCE(contratacao_documentos_sei, '{}') || v_seis) n ORDER BY n),
         contratacao_pela_fonte = FALSE,
         versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  PERFORM set_config('emendas.envio_ccga_por_ata', '', true);
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.enviar_pedido_ccga(UUID, INTEGER, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.enviar_pedido_ccga(UUID, INTEGER, JSONB) TO authenticated;

-- 4) Devolver à CAEP --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emendas_motivos_devolucao_ccga()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['Item sem saldo na ata', 'Preço reajustado ou apostilado', 'Ata vencida ou perto de vencer',
               'Fornecedor não aceita', 'Despacho ou documento com erro', 'Outro'];
$$;
REVOKE ALL ON FUNCTION public.emendas_motivos_devolucao_ccga() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_motivos_devolucao_ccga() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.devolver_itens_ccga(p_pedido_id UUID, p_linha_ids UUID[], p_motivo TEXT, p_explicacao TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_nome   TEXT;
  v_hoje   DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_expl   TEXT := btrim(COALESCE(p_explicacao, ''));
  v_ata    RECORD;
  v_versao INTEGER;
  v_coord  BOOLEAN := public.has_role('admin') IS TRUE;
BEGIN
  IF NOT v_coord AND public.has_role('gestor') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata e o coordenador devolvem à CAEP.' USING ERRCODE = '42501';
  END IF;
  IF v_motivo <> ALL (public.emendas_motivos_devolucao_ccga()) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o motivo da devolução.' USING ERRCODE = '22023';
  END IF;
  IF v_expl = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: explique para a CAEP o que aconteceu.' USING ERRCODE = '22023';
  END IF;
  IF p_linha_ids IS NULL OR cardinality(p_linha_ids) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha pelo menos um item.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.etapa <> 'CONTRATACAO' THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: O pedido não está na CCGA.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_linha_ids) x(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.emenda_pedido_linhas l
        WHERE l.id = x.id AND l.pedido_id = p_pedido_id AND NOT l.cancelada AND l.ccga_situacao = 'ENVIADA'
          AND NOT public.emendas_linha_contratada(l.id))
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: só voltam itens que estão na CCGA e ainda sem contrato. Recarregue a tela.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_coord AND EXISTS (
    SELECT 1 FROM public.emenda_pedido_linhas l
     WHERE l.id = ANY (p_linha_ids) AND public.gestor_alcanca_ata(public.ata_key_from_item_key(l.item_key)) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: O gestor devolve só os itens das atas dele.' USING ERRCODE = '42501';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);

  UPDATE public.emenda_pedido_linhas
     SET ccga_situacao = 'DEVOLVIDA', ccga_em = v_hoje, ccga_motivo = v_motivo, ccga_explicacao = v_expl, ccga_por_nome = v_nome
   WHERE id = ANY (p_linha_ids);
  FOR v_ata IN
    SELECT public.emendas_ata_da_linha(l.item_key) AS ata, array_agg(l.id ORDER BY l.ordem) AS ids
      FROM public.emenda_pedido_linhas l WHERE l.id = ANY (p_linha_ids) GROUP BY 1
  LOOP
    INSERT INTO public.emenda_pedido_movimentos (pedido_id, acao, ata_key, linha_ids, motivo, explicacao, data, criado_por, criado_por_nome)
    VALUES (p_pedido_id, 'DEVOLUCAO_CCGA', v_ata.ata, v_ata.ids, v_motivo, v_expl, v_hoje, auth.uid(), v_nome);
  END LOOP;
  PERFORM public.emendas_acertar_etapa_ccga(p_pedido_id);
  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_pedido_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_pedido_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.devolver_itens_ccga(UUID, UUID[], TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.devolver_itens_ccga(UUID, UUID[], TEXT, TEXT) TO authenticated;

-- 5) A CAEP desfaz o envio (ou encerra a devolução) ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desfazer_envio_ccga(p_id UUID, p_versao INTEGER, p_linha_ids UUID[], p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_nome   TEXT;
  v_hoje   DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_ata    RECORD;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador desfazem o envio à CCGA.' USING ERRCODE = '42501';
  END IF;
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o motivo.' USING ERRCODE = '22023';
  END IF;
  IF p_linha_ids IS NULL OR cardinality(p_linha_ids) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha pelo menos um item.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_linha_ids) x(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.emenda_pedido_linhas l
        WHERE l.id = x.id AND l.pedido_id = p_id AND NOT l.cancelada AND l.ccga_situacao IS NOT NULL
          AND NOT public.emendas_linha_contratada(l.id))
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: só se desfaz o envio de item na CCGA ou devolvido, sem contrato. Recarregue a tela.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);

  -- Um registro por ata, com o que sai (o despacho e a situação), para o histórico e o aviso ao gestor da ata.
  FOR v_ata IN
    SELECT public.emendas_ata_da_linha(l.item_key) AS ata, array_agg(l.id ORDER BY l.ordem) AS ids,
           min(l.despacho_documento_sei) AS sei,
           jsonb_agg(jsonb_build_object('linha_id', l.id, 'situacao', l.ccga_situacao, 'ccga_em', l.ccga_em,
                                        'despacho_documento_sei', l.despacho_documento_sei, 'motivo', l.ccga_motivo) ORDER BY l.ordem) AS antes
      FROM public.emenda_pedido_linhas l WHERE l.id = ANY (p_linha_ids) GROUP BY 1
  LOOP
    INSERT INTO public.emenda_pedido_movimentos (pedido_id, acao, ata_key, linha_ids, documento_sei, motivo, apagado, data, criado_por, criado_por_nome)
    VALUES (p_id, 'DESFEITO_CCGA', v_ata.ata, v_ata.ids, left(v_ata.sei, 10), left(v_motivo, 200), v_ata.antes, v_hoje, auth.uid(), v_nome);
  END LOOP;
  UPDATE public.emenda_pedido_linhas
     SET ccga_situacao = NULL, ccga_em = NULL, ccga_motivo = NULL, ccga_explicacao = NULL, ccga_por_nome = NULL, despacho_documento_sei = NULL
   WHERE id = ANY (p_linha_ids);
  PERFORM public.emendas_acertar_etapa_ccga(p_id);
  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.desfazer_envio_ccga(UUID, INTEGER, UUID[], TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.desfazer_envio_ccga(UUID, INTEGER, UUID[], TEXT) TO authenticated;

-- 6) Voltar etapa (até o envio à CGOFI) -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.voltar_etapa_pedido(p_id UUID, p_versao INTEGER, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_nome   TEXT;
  v_hoje   DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_para   TEXT;
  v_apag   JSONB;
  v_docs   JSONB;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador voltam a etapa.' USING ERRCODE = '42501';
  END IF;
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o motivo.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);

  IF v_p.etapa = 'MINUTA' THEN
    v_para := 'RESERVADO';
    v_apag := jsonb_build_object('minuta_em', v_p.minuta_em, 'minuta_documento_sei', v_p.minuta_documento_sei, 'minuta_precos', v_p.minuta_precos);
    UPDATE public.emenda_pedidos SET etapa = v_para, minuta_em = NULL, minuta_documento_sei = NULL, minuta_precos = NULL WHERE id = p_id;
  ELSIF v_p.etapa = 'OFICIO' THEN
    -- Correção de registro: não conta como devolução do ofício (essa é a divergência, que pede nova minuta).
    v_para := CASE WHEN v_p.minuta_em IS NULL THEN 'RESERVADO' ELSE 'MINUTA' END;
    v_apag := jsonb_build_object('oficio_em', v_p.oficio_em, 'oficio_documento_sei', v_p.oficio_documento_sei, 'oficio_processo_sei', v_p.oficio_processo_sei);
    UPDATE public.emenda_pedidos SET etapa = v_para, oficio_em = NULL, oficio_documento_sei = NULL, oficio_processo_sei = NULL WHERE id = p_id;
  ELSIF v_p.etapa = 'CONFERIDO' THEN
    v_para := 'OFICIO';
    v_apag := jsonb_build_object('conferido_em', v_p.conferido_em, 'siop_conferencia', v_p.siop_conferencia);
    UPDATE public.emenda_pedidos SET etapa = v_para, conferido_em = NULL, siop_conferencia = NULL WHERE id = p_id;
  ELSIF v_p.etapa = 'SOLICITADO' THEN
    v_para := 'CONFERIDO';
    SELECT jsonb_agg(to_jsonb(d)) INTO v_docs FROM public.emenda_pedido_documentos_sei d
     WHERE d.pedido_id = p_id AND d.etapa = 'AUTORIZACAO' AND d.origem = 'SISTEMA';
    v_apag := jsonb_build_object('solicitado_em', v_p.solicitado_em, 'solicitado_documento_sei', v_p.solicitado_documento_sei, 'solicitacoes', v_docs);
    DELETE FROM public.emenda_pedido_documentos_sei WHERE pedido_id = p_id AND etapa = 'AUTORIZACAO' AND origem = 'SISTEMA';
    UPDATE public.emenda_pedidos SET etapa = v_para, solicitado_em = NULL, solicitado_documento_sei = NULL WHERE id = p_id;
  ELSIF v_p.etapa = 'AUTORIZADO' THEN
    v_para := 'SOLICITADO';
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'documento_sei', d.documento_sei, 'assinado_em', d.assinado_em)) INTO v_docs
      FROM public.emenda_pedido_documentos_sei d
     WHERE d.pedido_id = p_id AND d.etapa = 'AUTORIZACAO' AND d.origem = 'SISTEMA' AND d.assinado_em IS NOT NULL;
    v_apag := jsonb_build_object('autorizado_em', v_p.autorizado_em, 'autorizado_documento_sei', v_p.autorizado_documento_sei, 'assinaturas', v_docs);
    UPDATE public.emenda_pedido_documentos_sei SET assinado_em = NULL
     WHERE pedido_id = p_id AND etapa = 'AUTORIZACAO' AND origem = 'SISTEMA';
    UPDATE public.emenda_pedidos SET etapa = v_para, autorizado_em = NULL, autorizado_documento_sei = NULL WHERE id = p_id;
  ELSIF v_p.etapa = 'CGOFI' THEN
    v_para := 'AUTORIZADO';
    SELECT jsonb_agg(to_jsonb(d)) INTO v_docs FROM public.emenda_pedido_documentos_sei d
     WHERE d.pedido_id = p_id AND d.etapa = 'CGOFI' AND d.origem = 'SISTEMA';
    v_apag := jsonb_build_object('cgofi_em', v_p.cgofi_em, 'cgofi_documento_sei', v_p.cgofi_documento_sei, 'envios', v_docs);
    DELETE FROM public.emenda_pedido_documentos_sei WHERE pedido_id = p_id AND etapa = 'CGOFI' AND origem = 'SISTEMA';
    UPDATE public.emenda_pedidos SET etapa = v_para, cgofi_em = NULL, cgofi_documento_sei = NULL WHERE id = p_id;
  ELSIF v_p.etapa = 'CONTRATACAO' THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Para tirar itens da CCGA, use "Desfazer envio" e escolha as atas.' USING ERRCODE = '22023';
  ELSIF v_p.etapa = 'EMPENHADO' THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: A nota de empenho vem da fonte e não volta. Para desfazer o empenho, registre a anulação.' USING ERRCODE = '22023';
  ELSE
    RAISE EXCEPTION 'ETAPA_INVALIDA: Não há etapa anterior para voltar.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.emenda_pedido_movimentos (pedido_id, acao, etapa_de, etapa_para, motivo, apagado, data, criado_por, criado_por_nome)
  VALUES (p_id, 'VOLTOU_ETAPA', v_p.etapa, v_para, left(v_motivo, 200), v_apag, v_hoje, auth.uid(), v_nome);
  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao, 'etapa', v_para);
END;
$$;
REVOKE ALL ON FUNCTION public.voltar_etapa_pedido(UUID, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.voltar_etapa_pedido(UUID, INTEGER, TEXT) TO authenticated;

-- 7) O que o gestor da ata vê no Início -------------------------------------------------------------------------
-- Gestor: só as atas dele. Coordenador: todas (a tela mostra as sem gestor ou as do gestor escolhido).
CREATE OR REPLACE FUNCTION public.emendas_a_contratar()
RETURNS TABLE (
  tipo            TEXT,
  pedido_id       UUID,
  numero_no_ano   SMALLINT,
  ano_do_numero   INTEGER,
  siop_emenda     TEXT,
  reservado_em    DATE,
  origem          TEXT,
  autor_nome      TEXT,
  autor_uf        TEXT,
  ata_key         TEXT,
  gestor_user_id  UUID,
  gestor_nome     TEXT,
  linha_id        UUID,
  item_key        TEXT,
  quantidade      INTEGER,
  nota            TEXT,
  documento_sei   TEXT,
  data            DATE,
  motivo          TEXT,
  por_nome        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_coord BOOLEAN := public.has_role('admin') IS TRUE;
BEGIN
  IF NOT v_coord AND public.has_role('gestor') IS NOT TRUE THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT 'A_CONTRATAR'::TEXT, p.id, p.numero_no_ano, p.ano_do_numero::INTEGER, p.siop_emenda::TEXT, p.reservado_em, p.origem::TEXT,
         a.nome::TEXT, a.uf::TEXT, public.emendas_ata_da_linha(l.item_key), am.gestor_user_id, am.gestor_nome::TEXT,
         l.id, l.item_key::TEXT, l.quantidade, n.nota::TEXT, l.despacho_documento_sei::TEXT, l.ccga_em, NULL::TEXT, l.ccga_por_nome::TEXT
    FROM public.emenda_pedido_linhas l
    JOIN public.emenda_pedidos p ON p.id = l.pedido_id
    LEFT JOIN public.emenda_autores a ON a.id = p.autor_id
    LEFT JOIN public.emenda_linha_notas n ON n.linha_id = l.id
    LEFT JOIN public.ata_managers am ON am.ata_key = public.ata_key_from_item_key(l.item_key)
   WHERE l.ccga_situacao = 'ENVIADA' AND NOT l.cancelada AND p.etapa = 'CONTRATACAO' AND n.contract_key IS NULL
     AND (v_coord OR am.gestor_user_id = auth.uid())
  UNION ALL
  SELECT 'DESFEITO'::TEXT, p.id, p.numero_no_ano, p.ano_do_numero::INTEGER, p.siop_emenda::TEXT, p.reservado_em, p.origem::TEXT,
         a.nome::TEXT, a.uf::TEXT, m.ata_key::TEXT, am.gestor_user_id, am.gestor_nome::TEXT,
         NULL::UUID, NULL::TEXT, cardinality(m.linha_ids), NULL::TEXT, m.documento_sei::TEXT, m.data, m.motivo::TEXT, m.criado_por_nome::TEXT
    FROM public.emenda_pedido_movimentos m
    JOIN public.emenda_pedidos p ON p.id = m.pedido_id
    LEFT JOIN public.emenda_autores a ON a.id = p.autor_id
    LEFT JOIN public.ata_managers am ON am.ata_key = public.chave_gestao_ata(m.ata_key)
   WHERE m.acao = 'DESFEITO_CCGA' AND m.data >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE - 7
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.apagado, '[]'::jsonb)) x WHERE x->>'situacao' = 'ENVIADA')
     AND (v_coord OR am.gestor_user_id = auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_a_contratar() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.emendas_a_contratar() TO authenticated;

-- 8) Gatilhos ---------------------------------------------------------------------------------------------------
-- Pedido: o envio antigo (avancar_pedido_emenda CONTRATACAO, pedido inteiro) marca os itens; sair para antes do
-- empenho (anulação, cancelamento) limpa a situação na CCGA. Voltar a EMPENHADO pelas RPCs acima não limpa: a
-- devolução fica com a CAEP até ela reenviar ou anular.
CREATE OR REPLACE FUNCTION public.trg_emendas_ccga_do_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.etapa = 'CONTRATACAO' AND OLD.etapa <> 'CONTRATACAO' AND NOT NEW.contratacao_pela_fonte
     AND COALESCE(current_setting('emendas.envio_ccga_por_ata', true), '') <> 'sim' THEN
    UPDATE public.emenda_pedido_linhas l
       SET ccga_situacao = 'ENVIADA', ccga_em = COALESCE(NEW.contratacao_em, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE),
           ccga_motivo = NULL, ccga_explicacao = NULL, ccga_por_nome = NEW.atualizado_por_nome
     WHERE l.pedido_id = NEW.id AND NOT l.cancelada AND l.ccga_situacao IS DISTINCT FROM 'ENVIADA';
  ELSIF NEW.etapa NOT IN ('EMPENHADO', 'CONTRATACAO') AND OLD.etapa IN ('EMPENHADO', 'CONTRATACAO') THEN
    UPDATE public.emenda_pedido_linhas
       SET ccga_situacao = NULL, ccga_em = NULL, ccga_motivo = NULL, ccga_explicacao = NULL, ccga_por_nome = NULL
     WHERE pedido_id = NEW.id AND ccga_situacao IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_ccga_do_pedido() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_emendas_ccga_do_pedido ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_ccga_do_pedido
  AFTER UPDATE OF etapa ON public.emenda_pedidos
  FOR EACH ROW WHEN (OLD.etapa IS DISTINCT FROM NEW.etapa)
  EXECUTE FUNCTION public.trg_emendas_ccga_do_pedido();

-- Item cancelado (anulação parcial, cancelamento) sai da CCGA.
CREATE OR REPLACE FUNCTION public.trg_emendas_ccga_da_linha()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.cancelada AND NEW.ccga_situacao IS NOT NULL THEN
    NEW.ccga_situacao := NULL;
    NEW.ccga_em := NULL;
    NEW.ccga_motivo := NULL;
    NEW.ccga_explicacao := NULL;
    NEW.ccga_por_nome := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_ccga_da_linha() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_emendas_ccga_da_linha ON public.emenda_pedido_linhas;
CREATE TRIGGER trg_emendas_ccga_da_linha
  BEFORE UPDATE OF cancelada ON public.emenda_pedido_linhas
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_ccga_da_linha();

-- 9) Carga: o que já está na CCGA -------------------------------------------------------------------------------
UPDATE public.emenda_pedido_linhas l
   SET ccga_situacao = 'ENVIADA', ccga_em = p.contratacao_em
  FROM public.emenda_pedidos p
 WHERE p.id = l.pedido_id AND p.etapa = 'CONTRATACAO' AND NOT p.contratacao_pela_fonte
   AND NOT l.cancelada AND l.ccga_situacao IS NULL;
