-- ==============================================================================
-- MIGRATION 177: EMENDAS PARLAMENTARES — TODOS OS DOCUMENTOS SEI DE CADA ETAPA E A NOTA PELO SEI
-- Versão: 20261024000177_emendas_documentos_sei.sql
--
-- Plano aprovado em 24/10/2026 (docs/estudos/emendas-carga-sei.md, passo 2). A leitura do SEI mostrou que uma etapa
-- do pedido costuma ter vários documentos: uma autorização de DDO e NE por ata, um envio à CGOFI por lote, uma nota
-- de empenho por fornecedor, um despacho à CCGA por nota. As colunas de hoje (oficio_documento_sei,
-- solicitado_documento_sei, cgofi_documento_sei…) guardam um número só; ficam como "o documento que fecha a etapa".
--
-- 1) emenda_pedido_documentos_sei: um documento SEI por linha, do pedido e da etapa, com a data, a assinatura (data,
--    hora e quem assinou), o número da nota de empenho (nos documentos da etapa EMPENHO) e a origem: SEI (lido no
--    SEI) ou SISTEMA (registrado pela tela ou pelas cargas). Grava só o servidor (cargas e o gatilho do item 2).
-- 2) Gatilho em emenda_pedidos: todo documento SEI gravado nas colunas das etapas (pela tela, avancar_pedido_emenda,
--    ou pelas cargas) entra também na tabela, se ainda não estiver. A tabela começa com o que já está nas colunas.
-- 3) emenda_pedido_linhas.autorizacao_documento_sei: a autorização de DDO e NE que cobre a linha (ata e item).
-- 4) emendas_ligar_notas(): regra nova SEI, antes das outras. Vale a nota cujo documento SEI está no pedido
--    (etapa EMPENHO, com o número da nota): a que está num contrato do item da linha ou, se o pedido tem uma nota só,
--    essa. Só nota do ano do pedido (como nas outras regras) e sem outra emenda no plano interno. O número da nota se
--    repete nas UGs 200330 e 200331: vale a de plano interno com a emenda do pedido, depois a de plano interno de
--    emenda (SP999), depois a da UG 200330.
-- 5) Sai emenda_pedido_linhas.nota_empenho: a nota não é mais digitada (migration 174) e nenhuma linha tem nota
--    (conferido em 24/10/2026). A nota da linha vem só do sistema (emenda_linha_notas).
--
-- Nada muda para quem usa as telas além do rótulo "achada pelo SEI" na nota.
-- ==============================================================================

-- 5) Coluna da nota digitada ------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'emenda_pedido_linhas' AND column_name = 'nota_empenho') THEN
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE nota_empenho IS NOT NULL) THEN
      RAISE EXCEPTION 'Há linha com nota de empenho digitada: confira antes de apagar a coluna.';
    END IF;
    ALTER TABLE public.emenda_pedido_linhas DROP COLUMN nota_empenho;
  END IF;
END $$;

-- 3) Autorização que cobre a linha -----------------------------------------------
ALTER TABLE public.emenda_pedido_linhas ADD COLUMN IF NOT EXISTS autorizacao_documento_sei VARCHAR(10);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_pedido_linhas_autorizacao_sei') THEN
    ALTER TABLE public.emenda_pedido_linhas ADD CONSTRAINT emenda_pedido_linhas_autorizacao_sei
      CHECK (autorizacao_documento_sei IS NULL OR autorizacao_documento_sei ~ '^[0-9]{7,10}$');
  END IF;
END $$;
COMMENT ON COLUMN public.emenda_pedido_linhas.autorizacao_documento_sei IS
  'Documento SEI da autorização de DDO e NE (assinada pela DGFNSP) que traz o item e a quantidade desta linha.';

