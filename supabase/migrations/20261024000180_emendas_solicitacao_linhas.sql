-- ==============================================================================
-- MIGRATION 180: EMENDAS PARLAMENTARES — A SOLICITAÇÃO DE EMPENHO LIGADA ÀS LINHAS QUE ELA COBRE
-- Versão: 20261024000180_emendas_solicitacao_linhas.sql
--
-- Decisão de 24/10/2026 (protótipo "Aba Emendas no Item 360", decisões 7 e 9): a autorização de empenho (a
-- solicitação que a Diretora do FNSP assina) cobre um ou mais itens de UMA ata, não necessariamente todos os itens
-- daquela ata que estão no pedido; o resto fica para outra solicitação, de outra rodada. Por isso os itens do mesmo
-- pedido andam em ritmos diferentes, e a situação passa a ser de cada linha do pedido: a linha sabe qual solicitação
-- a cobre; a nota (emenda_linha_notas), o despacho à CCGA (despacho_documento_sei) e o contrato já eram por linha.
-- A migration 177 tinha isso como coluna na linha; a 178 tirou ao passar a solicitação para a ata. Volta como relação,
-- para aceitar kits (um kit pode ter itens de mais de uma ata) e rodadas (a ata pode ter mais de uma solicitação).
--
-- 1) emenda_solicitacao_linhas: solicitação (documento SEI da etapa AUTORIZACAO) × linha do pedido × quantidade.
--    Uma linha é coberta por uma solicitação só (a mais nova ganha). Grava só o servidor (RPC abaixo e cargas).
-- 2) emendas_linhas_da_ata(pedido, ata): as linhas ativas do pedido com item daquela ata (itens e itens dos kits).
-- 3) emendas_ligar_linhas_da_solicitacao(documento, linhas): troca as linhas da solicitação; só linhas do pedido e da
--    ata da solicitação, quantidade até a da linha (sem quantidade, a da linha inteira).
-- 4) informar_solicitacao_da_ata ganha p_linhas: o gestor marca as linhas que o documento cobre. Sem p_linhas, a
--    solicitação que é a única da ata cobre todas as linhas da ata (o caso comum); a segunda da mesma ata só cobre o
--    que o gestor marcar. Na troca, as linhas passam da solicitação antiga para a nova.
-- 5) Gatilho na tabela de documentos: solicitação que ganha a ata (pela tela, pela carga ou pelo gatilho da 178) e é
--    a única da ata cobre todas as linhas da ata; solicitação que perde a ata perde as linhas.
-- 6) Carga inicial: nas atas com uma solicitação só, todas as linhas da ata ligam a ela (as 128 solicitações medidas
--    na 178 cobrem uma ata só); nas atas com mais de uma solicitação (19 em 24/10/2026), a leitura do SEI ou o gestor
--    decidem. Nada é inventado.
-- 7) O gestor de saldo passa a ler as emendas (emendas.view): a aba Emendas do Item 360 mostra quanto do que ele
--    alocou à CAEP já está reservado a parlamentares.
--
-- Na tela só entra o que o gestor informa (número SEI, data, ata, linhas cobertas) e o que o sistema acha no
-- Contratos.gov.br; o que só a leitura do SEI trouxe (hora, assinante, número da nota) fica guardado e não aparece.
-- ==============================================================================

-- 7) Gestor de saldo lê as emendas -----------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_key) VALUES ('gestor_saldos', 'emendas.view')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 1) Tabela ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_solicitacao_linhas (
  documento_id UUID          NOT NULL REFERENCES public.emenda_pedido_documentos_sei(id) ON DELETE CASCADE,
  linha_id     UUID          NOT NULL REFERENCES public.emenda_pedido_linhas(id) ON DELETE CASCADE,
  quantidade   NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
  criado_em    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  criado_por   UUID,
  PRIMARY KEY (documento_id, linha_id),
  CONSTRAINT emenda_solicitacao_linhas_uma_por_linha UNIQUE (linha_id)
);
COMMENT ON TABLE public.emenda_solicitacao_linhas IS
  'Linhas do pedido que cada solicitação de autorização de empenho (documento SEI da etapa AUTORIZACAO) cobre, com a quantidade. Uma linha é coberta por uma solicitação só. Grava só o servidor (informar_solicitacao_da_ata, gatilho e cargas).';
