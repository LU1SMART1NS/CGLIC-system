-- ==============================================================================
-- MIGRATION 178: EMENDAS PARLAMENTARES — UMA SOLICITAÇÃO DE AUTORIZAÇÃO DE EMPENHO PARA CADA ATA
-- Versão: 20261024000178_emendas_solicitacao_por_ata.sql
--
-- Protótipo aprovado em 24/10/2026 (passo 4 do plano emendas-carga-sei). Medição no banco: das 128 solicitações de
-- autorização já ligadas às linhas, todas cobrem uma ata só; o mesmo fornecedor em duas atas recebeu duas. A tela
-- passa a listar as atas do pedido, cada uma com a sua solicitação e a data em que a Diretora do FNSP assinou, e a
-- contar "3 de 4 atas". A tela mostra só o que o gestor informa (número SEI, data, ata); o que só a leitura do SEI
-- trouxe (hora, quem assinou, processo da solicitação) fica guardado e não aparece.
--
-- 1) emenda_pedido_documentos_sei.ata_key (numero_ata-uasg, como em item_key): a ata que a solicitação cobre
--    (só na etapa AUTORIZACAO). Uma solicitação por ata no pedido. Começa com o que está nas linhas
--    (emenda_pedido_linhas.autorizacao_documento_sei, migration 177), que sai: a ata fica no documento, que serve
--    também para as linhas de kit (um kit pode ter itens de mais de uma ata).
-- 2) emendas_atas_do_pedido(pedido): as atas das linhas ativas (itens e itens dos kits).
-- 3) Gatilho em emenda_pedidos: pedido de uma ata só liga sozinho a solicitação registrada pela tela; ao registrar a
--    autorização (autorizado_em), as solicitações ainda sem data de assinatura ficam assinadas nessa data.
-- 4) informar_solicitacao_da_ata(pedido, ata, documento, assinada_em): o gestor informa a solicitação de uma ata
--    (e, se já assinou, a data). Troca a solicitação que a ata tinha; recusa número já ligado a outra ata.
-- 5) v_emendas_itens_caep ganha o fornecedor do item, no fim, para a lista das atas do pedido.
-- ==============================================================================

-- 1) Ata da solicitação -------------------------------------------------------------
ALTER TABLE public.emenda_pedido_documentos_sei ADD COLUMN IF NOT EXISTS ata_key VARCHAR(30);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_pedido_documentos_sei_ata') THEN
    ALTER TABLE public.emenda_pedido_documentos_sei ADD CONSTRAINT emenda_pedido_documentos_sei_ata
      CHECK (ata_key IS NULL OR (etapa = 'AUTORIZACAO' AND ata_key ~ '^[^-]+-[0-9]+$'));
  END IF;
END $$;
COMMENT ON COLUMN public.emenda_pedido_documentos_sei.ata_key IS
  'Ata que a solicitação de autorização de empenho cobre (numero_ata-uasg, como o começo de item_key). Uma por ata no pedido.';
CREATE UNIQUE INDEX IF NOT EXISTS ux_emenda_pedido_documentos_sei_ata
  ON public.emenda_pedido_documentos_sei (pedido_id, ata_key) WHERE ata_key IS NOT NULL;

-- 2) Atas do pedido ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emendas_atas_do_pedido(p_pedido UUID)
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT split_part(k, '-', 1) || '-' || split_part(k, '-', 2)
    FROM (
      SELECT l.item_key AS k
        FROM public.emenda_pedido_linhas l
       WHERE l.pedido_id = p_pedido AND NOT l.cancelada AND l.tipo = 'ITEM'
      UNION ALL
      SELECT c ->> 'item_key'
        FROM public.emenda_pedido_linhas l, jsonb_array_elements(COALESCE(l.kit_composicao, '[]'::jsonb)) c
       WHERE l.pedido_id = p_pedido AND NOT l.cancelada AND l.tipo = 'KIT'
    ) x
   WHERE k IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.emendas_atas_do_pedido(UUID) FROM PUBLIC, anon, authenticated;

-- 1) Carga: a ata vem das linhas que a migration 177 ligou à solicitação; depois a coluna sai -------
-- Por EXECUTE: rodando de novo, a coluna já não existe e o bloco não faz nada.
DO $$
DECLARE v_soltas INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'emenda_pedido_linhas' AND column_name = 'autorizacao_documento_sei') THEN
    EXECUTE $sql$
      WITH ligadas AS (
        SELECT l.pedido_id, l.autorizacao_documento_sei AS doc,
               min(split_part(l.item_key, '-', 1) || '-' || split_part(l.item_key, '-', 2)) AS ata,
               count(DISTINCT split_part(l.item_key, '-', 1) || '-' || split_part(l.item_key, '-', 2)) AS atas
          FROM public.emenda_pedido_linhas l
         WHERE l.autorizacao_documento_sei IS NOT NULL AND l.item_key IS NOT NULL
         GROUP BY 1, 2
      )
      UPDATE public.emenda_pedido_documentos_sei d
         SET ata_key = g.ata
        FROM ligadas g
       WHERE g.atas = 1 AND d.pedido_id = g.pedido_id AND d.etapa = 'AUTORIZACAO' AND d.documento_sei = g.doc AND d.ata_key IS NULL
    $sql$;
    EXECUTE $sql$
      SELECT count(*)
        FROM public.emenda_pedido_linhas l
       WHERE l.autorizacao_documento_sei IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.emenda_pedido_documentos_sei d
                          WHERE d.pedido_id = l.pedido_id AND d.etapa = 'AUTORIZACAO' AND d.documento_sei = l.autorizacao_documento_sei
                            AND d.ata_key = split_part(l.item_key, '-', 1) || '-' || split_part(l.item_key, '-', 2))
    $sql$ INTO v_soltas;
    IF v_soltas > 0 THEN
      RAISE EXCEPTION '% linhas com solicitação que não passou para o documento: confira antes de apagar a coluna.', v_soltas;
    END IF;
    ALTER TABLE public.emenda_pedido_linhas DROP COLUMN autorizacao_documento_sei;
  END IF;
