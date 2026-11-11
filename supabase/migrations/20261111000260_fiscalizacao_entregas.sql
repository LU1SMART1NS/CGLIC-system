-- ==============================================================================
-- MIGRATION 260: FISCALIZAÇÃO — ENTREGA 2 (ENTREGAS E ETAPAS)
-- Versão: 20261111000260_fiscalizacao_entregas.sql
--
-- Protótipo aprovado em 10/11/2026 (docs/estudos/modulo-fiscalizacao.md). A SFC/CGLIC acompanha cada entrega:
-- item do contrato × beneficiário × quantidade, a mesma unidade da linha do pedido de emenda.
--
-- 1) fisc_entregas: uma por linha de pedido de emenda ligada a um contrato com a SFC/CGLIC (mista ou toda). Etapa,
--    data prevista, data de entrega, quem fiscaliza (SFC/CGLIC ou área requisitante) e a entrega de onde saiu
--    (entrega parcial: a linha vira várias entregas, a soma não muda).
-- 2) fisc_entrega_movimentos: o histórico de cada entrega (etapa, data, SEI, quem, quando).
-- 3) fisc_criar_entregas_do_contrato(): cria as entregas que faltam e avança as que estão antes da Ordem quando a
--    CAEP registra a Informação ou a Ordem (emenda_pedido_ordens). Roda ao decidir a fiscalização (gatilho em
--    fisc_contratos) e de hora em hora (cron :04), para pegar linhas novas e Ordens registradas no módulo de Emendas.
-- 4) RPCs: mudar_etapa_entregas (lote), dividir_entrega, definir_prevista_entregas (fiscal, substituto ou
--    coordenador) e definir_responsavel_entregas (só coordenador, em contrato de fiscalização mista).
--    A Ordem de Fornecimento registrada pela SFC/CGLIC numa entrega de emenda grava também em emenda_pedido_ordens,
--    para o Pedido 360 ver a mesma Ordem.
-- 5) fisc_entregas_lista(contrato): as entregas com item, beneficiário, emenda, contrato e as datas de faturado e
--    pago das notas (o fiscal não lê as tabelas de emendas; a leitura é por esta função).
--
-- Regras do fluxo da SFC/CGLIC: "Enviado para pagamento e doação" só depois de entregue; Ofício à SAL e Finalizado
-- só depois de pago; Ofício à SAL só em entrega de emenda. Entrega da área requisitante não tem etapa na SFC/CGLIC.
-- ==============================================================================

-- 1) Entregas ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fisc_entregas (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_key       VARCHAR(100)  NOT NULL REFERENCES public.fisc_contratos(contract_key),
  emenda_linha_id    UUID          REFERENCES public.emenda_pedido_linhas(id),
  item_key           VARCHAR(100),
  beneficiario_id    UUID          REFERENCES public.emenda_beneficiarios(id),
  quantidade         INTEGER       NOT NULL CHECK (quantidade > 0),
  origem             VARCHAR(8)    NOT NULL DEFAULT 'EMENDA',
  responsavel        VARCHAR(4)    NOT NULL DEFAULT 'SFC',
  etapa              VARCHAR(15)   NOT NULL DEFAULT 'INFO_PEDIDA',
  etapa_em           DATE,
  prevista           DATE,
  entregue_em        DATE,
  dividida_de        UUID          REFERENCES public.fisc_entregas(id),
  criado_em          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_por_nome VARCHAR(200),
  atualizado_em      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT fisc_entregas_origem CHECK (origem IN ('EMENDA', 'CARGA', 'MANUAL')),
  CONSTRAINT fisc_entregas_emenda CHECK (origem <> 'EMENDA' OR emenda_linha_id IS NOT NULL),
  CONSTRAINT fisc_entregas_responsavel CHECK (responsavel IN ('SFC', 'AREA')),
  CONSTRAINT fisc_entregas_etapa CHECK (etapa IN (
    'INFO_PEDIDA', 'INFO_ENVIADA', 'ORDEM',
    'PRODUCAO', 'CONTROLADO', 'TRANSITO', 'RETIRADA',
    'ENTREGUE', 'TRP', 'TRD',
    'PAGAMENTO', 'SAL', 'FINALIZADO'
  ))
);
CREATE INDEX IF NOT EXISTS ix_fisc_entregas_contrato ON public.fisc_entregas (contract_key);
CREATE INDEX IF NOT EXISTS ix_fisc_entregas_linha ON public.fisc_entregas (emenda_linha_id);
COMMENT ON TABLE public.fisc_entregas IS
  'Entrega acompanhada pela fiscalização: item do contrato × beneficiário × quantidade, com etapa, prazo e quem fiscaliza (migration 260). Grava só pelas RPCs.';

