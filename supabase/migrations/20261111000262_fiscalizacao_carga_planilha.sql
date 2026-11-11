-- ==============================================================================
-- MIGRATION 262: FISCALIZAÇÃO — ENTREGA 3 (BASE PARA A CARGA DA PLANILHA DA SFC/CGLIC)
-- Versão: 20261111000262_fiscalizacao_carga_planilha.sql
--
-- A planilha de controle da SFC/CGLIC (05/11/2026) tem 3.716 linhas em 420 contratos. 2.016 linhas (257 contratos,
-- quase todos de 2025) são de contratos sem pedido de emenda no sistema: entram como entregas da carga, com o item, o
-- destinatário, a cidade/UF, a emenda e o programa como texto da planilha (não há linha de pedido nem cadastro do
-- beneficiário para ligar). As demais vêm das linhas de pedido (migration 260) e a carga só traz etapa e datas.
--
-- 1) fisc_entregas: item_texto, beneficiario_texto, municipio_texto, uf_texto, emenda_texto, programa_texto e
--    carga_linha (linha da planilha, para conferir). Origem CARGA exige item e destinatário em texto.
-- 2) fisc_entrega_movimentos: tipo CARGA (etapa registrada pela carga, com a data da planilha e, quando achado no SEI,
--    o número do documento).
-- 3) mudar_etapa_entregas: Ofício à SAL vale para entrega de emenda da carga (emenda_texto), além das ligadas a pedido.
-- 4) fisc_entregas_lista devolve os textos da carga (o item, o beneficiário, a cidade/UF e a emenda caem para o texto
--    quando não há cadastro).
-- 5) Processo de fiscalização pelo NUP do SEI (08020.017653/2026-49): fisc_nup() e registrar_processo_fiscalizacao.
--
-- Os dados da carga não estão nesta migration (a planilha tem dados de pessoas): vão por um script aplicado à parte,
-- com autorização, depois desta migration.
-- ==============================================================================

ALTER TABLE public.fisc_entregas
  ADD COLUMN IF NOT EXISTS item_texto         TEXT,
  ADD COLUMN IF NOT EXISTS beneficiario_texto TEXT,
  ADD COLUMN IF NOT EXISTS municipio_texto    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS uf_texto           CHAR(2),
  ADD COLUMN IF NOT EXISTS emenda_texto       VARCHAR(40),
  ADD COLUMN IF NOT EXISTS programa_texto     VARCHAR(80),
  ADD COLUMN IF NOT EXISTS carga_linha        INTEGER;

ALTER TABLE public.fisc_entregas DROP CONSTRAINT IF EXISTS fisc_entregas_carga;
ALTER TABLE public.fisc_entregas ADD CONSTRAINT fisc_entregas_carga
  CHECK (origem <> 'CARGA' OR (item_texto IS NOT NULL AND beneficiario_texto IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_fisc_entregas_carga_linha ON public.fisc_entregas (carga_linha) WHERE origem = 'CARGA' AND dividida_de IS NULL;

ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT IF EXISTS fisc_entrega_movimentos_tipo;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo
  CHECK (tipo IN ('CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA'));

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
    IF p_etapa = 'SAL' AND e.emenda_linha_id IS NULL AND e.emenda_texto IS NULL THEN
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


-- 5) Leitura -------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fisc_entregas_lista(TEXT);
CREATE FUNCTION public.fisc_entregas_lista(p_contrato TEXT DEFAULT NULL)
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
  item_texto        TEXT,
  beneficiario_id   UUID,
  beneficiario_nome TEXT,
  beneficiario_sigla TEXT,
  beneficiario_razao TEXT,
  beneficiario_texto TEXT,
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
  programa_texto    TEXT,
  carga_linha       INTEGER,
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
         e.item_key::TEXT, i.nome_curto::TEXT, i.descricao_item::TEXT, e.item_texto,
         e.beneficiario_id, COALESCE(b.nome, b.nome_curto)::TEXT, b.sigla::TEXT, b.razao_social::TEXT, e.beneficiario_texto, COALESCE(b.entrega_municipio, e.municipio_texto)::TEXT, COALESCE(b.entrega_uf, e.uf_texto)::TEXT,
         e.quantidade, e.origem::TEXT, COALESCE(p.siop_emenda::TEXT, e.emenda_texto), p.id,
         e.responsavel::TEXT, e.etapa::TEXT, e.etapa_em, e.prevista, e.entregue_em, e.dividida_de, e.programa_texto::TEXT, e.carga_linha,
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


-- 5) Processo de fiscalização pelo número do processo (NUP), como o SEI mostra: 08020.017653/2026-49 ---------------
-- A migration 259 aceitava só 7 a 10 dígitos (número de documento). O processo de acompanhamento contratual tem 17.
CREATE OR REPLACE FUNCTION public.fisc_nup(p_texto TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE d TEXT := regexp_replace(COALESCE(p_texto, ''), '\D', '', 'g');
BEGIN
  IF d = '' THEN RETURN NULL; END IF;
  IF length(d) <> 17 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Processo: 17 dígitos (ex.: 08020.017653/2026-49).' USING ERRCODE = '22023';
  END IF;
  RETURN substr(d, 1, 5) || '.' || substr(d, 6, 6) || '/' || substr(d, 12, 4) || '-' || substr(d, 16, 2);
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_nup(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_nup(TEXT) TO service_role;

ALTER TABLE public.fisc_contratos DROP CONSTRAINT IF EXISTS fisc_contratos_sei;
ALTER TABLE public.fisc_contratos ALTER COLUMN processo_sei TYPE VARCHAR(20);
ALTER TABLE public.fisc_contratos ADD CONSTRAINT fisc_contratos_sei CHECK (
  (portaria_sei IS NULL OR portaria_sei ~ '^[0-9]{7,10}$') AND (processo_sei IS NULL OR processo_sei ~ '^[0-9]{5}\.[0-9]{6}/[0-9]{4}-[0-9]{2}$')
);

CREATE OR REPLACE FUNCTION public.registrar_processo_fiscalizacao(p_contract_key TEXT, p_processo_sei TEXT, p_autuado_em DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_f    public.fisc_contratos%ROWTYPE;
  v_sei  TEXT := public.fisc_nup(p_processo_sei);
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_f FROM public.fisc_contratos WHERE contract_key = p_contract_key FOR UPDATE;
  IF NOT FOUND OR v_f.fiscalizacao = 'AREA' THEN
    RAISE EXCEPTION 'NOT_FOUND: Este contrato não está com a SFC/CGLIC.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND auth.uid() IS DISTINCT FROM v_f.fiscal_user_id AND auth.uid() IS DISTINCT FROM v_f.substituto_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal, o substituto ou o coordenador registram o processo deste contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do processo (ex.: 08020.017653/2026-49).' USING ERRCODE = '22023';
  END IF;
  IF p_autuado_em IS NULL OR p_autuado_em > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data da autuação (até hoje).' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fisc_contratos
     SET processo_sei = v_sei, autuado_em = p_autuado_em, atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE contract_key = p_contract_key;
  RETURN jsonb_build_object('contract_key', p_contract_key, 'processo_sei', v_sei, 'autuado_em', p_autuado_em);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_processo_fiscalizacao(TEXT, TEXT, DATE) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_processo_fiscalizacao(TEXT, TEXT, DATE) TO authenticated;