END $$;

-- 3) Gatilho: ata única e data da assinatura ----------------------------------------------
CREATE OR REPLACE FUNCTION public.emendas_solicitacoes_das_atas(p_pedido UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p   RECORD;
  v_ata TEXT;
BEGIN
  SELECT id, solicitado_documento_sei, autorizado_em INTO v_p FROM public.emenda_pedidos WHERE id = p_pedido;
  IF NOT FOUND THEN RETURN; END IF;
  -- Pedido de uma ata só: a solicitação registrada pela tela é a dessa ata (se a ata ainda não tem outra).
  IF (SELECT count(*) FROM public.emendas_atas_do_pedido(p_pedido)) = 1 AND v_p.solicitado_documento_sei IS NOT NULL THEN
    SELECT a INTO v_ata FROM public.emendas_atas_do_pedido(p_pedido) a;
    UPDATE public.emenda_pedido_documentos_sei d
       SET ata_key = v_ata
     WHERE d.pedido_id = p_pedido AND d.etapa = 'AUTORIZACAO' AND d.documento_sei = btrim(v_p.solicitado_documento_sei) AND d.ata_key IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.emenda_pedido_documentos_sei o
                        WHERE o.pedido_id = p_pedido AND o.etapa = 'AUTORIZACAO' AND o.ata_key = v_ata);
  END IF;
  -- Autorização registrada: as solicitações sem data de assinatura foram assinadas nesse dia.
  IF v_p.autorizado_em IS NOT NULL THEN
    UPDATE public.emenda_pedido_documentos_sei d
       SET assinado_em = (v_p.autorizado_em + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo'
     WHERE d.pedido_id = p_pedido AND d.etapa = 'AUTORIZACAO' AND d.assinado_em IS NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_solicitacoes_das_atas(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_emendas_solicitacoes_das_atas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.emendas_solicitacoes_das_atas(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_solicitacoes_das_atas() FROM PUBLIC, anon, authenticated;

-- O nome vem depois de trg_emendas_documentos_das_colunas: roda depois que o documento entrou na tabela.
DROP TRIGGER IF EXISTS trg_emendas_solicitacoes_das_atas ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_solicitacoes_das_atas
  AFTER INSERT OR UPDATE OF solicitado_documento_sei, autorizado_em ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_solicitacoes_das_atas();

-- Carga: pedidos de uma ata só ligam a solicitação que já têm.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.emenda_pedidos WHERE solicitado_documento_sei IS NOT NULL LOOP
    PERFORM public.emendas_solicitacoes_das_atas(r.id);
  END LOOP;
END $$;

-- 4) O gestor informa a solicitação de uma ata ----------------------------------------------
CREATE OR REPLACE FUNCTION public.informar_solicitacao_da_ata(p_id UUID, p_ata TEXT, p_documento_sei TEXT, p_assinada_em DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_etapa TEXT;
  v_sei   TEXT := regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g');
  v_outra TEXT;
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

  -- A ata troca de solicitação: a anterior fica no pedido, sem ata.
  UPDATE public.emenda_pedido_documentos_sei
     SET ata_key = NULL
   WHERE pedido_id = p_id AND etapa = 'AUTORIZACAO' AND ata_key = p_ata AND documento_sei <> v_sei;
  INSERT INTO public.emenda_pedido_documentos_sei (pedido_id, etapa, documento_sei, ata_key, assinado_em, origem)
  VALUES (p_id, 'AUTORIZACAO', v_sei, p_ata,
          CASE WHEN p_assinada_em IS NULL THEN NULL ELSE (p_assinada_em + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo' END, 'SISTEMA')
  ON CONFLICT (pedido_id, etapa, documento_sei) DO UPDATE
     SET ata_key = EXCLUDED.ata_key,
         assinado_em = COALESCE(EXCLUDED.assinado_em, emenda_pedido_documentos_sei.assinado_em);
  RETURN jsonb_build_object('ata', p_ata, 'documento_sei', v_sei);
END;
$$;
REVOKE ALL ON FUNCTION public.informar_solicitacao_da_ata(UUID, TEXT, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_solicitacao_da_ata(UUID, TEXT, TEXT, DATE) TO authenticated;

-- 5) Fornecedor do item na lista da CAEP --------------------------------------------------
CREATE OR REPLACE VIEW public.v_emendas_itens_caep
WITH (security_invoker = true) AS
SELECT a.item_key,
       r.numero_ata,
       r.codigo_uasg,
       i.numero_item,
       i.descricao_item,
       i.codigo_pdm,
       i.valor_unitario,
       r.data_vigencia_final,
       (r.data_vigencia_final IS NOT NULL
         AND r.data_vigencia_final < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE) AS ata_encerrada,
       a.allocated_qty AS alocado,
       d.nome_curto,
       d.gnd,
       d.versao AS dados_versao,
       i.fornecedor_razao_social AS fornecedor
  FROM public.arp_allocations a
  JOIN public.atas_registro_preco r
    ON r.numero_ata = split_part(a.item_key, '-', 1)
   AND r.codigo_uasg = split_part(a.item_key, '-', 2)
  JOIN public.itens_ata i
    ON i.ata_id = r.id
   AND lpad(i.numero_item, 5, '0') = split_part(a.item_key, '-', 3)
  LEFT JOIN public.emenda_itens_dados d ON d.item_key = a.item_key
 WHERE a.unit_name = public.unidade_das_emendas()
   AND a.allocated_qty > 0;