CREATE TABLE IF NOT EXISTS public.fisc_entrega_movimentos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id      UUID         NOT NULL REFERENCES public.fisc_entregas(id) ON DELETE CASCADE,
  tipo            VARCHAR(12)  NOT NULL,
  etapa           VARCHAR(15),
  data            DATE,
  documento_sei   VARCHAR(10),
  observacao      TEXT,
  criado_por      UUID,
  criado_por_nome VARCHAR(200),
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fisc_entrega_movimentos_tipo CHECK (tipo IN ('CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA')),
  CONSTRAINT fisc_entrega_movimentos_sei CHECK (documento_sei IS NULL OR documento_sei ~ '^[0-9]{7,10}$')
);
CREATE INDEX IF NOT EXISTS ix_fisc_entrega_movimentos_entrega ON public.fisc_entrega_movimentos (entrega_id, criado_em);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fisc_entregas', 'fisc_entrega_movimentos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leitura da fiscalizacao: ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_permission(''fiscalizacao.view'')))', 'Leitura da fiscalizacao: ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Somente usuario ativo" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Somente usuario ativo" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || t, t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()', 'trg_audit_' || t, t);
    END IF;
  END LOOP;
END $$;

-- Ordem das etapas (para "só avança", "depois de entregue" etc.).
CREATE OR REPLACE FUNCTION public.fisc_ordem_da_etapa(p_etapa TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT array_position(ARRAY['INFO_PEDIDA', 'INFO_ENVIADA', 'ORDEM', 'PRODUCAO', 'CONTROLADO', 'TRANSITO', 'RETIRADA',
                              'ENTREGUE', 'TRP', 'TRD', 'PAGAMENTO', 'SAL', 'FINALIZADO'], p_etapa);
$$;
GRANT EXECUTE ON FUNCTION public.fisc_ordem_da_etapa(TEXT) TO authenticated, service_role;

-- 3) Criar as entregas que faltam e avançar pela Informação/Ordem da CAEP ---------------------------
CREATE OR REPLACE FUNCTION public.fisc_criar_entregas_do_contrato(p_contrato TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_f        public.fisc_contratos%ROWTYPE;
  v_criadas  INTEGER := 0;
  v_avancou  INTEGER := 0;
  r          RECORD;
  v_id       UUID;
BEGIN
  SELECT * INTO v_f FROM public.fisc_contratos WHERE contract_key = p_contrato;
  IF NOT FOUND OR v_f.fiscalizacao = 'AREA' THEN
    RETURN jsonb_build_object('criadas', 0, 'avancadas', 0);
  END IF;

  FOR r IN
    SELECT l.id AS linha_id, l.item_key, l.beneficiario_id, l.quantidade, n.entrega_prevista,
           o.informacao_em, o.informacao_documento_sei, o.ordem_em, o.ordem_documento_sei
      FROM public.emenda_linha_notas n
      JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id AND NOT l.cancelada
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
      LEFT JOIN public.emenda_pedido_ordens o ON o.pedido_id = p.id AND o.contract_key = n.contract_key
     WHERE n.contract_key = p_contrato
       AND NOT EXISTS (SELECT 1 FROM public.fisc_entregas e WHERE e.emenda_linha_id = l.id)
  LOOP
    INSERT INTO public.fisc_entregas (contract_key, emenda_linha_id, item_key, beneficiario_id, quantidade, origem, responsavel, etapa, etapa_em, prevista, atualizado_por_nome)
    VALUES (p_contrato, r.linha_id, r.item_key, r.beneficiario_id, r.quantidade, 'EMENDA',
            'SFC',
            CASE WHEN r.ordem_em IS NOT NULL THEN 'ORDEM' WHEN r.informacao_em IS NOT NULL THEN 'INFO_ENVIADA' ELSE 'INFO_PEDIDA' END,
            COALESCE(r.ordem_em, r.informacao_em), r.entrega_prevista, 'Sistema')
    RETURNING id INTO v_id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, etapa, data, documento_sei, observacao, criado_por_nome)
    VALUES (v_id, 'CRIADA',
            CASE WHEN r.ordem_em IS NOT NULL THEN 'ORDEM' WHEN r.informacao_em IS NOT NULL THEN 'INFO_ENVIADA' ELSE 'INFO_PEDIDA' END,
            COALESCE(r.ordem_em, r.informacao_em), COALESCE(r.ordem_documento_sei, r.informacao_documento_sei),
            'Entrega criada pela linha do pedido de emenda', 'Sistema');
    v_criadas := v_criadas + 1;
  END LOOP;

  -- Informação ou Ordem registrada depois (no módulo de Emendas): a entrega que ainda está antes dela avança.
  FOR r IN
    SELECT e.id, CASE WHEN o.ordem_em IS NOT NULL THEN 'ORDEM' ELSE 'INFO_ENVIADA' END AS etapa,
           COALESCE(o.ordem_em, o.informacao_em) AS data, COALESCE(o.ordem_documento_sei, o.informacao_documento_sei) AS sei
      FROM public.fisc_entregas e
      JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
      JOIN public.emenda_pedido_ordens o ON o.pedido_id = l.pedido_id AND o.contract_key = e.contract_key
     WHERE e.contract_key = p_contrato
       AND e.responsavel = 'SFC'
       AND public.fisc_ordem_da_etapa(e.etapa) < public.fisc_ordem_da_etapa(CASE WHEN o.ordem_em IS NOT NULL THEN 'ORDEM' ELSE 'INFO_ENVIADA' END)
  LOOP
    UPDATE public.fisc_entregas SET etapa = r.etapa, etapa_em = r.data, atualizado_por_nome = 'Sistema', atualizado_em = NOW() WHERE id = r.id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, etapa, data, documento_sei, observacao, criado_por_nome)
    VALUES (r.id, 'AUTOMATICA', r.etapa, r.data, r.sei, 'Registrado no pedido de emenda', 'Sistema');
    v_avancou := v_avancou + 1;
  END LOOP;

  RETURN jsonb_build_object('criadas', v_criadas, 'avancadas', v_avancou);
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_criar_entregas_do_contrato(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_criar_entregas_do_contrato(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.fisc_criar_entregas_pendentes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c TEXT;
  v_r JSONB;
  v_criadas INTEGER := 0;
  v_avancadas INTEGER := 0;
BEGIN
  FOR v_c IN SELECT contract_key FROM public.fisc_contratos WHERE fiscalizacao IN ('SFC', 'MISTA') LOOP
    v_r := public.fisc_criar_entregas_do_contrato(v_c);
    v_criadas := v_criadas + (v_r->>'criadas')::INTEGER;
    v_avancadas := v_avancadas + (v_r->>'avancadas')::INTEGER;
  END LOOP;
  RETURN jsonb_build_object('criadas', v_criadas, 'avancadas', v_avancadas);
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_criar_entregas_pendentes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_criar_entregas_pendentes() TO service_role;

-- Ao decidir a fiscalização: cria as entregas e alinha quem fiscaliza (toda SFC/CGLIC ou toda área requisitante).
CREATE OR REPLACE FUNCTION public.trg_fisc_contrato_entregas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_resp TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.fiscalizacao IS NOT DISTINCT FROM OLD.fiscalizacao THEN
    RETURN NEW;
  END IF;
  IF NEW.fiscalizacao IN ('SFC', 'AREA') THEN
    v_resp := NEW.fiscalizacao;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por_nome)
    SELECT e.id, 'RESPONSAVEL', CASE WHEN v_resp = 'SFC' THEN 'Contrato todo com a SFC/CGLIC' ELSE 'Contrato todo com a área requisitante' END, NEW.atualizado_por_nome
      FROM public.fisc_entregas e WHERE e.contract_key = NEW.contract_key AND e.responsavel <> v_resp;
    UPDATE public.fisc_entregas SET responsavel = v_resp, atualizado_por_nome = NEW.atualizado_por_nome, atualizado_em = NOW()
     WHERE contract_key = NEW.contract_key AND responsavel <> v_resp;
  END IF;
  PERFORM public.fisc_criar_entregas_do_contrato(NEW.contract_key);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_fisc_contrato_entregas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_fisc_contrato_entregas ON public.fisc_contratos;
CREATE TRIGGER trg_fisc_contrato_entregas AFTER INSERT OR UPDATE OF fiscalizacao ON public.fisc_contratos
  FOR EACH ROW EXECUTE FUNCTION public.trg_fisc_contrato_entregas();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiscalizacao-criar-entregas') THEN
      PERFORM cron.unschedule('fiscalizacao-criar-entregas');
    END IF;
    PERFORM cron.schedule('fiscalizacao-criar-entregas', '4 * * * *', 'SELECT public.fisc_criar_entregas_pendentes()');
  END IF;
END $$;

-- 4) RPCs ---------------------------------------------------------------------------------------
-- Confere que quem chama pode agir nas entregas: coordenador, ou fiscal/substituto de todos os contratos delas.
CREATE OR REPLACE FUNCTION public.fisc_conferir_entregas(p_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n INTEGER;
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha ao menos uma entrega.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_n FROM public.fisc_entregas WHERE id = ANY (p_ids);
  IF v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_ids))) THEN
    RAISE EXCEPTION 'NOT_FOUND: Entrega não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND EXISTS (
    SELECT 1 FROM public.fisc_entregas e JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
     WHERE e.id = ANY (p_ids) AND auth.uid() IS DISTINCT FROM f.fiscal_user_id AND auth.uid() IS DISTINCT FROM f.substituto_user_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal, o substituto ou o coordenador registram as entregas deste contrato.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) FOR UPDATE;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_conferir_entregas(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_conferir_entregas(UUID[]) TO service_role;

-- 4a) Mudar a etapa de uma ou várias entregas.
CREATE OR REPLACE FUNCTION public.mudar_etapa_entregas(p_ids UUID[], p_etapa TEXT, p_data DATE, p_documento_sei TEXT, p_observacao TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sei   TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI');
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_obs   TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_hoje  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  e       RECORD;
  v_n     INTEGER := 0;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF public.fisc_ordem_da_etapa(p_etapa) IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Etapa desconhecida.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR p_data > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data (até hoje).' USING ERRCODE = '22023';
  END IF;
  IF p_etapa IN ('INFO_ENVIADA', 'ORDEM', 'TRP', 'TRD', 'PAGAMENTO', 'SAL') AND v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Esta etapa tem documento: informe o número SEI.' USING ERRCODE = '22023';
  END IF;

  FOR e IN
    SELECT x.*, n.pago_em, l.pedido_id
      FROM public.fisc_entregas x
      LEFT JOIN public.emenda_linha_notas n ON n.linha_id = x.emenda_linha_id
      LEFT JOIN public.emenda_pedido_linhas l ON l.id = x.emenda_linha_id
     WHERE x.id = ANY (p_ids)
  LOOP
    IF e.responsavel = 'AREA' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Entrega da área requisitante não tem etapa na SFC/CGLIC.' USING ERRCODE = '22023';
    END IF;
    IF p_etapa IN ('PAGAMENTO', 'SAL', 'FINALIZADO') AND e.entregue_em IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Registre a entrega antes do envio para pagamento e doação.' USING ERRCODE = '22023';
    END IF;
    IF p_etapa IN ('SAL', 'FINALIZADO') AND e.origem = 'EMENDA' AND e.pago_em IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O Ofício à SAL e o fim da fiscalização vêm depois do pagamento (a nota ainda não foi paga).' USING ERRCODE = '22023';
    END IF;
    IF p_etapa = 'SAL' AND e.origem <> 'EMENDA' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Ofício à SAL só em entrega de emenda.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.fisc_entregas
       SET etapa = p_etapa, etapa_em = p_data,
           entregue_em = CASE WHEN p_etapa = 'ENTREGUE' THEN p_data
                              WHEN public.fisc_ordem_da_etapa(p_etapa) < public.fisc_ordem_da_etapa('ENTREGUE') THEN NULL
                              ELSE entregue_em END,
           atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = e.id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, etapa, data, documento_sei, observacao, criado_por, criado_por_nome)
    VALUES (e.id, 'ETAPA', p_etapa, p_data, v_sei, v_obs, auth.uid(), v_nome);

    -- A Ordem da SFC/CGLIC numa entrega de emenda é a mesma Ordem do pedido (Pedido 360 › Andamento).
    IF p_etapa = 'ORDEM' AND e.pedido_id IS NOT NULL THEN
      INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, ordem_em, ordem_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
      VALUES (e.pedido_id, e.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
      ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
        SET ordem_em = EXCLUDED.ordem_em, ordem_documento_sei = EXCLUDED.ordem_documento_sei,
            atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('entregas', v_n, 'etapa', p_etapa);
END;
$$;
REVOKE ALL ON FUNCTION public.mudar_etapa_entregas(UUID[], TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mudar_etapa_entregas(UUID[], TEXT, DATE, TEXT, TEXT) TO authenticated;

-- 4b) Entrega parcial: tira uma parte da entrega (a soma não muda). A parte nova começa na mesma etapa.
CREATE OR REPLACE FUNCTION public.dividir_entrega(p_id UUID, p_quantidade INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_e    public.fisc_entregas%ROWTYPE;
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_novo UUID;
BEGIN
  PERFORM public.fisc_conferir_entregas(ARRAY[p_id]);
  SELECT * INTO v_e FROM public.fisc_entregas WHERE id = p_id;
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade >= v_e.quantidade THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A parte deve ser de 1 a % unidades.', v_e.quantidade - 1 USING ERRCODE = '22023';
  END IF;
  UPDATE public.fisc_entregas SET quantidade = quantidade - p_quantidade, atualizado_por_nome = v_nome, atualizado_em = NOW() WHERE id = p_id;
  INSERT INTO public.fisc_entregas (contract_key, emenda_linha_id, item_key, beneficiario_id, quantidade, origem, responsavel, etapa, etapa_em, prevista, entregue_em, dividida_de, atualizado_por_nome)
  VALUES (v_e.contract_key, v_e.emenda_linha_id, v_e.item_key, v_e.beneficiario_id, p_quantidade, v_e.origem, v_e.responsavel, v_e.etapa, v_e.etapa_em, v_e.prevista, v_e.entregue_em, p_id, v_nome)
  RETURNING id INTO v_novo;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome) VALUES
    (p_id, 'DIVISAO', format('%s de %s unidades passaram para outra entrega', p_quantidade, v_e.quantidade), auth.uid(), v_nome),
    (v_novo, 'DIVISAO', format('Parte de %s unidades da entrega de %s', p_quantidade, v_e.quantidade), auth.uid(), v_nome);
  RETURN jsonb_build_object('nova', v_novo, 'restante', v_e.quantidade - p_quantidade);
END;
$$;
REVOKE ALL ON FUNCTION public.dividir_entrega(UUID, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dividir_entrega(UUID, INTEGER) TO authenticated;

-- 4c) Data prevista da entrega (NULL apaga).
CREATE OR REPLACE FUNCTION public.definir_prevista_entregas(p_ids UUID[], p_prevista DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_nome TEXT := left(public.nome_do_usuario_logado(), 200); v_n INTEGER;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  UPDATE public.fisc_entregas SET prevista = p_prevista, atualizado_por_nome = v_nome, atualizado_em = NOW() WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, criado_por, criado_por_nome)
  SELECT id, 'PREVISTA', p_prevista, auth.uid(), v_nome FROM public.fisc_entregas WHERE id = ANY (p_ids);
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_prevista_entregas(UUID[], DATE) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_prevista_entregas(UUID[], DATE) TO authenticated;

-- 4d) Fiscalização mista: o coordenador diz quais entregas ficam com a área requisitante (e o motivo).
CREATE OR REPLACE FUNCTION public.definir_responsavel_entregas(p_ids UUID[], p_responsavel TEXT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome   TEXT := left(public.nome_do_usuario_logado(), 200);
  v_motivo TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_n      INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador decide quem fiscaliza as entregas.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF p_responsavel IS NULL OR p_responsavel NOT IN ('SFC', 'AREA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Quem fiscaliza deve ser SFC ou AREA.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas e JOIN public.fisc_contratos f ON f.contract_key = e.contract_key WHERE e.id = ANY (p_ids) AND f.fiscalizacao <> 'MISTA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Só em contrato de fiscalização mista. Mude o contrato para Mista na Distribuição.' USING ERRCODE = '22023';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo (ao menos 10 letras).' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome)
  SELECT id, 'RESPONSAVEL', CASE WHEN p_responsavel = 'SFC' THEN 'Passou à SFC/CGLIC: ' ELSE 'Passou à área requisitante: ' END || v_motivo, auth.uid(), v_nome
    FROM public.fisc_entregas WHERE id = ANY (p_ids) AND responsavel <> p_responsavel;
  UPDATE public.fisc_entregas SET responsavel = p_responsavel, atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = ANY (p_ids) AND responsavel <> p_responsavel;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_responsavel_entregas(UUID[], TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_responsavel_entregas(UUID[], TEXT, TEXT) TO authenticated;

-- 5) Leitura -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_entregas_lista(p_contrato TEXT DEFAULT NULL)
RETURNS TABLE (
  id                UUID,
  contract_key      TEXT,
  contrato_numero   TEXT,
  fornecedor        TEXT,
  fiscal_user_id    UUID,
  fiscal_nome       TEXT,
  substituto_user_id UUID,
  fiscalizacao      TEXT,
  item_key          TEXT,
  item_nome         TEXT,
  item_descricao    TEXT,
  beneficiario_id   UUID,
  beneficiario_nome TEXT,
  beneficiario_sigla TEXT,
  beneficiario_razao TEXT,
  municipio         TEXT,
  uf                TEXT,
  quantidade        INTEGER,
  origem            TEXT,
  emenda            TEXT,
  pedido_id         UUID,
  responsavel       TEXT,
  etapa             TEXT,
  etapa_em          DATE,
  prevista          DATE,
  entregue_em       DATE,
  dividida_de       UUID,
  faturado_em       DATE,
  pago_em           DATE,
  atualizado_por_nome TEXT,
  atualizado_em     TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.contract_key::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero, e.contract_key)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         f.fiscal_user_id, f.fiscal_nome::TEXT, f.substituto_user_id, f.fiscalizacao::TEXT,
         e.item_key::TEXT, i.nome_curto::TEXT, i.descricao_item::TEXT,
         e.beneficiario_id, COALESCE(b.nome, b.nome_curto)::TEXT, b.sigla::TEXT, b.razao_social::TEXT, b.entrega_municipio::TEXT, b.entrega_uf::TEXT,
         e.quantidade, e.origem::TEXT, p.siop_emenda::TEXT, p.id,
         e.responsavel::TEXT, e.etapa::TEXT, e.etapa_em, e.prevista, e.entregue_em, e.dividida_de,
         n.faturado_em::DATE, n.pago_em::DATE, e.atualizado_por_nome::TEXT, e.atualizado_em
    FROM public.fisc_entregas e
    JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
    LEFT JOIN LATERAL (SELECT co.* FROM public.contratos_oficiais co WHERE co.contract_key = e.contract_key ORDER BY co.sincronizado_em DESC LIMIT 1) c ON TRUE
    LEFT JOIN public.v_emendas_itens_caep i ON i.item_key = e.item_key
    LEFT JOIN public.emenda_beneficiarios b ON b.id = e.beneficiario_id
    LEFT JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
    LEFT JOIN public.emenda_pedidos p ON p.id = l.pedido_id
    LEFT JOIN public.emenda_linha_notas n ON n.linha_id = e.emenda_linha_id
   WHERE p_contrato IS NULL OR e.contract_key = p_contrato;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_entregas_lista(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_lista(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fisc_movimentos_da_entrega(p_entrega UUID)
RETURNS TABLE (id UUID, tipo TEXT, etapa TEXT, data DATE, documento_sei TEXT, observacao TEXT, criado_por_nome TEXT, criado_em TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.tipo::TEXT, m.etapa::TEXT, m.data, m.documento_sei::TEXT, m.observacao, m.criado_por_nome::TEXT, m.criado_em
    FROM public.fisc_entrega_movimentos m
   WHERE public.has_permission('fiscalizacao.view') IS TRUE
     AND (m.entrega_id = p_entrega OR m.entrega_id = (SELECT dividida_de FROM public.fisc_entregas WHERE id = p_entrega))
   ORDER BY m.criado_em DESC;
$$;
REVOKE ALL ON FUNCTION public.fisc_movimentos_da_entrega(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_movimentos_da_entrega(UUID) TO authenticated;

-- Contratos que já estão com a SFC/CGLIC (decididos antes desta migration): cria as entregas agora.
SELECT public.fisc_criar_entregas_pendentes();