-- 1) Documentos SEI do pedido -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_pedido_documentos_sei (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        UUID         NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  etapa            VARCHAR(12)  NOT NULL,
  documento_sei    VARCHAR(10)  NOT NULL,
  processo_sei     VARCHAR(25),
  data_documento   DATE,
  assinado_em      TIMESTAMPTZ,
  assinante_nome   VARCHAR(150),
  assinante_cargo  VARCHAR(200),
  nota_empenho     VARCHAR(12),
  origem           VARCHAR(8)   NOT NULL DEFAULT 'SISTEMA',
  lido_em          TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_pedido_documentos_sei_etapa CHECK (etapa IN ('OFICIO', 'AUTORIZACAO', 'CGOFI', 'EMPENHO', 'CONTRATACAO')),
  CONSTRAINT emenda_pedido_documentos_sei_numero CHECK (documento_sei ~ '^[0-9]{7,10}$'),
  CONSTRAINT emenda_pedido_documentos_sei_nota CHECK (nota_empenho IS NULL OR (etapa = 'EMPENHO' AND nota_empenho ~ '^[0-9]{4}NE[0-9]{6}$')),
  CONSTRAINT emenda_pedido_documentos_sei_origem CHECK (origem IN ('SEI', 'SISTEMA')),
  CONSTRAINT emenda_pedido_documentos_sei_unico UNIQUE (pedido_id, etapa, documento_sei)
);
COMMENT ON TABLE public.emenda_pedido_documentos_sei IS
  'Todos os documentos SEI de cada etapa do pedido de emenda (ofício, autorização de DDO e NE, envio à CGOFI, notas de empenho, despachos à CCGA). Grava só o servidor.';
COMMENT ON COLUMN public.emenda_pedido_documentos_sei.etapa IS
  'OFICIO (ofício do parlamentar), AUTORIZACAO (autorização de DDO e NE: elaborada = empenho solicitado; assinada pela DGFNSP = empenho autorizado), CGOFI (envio à CGOFI), EMPENHO (nota de empenho), CONTRATACAO (despacho à CCGA).';
COMMENT ON COLUMN public.emenda_pedido_documentos_sei.data_documento IS
  'Data do documento: elaboração da autorização, chegada do ofício ao MJ, assinatura do despacho, emissão da nota.';
COMMENT ON COLUMN public.emenda_pedido_documentos_sei.assinado_em IS 'Data e hora da assinatura eletrônica no SEI (na autorização: a da Diretora do FNSP).';
COMMENT ON COLUMN public.emenda_pedido_documentos_sei.nota_empenho IS 'Número da nota de empenho deste documento (etapa EMPENHO), como 2026NE000032.';
COMMENT ON COLUMN public.emenda_pedido_documentos_sei.origem IS 'SEI = lido no SEI; SISTEMA = registrado pela tela ou pelas cargas.';
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_documentos_sei_pedido ON public.emenda_pedido_documentos_sei (pedido_id, etapa);
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_documentos_sei_nota ON public.emenda_pedido_documentos_sei (nota_empenho) WHERE nota_empenho IS NOT NULL;