COMMENT ON COLUMN public.emenda_solicitacao_linhas.quantidade IS 'Quantidade da linha que a solicitação cobre (normalmente a linha inteira).';
CREATE INDEX IF NOT EXISTS ix_emenda_solicitacao_linhas_linha ON public.emenda_solicitacao_linhas (linha_id);

ALTER TABLE public.emenda_solicitacao_linhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_solicitacao_linhas" ON public.emenda_solicitacao_linhas;
CREATE POLICY "Leitura das emendas: emenda_solicitacao_linhas" ON public.emenda_solicitacao_linhas FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_solicitacao_linhas;
CREATE POLICY "Somente usuario ativo" ON public.emenda_solicitacao_linhas AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_solicitacao_linhas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_solicitacao_linhas TO authenticated;
GRANT ALL ON public.emenda_solicitacao_linhas TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_solicitacao_linhas ON public.emenda_solicitacao_linhas;
    CREATE TRIGGER trg_audit_emenda_solicitacao_linhas AFTER INSERT OR UPDATE OR DELETE ON public.emenda_solicitacao_linhas
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- 2) Linhas ativas do pedido com item da ata (itens e itens dos kits) ---------------------
CREATE OR REPLACE FUNCTION public.emendas_linhas_da_ata(p_pedido UUID, p_ata TEXT)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.id
    FROM public.emenda_pedido_linhas l
   WHERE l.pedido_id = p_pedido AND NOT l.cancelada
     AND (
       (l.tipo = 'ITEM' AND l.item_key IS NOT NULL AND split_part(l.item_key, '-', 1) || '-' || split_part(l.item_key, '-', 2) = p_ata)
       OR (l.tipo = 'KIT' AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(l.kit_composicao, '[]'::jsonb)) c
              WHERE split_part(c ->> 'item_key', '-', 1) || '-' || split_part(c ->> 'item_key', '-', 2) = p_ata))
     )
   ORDER BY l.ordem;
$$;
REVOKE ALL ON FUNCTION public.emendas_linhas_da_ata(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 3) Trocar as linhas de uma solicitação --------------------------------------------------
-- p_linhas: lista de {"linha_id": uuid, "quantidade": n} (quantidade opcional: a da linha). Só linhas do pedido, não
-- canceladas e com item da ata da solicitação. A linha que estava em outra solicitação passa para esta.
CREATE OR REPLACE FUNCTION public.emendas_ligar_linhas_da_solicitacao(p_documento UUID, p_linhas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc    RECORD;
  v_item   JSONB;
  v_linha  RECORD;
  v_id     UUID;
  v_qtd    NUMERIC;
  v_n      INTEGER := 0;
BEGIN
  SELECT id, pedido_id, etapa, ata_key, documento_sei INTO v_doc FROM public.emenda_pedido_documentos_sei WHERE id = p_documento;
  IF NOT FOUND OR v_doc.etapa <> 'AUTORIZACAO' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O documento não é uma solicitação de empenho.' USING ERRCODE = '22023';
  END IF;
  IF v_doc.ata_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A solicitação % ainda não tem ata.', v_doc.documento_sei USING ERRCODE = '22023';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a lista de linhas.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.emenda_solicitacao_linhas WHERE documento_id = p_documento;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_linhas) LOOP
    BEGIN
      v_id := (v_item ->> 'linha_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Linha inválida.' USING ERRCODE = '22023';
    END;
    SELECT l.id, l.quantidade INTO v_linha FROM public.emenda_pedido_linhas l
     WHERE l.id = v_id AND l.pedido_id = v_doc.pedido_id AND NOT l.cancelada;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A linha não está no pedido (ou foi tirada).' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.emendas_linhas_da_ata(v_doc.pedido_id, v_doc.ata_key) x WHERE x = v_id) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A linha não tem item da ata % da solicitação.', split_part(v_doc.ata_key, '-', 1) USING ERRCODE = '22023';
    END IF;
    v_qtd := COALESCE(NULLIF(v_item ->> 'quantidade', '')::NUMERIC, v_linha.quantidade);
    IF v_qtd <= 0 OR v_qtd > v_linha.quantidade THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A quantidade coberta tem de ficar entre 1 e a quantidade da linha (%).', v_linha.quantidade USING ERRCODE = '22023';
    END IF;
    -- A linha que estava em outra solicitação passa para esta.
    DELETE FROM public.emenda_solicitacao_linhas WHERE linha_id = v_id;
    INSERT INTO public.emenda_solicitacao_linhas (documento_id, linha_id, quantidade, criado_por)
    VALUES (p_documento, v_id, v_qtd, auth.uid());
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_ligar_linhas_da_solicitacao(UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- Solicitação única da ata cobre todas as linhas da ata que ainda não estão em nenhuma solicitação. Devolve quantas.
CREATE OR REPLACE FUNCTION public.emendas_cobrir_linhas_da_ata(p_documento UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc RECORD;
  v_n   INTEGER;
BEGIN
  SELECT id, pedido_id, etapa, ata_key INTO v_doc FROM public.emenda_pedido_documentos_sei WHERE id = p_documento;
  IF NOT FOUND OR v_doc.etapa <> 'AUTORIZACAO' OR v_doc.ata_key IS NULL THEN RETURN 0; END IF;
  IF (SELECT count(*) FROM public.emenda_pedido_documentos_sei d
       WHERE d.pedido_id = v_doc.pedido_id AND d.etapa = 'AUTORIZACAO' AND d.ata_key = v_doc.ata_key) <> 1 THEN
    RETURN 0;
  END IF;
  INSERT INTO public.emenda_solicitacao_linhas (documento_id, linha_id, quantidade, criado_por)
  SELECT v_doc.id, l.id, l.quantidade, auth.uid()
    FROM public.emendas_linhas_da_ata(v_doc.pedido_id, v_doc.ata_key) x
    JOIN public.emenda_pedido_linhas l ON l.id = x
   WHERE NOT EXISTS (SELECT 1 FROM public.emenda_solicitacao_linhas s WHERE s.linha_id = l.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_cobrir_linhas_da_ata(UUID) FROM PUBLIC, anon, authenticated;

-- 5) Gatilho: a solicitação que ganha a ata cobre as linhas; a que perde a ata perde as linhas --------------------
CREATE OR REPLACE FUNCTION public.trg_emendas_solicitacao_linhas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.etapa <> 'AUTORIZACAO' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.ata_key IS NOT NULL AND OLD.ata_key IS DISTINCT FROM NEW.ata_key THEN
    DELETE FROM public.emenda_solicitacao_linhas WHERE documento_id = NEW.id;
  END IF;
  IF NEW.ata_key IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.ata_key IS DISTINCT FROM NEW.ata_key) THEN
    PERFORM public.emendas_cobrir_linhas_da_ata(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_solicitacao_linhas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_emendas_solicitacao_linhas ON public.emenda_pedido_documentos_sei;
CREATE TRIGGER trg_emendas_solicitacao_linhas
  AFTER INSERT OR UPDATE OF ata_key ON public.emenda_pedido_documentos_sei
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_solicitacao_linhas();

-- 4) O gestor informa a solicitação de uma ata, com as linhas que ela cobre -------------------
DROP FUNCTION IF EXISTS public.informar_solicitacao_da_ata(UUID, TEXT, TEXT, DATE, TEXT);
CREATE OR REPLACE FUNCTION public.informar_solicitacao_da_ata(
  p_id UUID, p_ata TEXT, p_documento_sei TEXT, p_assinada_em DATE DEFAULT NULL, p_substitui TEXT DEFAULT NULL, p_linhas JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_etapa   TEXT;
  v_sei     TEXT := regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g');
  v_antigo  TEXT := NULLIF(regexp_replace(COALESCE(p_substitui, ''), '\D', '', 'g'), '');
  v_outra   TEXT;
  v_doc     UUID;
  v_doc_ant UUID;
  v_linhas  INTEGER := 0;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram as etapas.' USING ERRCODE = '42501';
  END IF;
  SELECT etapa INTO v_etapa FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_etapa NOT IN ('SOLICITADO', 'AUTORIZADO', 'CGOFI', 'EMPENHADO', 'CONTRATACAO') THEN
    RAISE EXCEPTION 'INVALID_STATE: A solicitação de empenho vem depois da conferência no SIOP.' USING ERRCODE = '22023';
  END IF;
  IF v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Documento SEI: só números, 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.emendas_atas_do_pedido(p_id) a WHERE a = p_ata) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A ata % não está nas linhas do pedido.', split_part(p_ata, '-', 1) USING ERRCODE = '22023';
  END IF;
  IF p_assinada_em IS NOT NULL AND p_assinada_em > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data da assinatura não pode ser depois de hoje.' USING ERRCODE = '22023';
  END IF;
  SELECT ata_key INTO v_outra FROM public.emenda_pedido_documentos_sei
   WHERE pedido_id = p_id AND etapa = 'AUTORIZACAO' AND documento_sei = v_sei;
  IF v_outra IS NOT NULL AND v_outra <> p_ata THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O documento SEI % já é a solicitação da ata %.', v_sei, split_part(v_outra, '-', 1) USING ERRCODE = '22023';
  END IF;
  IF v_antigo IS NOT NULL AND v_antigo <> v_sei THEN
    SELECT id INTO v_doc_ant FROM public.emenda_pedido_documentos_sei
     WHERE pedido_id = p_id AND etapa = 'AUTORIZACAO' AND documento_sei = v_antigo AND ata_key = p_ata;
    IF v_doc_ant IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O documento SEI % não é uma solicitação da ata %.', v_antigo, split_part(p_ata, '-', 1) USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.emenda_pedido_documentos_sei (pedido_id, etapa, documento_sei, ata_key, assinado_em, origem)
  VALUES (p_id, 'AUTORIZACAO', v_sei, p_ata,
          CASE WHEN p_assinada_em IS NULL THEN NULL ELSE (p_assinada_em + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo' END, 'SISTEMA')
  ON CONFLICT (pedido_id, etapa, documento_sei) DO UPDATE
     SET ata_key = EXCLUDED.ata_key,
         assinado_em = COALESCE(EXCLUDED.assinado_em, emenda_pedido_documentos_sei.assinado_em)
  RETURNING id INTO v_doc;

  -- Troca: as linhas da solicitação anterior passam para a nova; a anterior sai da ata e fica no pedido, sem ata.
  IF v_doc_ant IS NOT NULL THEN
    UPDATE public.emenda_solicitacao_linhas SET documento_id = v_doc WHERE documento_id = v_doc_ant;
    UPDATE public.emenda_pedido_documentos_sei SET ata_key = NULL WHERE id = v_doc_ant;
  END IF;

  IF p_linhas IS NOT NULL THEN
    v_linhas := public.emendas_ligar_linhas_da_solicitacao(v_doc, p_linhas);
  ELSE
    -- Sem a lista: a solicitação única da ata cobre todas as linhas da ata (o gatilho já cobre no INSERT; aqui vale
    -- também quando o documento já existia e para a troca).
    v_linhas := public.emendas_cobrir_linhas_da_ata(v_doc);
  END IF;
  RETURN jsonb_build_object('ata', p_ata, 'documento_sei', v_sei, 'trocou', CASE WHEN v_antigo <> v_sei THEN v_antigo END,
                            'linhas', (SELECT count(*) FROM public.emenda_solicitacao_linhas WHERE documento_id = v_doc));
END;
$$;
REVOKE ALL ON FUNCTION public.informar_solicitacao_da_ata(UUID, TEXT, TEXT, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_solicitacao_da_ata(UUID, TEXT, TEXT, DATE, TEXT, JSONB) TO authenticated;

-- 6) Carga inicial: atas com uma solicitação só --------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_total INTEGER := 0;
BEGIN
  FOR r IN SELECT d.id FROM public.emenda_pedido_documentos_sei d WHERE d.etapa = 'AUTORIZACAO' AND d.ata_key IS NOT NULL LOOP
    v_total := v_total + public.emendas_cobrir_linhas_da_ata(r.id);
  END LOOP;
  RAISE NOTICE 'Solicitações ligadas às linhas: % linhas cobertas.', v_total;
END $$;