ALTER TABLE public.emenda_pedido_documentos_sei ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_pedido_documentos_sei" ON public.emenda_pedido_documentos_sei;
CREATE POLICY "Leitura das emendas: emenda_pedido_documentos_sei" ON public.emenda_pedido_documentos_sei FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_pedido_documentos_sei;
CREATE POLICY "Somente usuario ativo" ON public.emenda_pedido_documentos_sei AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_pedido_documentos_sei FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_pedido_documentos_sei TO authenticated;
GRANT ALL ON public.emenda_pedido_documentos_sei TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_pedido_documentos_sei ON public.emenda_pedido_documentos_sei;
    CREATE TRIGGER trg_audit_emenda_pedido_documentos_sei AFTER INSERT OR UPDATE OR DELETE ON public.emenda_pedido_documentos_sei
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- 2) Documentos das colunas entram na tabela ---------------------------------------
-- Uma linha por documento das colunas do pedido; não troca o que já está (o lido no SEI vale mais).
CREATE OR REPLACE FUNCTION public.emendas_documentos_das_colunas(p_pedido UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n INTEGER;
BEGIN
  WITH p AS (SELECT * FROM public.emenda_pedidos WHERE id = p_pedido),
  docs AS (
    SELECT 'OFICIO' AS etapa, p.oficio_documento_sei AS doc, p.oficio_processo_sei AS processo, p.oficio_em AS data FROM p
    UNION ALL SELECT 'AUTORIZACAO', p.solicitado_documento_sei, NULL, p.solicitado_em FROM p
    UNION ALL SELECT 'AUTORIZACAO', p.autorizado_documento_sei, NULL, COALESCE(p.solicitado_em, p.autorizado_em) FROM p
    UNION ALL SELECT 'CGOFI', p.cgofi_documento_sei, NULL, p.cgofi_em FROM p
    UNION ALL SELECT 'EMPENHO', x, NULL, p.empenhado_em FROM p, unnest(COALESCE(p.empenhado_documentos_sei, '{}')) x
    UNION ALL SELECT 'CONTRATACAO', x, NULL, p.contratacao_em FROM p, unnest(COALESCE(p.contratacao_documentos_sei, '{}')) x
  )
  INSERT INTO public.emenda_pedido_documentos_sei (pedido_id, etapa, documento_sei, processo_sei, data_documento, origem)
  SELECT DISTINCT ON (d.etapa, btrim(d.doc)) p_pedido, d.etapa, btrim(d.doc), d.processo, d.data, 'SISTEMA'
    FROM docs d
   WHERE btrim(COALESCE(d.doc, '')) ~ '^[0-9]{7,10}$'
  ON CONFLICT (pedido_id, etapa, documento_sei) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_documentos_das_colunas(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_emendas_documentos_das_colunas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.emendas_documentos_das_colunas(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_documentos_das_colunas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_emendas_documentos_das_colunas ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_documentos_das_colunas
  AFTER INSERT OR UPDATE OF oficio_documento_sei, solicitado_documento_sei, autorizado_documento_sei, cgofi_documento_sei,
                            empenhado_documentos_sei, contratacao_documentos_sei
  ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_documentos_das_colunas();

-- Começa com o que já está nas colunas.
SELECT count(public.emendas_documentos_das_colunas(id)) FROM public.emenda_pedidos;

-- 4) Nota pelo SEI ---------------------------------------------------------------
ALTER TABLE public.emenda_linha_notas DROP CONSTRAINT IF EXISTS emenda_linha_notas_regra;
ALTER TABLE public.emenda_linha_notas ADD CONSTRAINT emenda_linha_notas_regra
  CHECK (regra IS NULL OR regra IN ('SEI', 'CONTRATO', 'ITEM', 'AUTOR'));

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
    SELECT l.id, l.pedido_id, l.item_key, l.contrato_numero, p.siop_emenda AS emenda,
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
  -- SEI: notas cujos documentos estão no pedido; uma nota por número (o número se repete nas UGs 200330 e 200331)
  ne_sei AS (
    SELECT DISTINCT ON (d.pedido_id, d.nota_empenho) d.pedido_id, e.id AS empenho_id
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
      JOIN public.empenhos e ON e.numero_oficial = d.nota_empenho AND e.uasg_emitente IN ('200330', '200331')
     WHERE d.etapa = 'EMPENHO' AND d.nota_empenho IS NOT NULL
       -- nota do ano do pedido (como nas outras regras) e sem outra emenda no plano interno
       AND e.ano_exercicio = EXTRACT(YEAR FROM COALESCE(p.empenhado_em, (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE))::INTEGER
       AND (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') IS NULL OR substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = p.siop_emenda)
     ORDER BY d.pedido_id, d.nota_empenho,
              (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = p.siop_emenda) DESC NULLS LAST,
              (e.plano_interno LIKE 'SP999%') DESC NULLS LAST,
              (e.uasg_emitente = '200330') DESC),
  ne_sei_ctr AS (
    SELECT s.pedido_id, s.empenho_id, ce.contract_key
      FROM ne_sei s LEFT JOIN public.contrato_empenhos ce ON ce.empenho_id = s.empenho_id),
  s1 AS (SELECT l.id, count(DISTINCT x.empenho_id) n, (array_agg(x.empenho_id))[1] empenho_id, (array_agg(x.contract_key))[1] contract_key
           FROM l JOIN ne_sei_ctr x ON x.pedido_id = l.pedido_id
           JOIN ic ON ic.contract_key = x.contract_key AND ic.item_key = l.item_key
          GROUP BY l.id),
  s2 AS (SELECT x.pedido_id, count(DISTINCT x.empenho_id) n, (array_agg(x.empenho_id))[1] empenho_id, (array_agg(x.contract_key))[1] contract_key
           FROM ne_sei_ctr x GROUP BY x.pedido_id),
  sei AS (SELECT l.id,
                 CASE WHEN s1.n = 1 THEN s1.empenho_id WHEN COALESCE(s1.n, 0) = 0 AND s2.n = 1 THEN s2.empenho_id END AS empenho_id,
                 CASE WHEN s1.n = 1 THEN s1.contract_key WHEN COALESCE(s1.n, 0) = 0 AND s2.n = 1 THEN s2.contract_key END AS contract_key
            FROM l LEFT JOIN s1 ON s1.id = l.id LEFT JOIN s2 ON s2.pedido_id = l.pedido_id),
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
            FROM public.contratos_oficiais co WHERE co.uasg IN ('200330', '200331')),
  r AS (
    SELECT l.id, l.emenda, l.contrato_numero, sei.empenho_id AS sei_id, sei.contract_key AS sei_ctr,
           a.n AS an, a.empenho_id AS a_id, a.contract_key AS a_ctr,
           b.n AS bn, b.empenho_id AS b_id, b.contract_key AS b_ctr,
           c.n AS cn, c.empenho_id AS c_id, c.contract_key AS c_ctr
      FROM l LEFT JOIN sei ON sei.id = l.id LEFT JOIN a ON a.id = l.id LEFT JOIN b ON b.id = l.id LEFT JOIN c ON c.id = l.id)
  INSERT INTO tmp_emenda_notas (linha_id, empenho_id, regra, motivo, contract_key)
  SELECT r.id,
         CASE WHEN r.sei_id IS NOT NULL THEN r.sei_id
              WHEN r.an = 1 THEN r.a_id WHEN COALESCE(r.an, 0) = 0 AND r.bn = 1 THEN r.b_id
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND r.cn = 1 THEN r.c_id END,
         CASE WHEN r.sei_id IS NOT NULL THEN 'SEI'
              WHEN r.an = 1 THEN 'CONTRATO' WHEN COALESCE(r.an, 0) = 0 AND r.bn = 1 THEN 'ITEM'
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND r.cn = 1 THEN 'AUTOR' END,
         CASE WHEN r.sei_id IS NOT NULL OR r.an = 1 OR (COALESCE(r.an, 0) = 0 AND r.bn = 1)
                   OR (COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND r.cn = 1) THEN NULL
              WHEN r.an > 1 OR r.bn > 1 OR r.cn > 1 THEN 'VARIAS'
              WHEN r.emenda IS NULL THEN 'SEM_EMENDA'
              WHEN r.contrato_numero IS NULL THEN 'SEM_CONTRATO'
              WHEN ctr.contract_key IS NULL THEN 'CONTRATO_FORA'
              WHEN NOT ctr.tem_nota THEN 'CONTRATO_SEM_NOTA'
              ELSE 'OUTRAS_EMENDAS' END,
         CASE WHEN r.sei_id IS NOT NULL THEN COALESCE(r.sei_ctr, ctr.contract_key)
              WHEN r.an = 1 THEN r.a_ctr WHEN COALESCE(r.an, 0) = 0 AND r.bn = 1 THEN r.b_ctr
              WHEN COALESCE(r.an, 0) = 0 AND COALESCE(r.bn, 0) = 0 AND r.cn = 1 THEN r.c_ctr ELSE ctr.contract_key END
    FROM r
    LEFT JOIN LATERAL (SELECT x.contract_key, x.tem_nota FROM ctr x WHERE x.numero = r.contrato_numero
                        ORDER BY (x.contract_key LIKE '200331-%') DESC LIMIT 1) ctr ON TRUE;

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
                            'por_regra', (SELECT jsonb_object_agg(regra, n) FROM (SELECT regra, count(*) n FROM public.emenda_linha_notas WHERE regra IS NOT NULL GROUP BY 1) s),
                            'por_motivo', (SELECT jsonb_object_agg(motivo, n) FROM (SELECT motivo, count(*) n FROM public.emenda_linha_notas WHERE motivo IS NOT NULL GROUP BY 1) s))
    INTO v_res FROM public.emenda_linha_notas;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_ligar_notas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_ligar_notas() TO authenticated, service_role;

-- Liga de novo já com a regra nova.
SELECT public.emendas_ligar_notas();
