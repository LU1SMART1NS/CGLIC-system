-- ==============================================================================
-- MIGRATION 252: EMENDAS LIDAS DO PAINEL DO ORÇAMENTO FEDERAL (SIOP)
-- Versão: 20261103000252_emendas_painel_siop.sql
--
-- Até aqui a CAEP copiava do SIOP à mão o valor de cada emenda (emendas_siop, migrations 205 e 243). O Painel do
-- Orçamento Federal (www1.siop.planejamento.gov.br, QlikView, aba Emendas Parlamentares) mostra as emendas com dotação
-- inicial e atual, empenhado, liquidado e pago. O servidor passa a ler o painel uma vez por dia (recurso
-- 'emendas_siop_painel' da Edge Function sincronizar-fontes) sem os filtros do Passo 1 (o painel abre em Ano 2026,
-- Órgão 30000 e RP 6) e com os doze agrupadores do Passo 2 ligados.
--   1) siop_painel_emendas: a foto do painel, uma linha por emenda e combinação dos agrupadores (autor, tipo, partido,
--      UF, órgão, unidade orçamentária, ação, localizador, GND, modalidade e natureza de despesa); as colunas como
--      vieram ficam também em `dimensoes`. Grava só o servidor.
--   2) gravar_emendas_siop_painel grava um lote com o id da leitura; concluir_leitura_siop_painel, no fim, remove dos
--      anos lidos as linhas que não vieram nesta leitura. O servidor só grava a leitura inteira e conferida com a linha
--      Total do painel.
--   3) disparar_sincronizacao manda x-region: sa-east-1 também para este recurso (o SIOP é servidor do governo, como
--      a Câmara da migration 156, que só responde a quem chama do Brasil).
--   4) Agendamento diário às 10h22 de Brasília (o painel atualiza a base de manhã, ~9h30).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.siop_painel_emendas (
  ano                  SMALLINT      NOT NULL CHECK (ano BETWEEN 2000 AND 2099),
  -- A emenda e todas as dimensões da linha, na ordem do painel ("38980002|6 - Emendas Individuais|Adolfo Viana|…").
  chave                TEXT          NOT NULL CHECK (length(chave) BETWEEN 9 AND 4000),
  chave_md5            TEXT          GENERATED ALWAYS AS (md5(chave)) STORED,
  emenda               VARCHAR(8)    NOT NULL CHECK (emenda ~ '^[0-9]{8}$'),
  -- Mesmo formato de emenda_execucao_portal.codigo (ano + 8 dígitos), para juntar com o Portal e com os pedidos.
  codigo               VARCHAR(12)   GENERATED ALWAYS AS ((ano::INTEGER)::TEXT || emenda) STORED,
  rp                   TEXT,
  autor                TEXT,
  tipo_autor           TEXT,
  partido              TEXT,
  uf                   TEXT,
  orgao                TEXT,
  unidade_orcamentaria TEXT,
  acao                 TEXT,
  localizador          TEXT,
  gnd                  TEXT,
  modalidade           TEXT,
  natureza_despesa     TEXT,
  -- Todas as colunas de texto como vieram do painel, pelo cabeçalho.
  dimensoes            JSONB         NOT NULL DEFAULT '{}'::JSONB,
  dotacao_inicial      NUMERIC(18,2),
  dotacao_atual        NUMERIC(18,2),
  empenhado            NUMERIC(18,2),
  liquidado            NUMERIC(18,2),
  pago                 NUMERIC(18,2),
  -- "Dados referentes à Base SIAFI de …" do painel.
  base_siafi_em        DATE,
  leitura              UUID          NOT NULL,
  lido_em              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ano, chave_md5)
);
CREATE INDEX IF NOT EXISTS siop_painel_emendas_codigo_idx ON public.siop_painel_emendas (codigo);
CREATE INDEX IF NOT EXISTS siop_painel_emendas_orgao_idx ON public.siop_painel_emendas (ano, orgao);
CREATE INDEX IF NOT EXISTS siop_painel_emendas_leitura_idx ON public.siop_painel_emendas (ano, leitura);
COMMENT ON TABLE public.siop_painel_emendas IS
  'Emendas do Painel do Orçamento Federal do SIOP, sem filtros e com todos os agrupadores (valores em R$). Grava só o servidor (migration 252).';

DO $$
DECLARE v_t TEXT := 'siop_painel_emendas';
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
END $$;

-- Um lote da leitura. p_linhas: [{ano, emenda, chave, rp, autor, tipo_autor, partido, uf, orgao, unidade_orcamentaria,
-- acao, localizador, gnd, modalidade, natureza_despesa, dimensoes, dotacao_inicial, dotacao_atual, empenhado, liquidado,
-- pago}]. Devolve quantas linhas gravou.
CREATE OR REPLACE FUNCTION public.gravar_emendas_siop_painel(p_leitura UUID, p_linhas JSONB, p_base_siafi DATE DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n INTEGER;
BEGIN
  IF p_leitura IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: falta o id da leitura.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o lote do painel deve ser um array com ao menos uma linha.' USING ERRCODE = '22023';
  END IF;
  -- Uma linha inválida recusa o lote: a leitura só conclui se todos os lotes entrarem.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_linhas) x
     WHERE NOT (COALESCE(x->>'ano', '') ~ '^20[0-9]{2}$' AND COALESCE(x->>'emenda', '') ~ '^[0-9]{8}$'
                AND length(COALESCE(x->>'chave', '')) BETWEEN 9 AND 4000)
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: há linha do painel sem ano, emenda (8 dígitos) ou chave.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.siop_painel_emendas AS d
         (ano, chave, emenda, rp, autor, tipo_autor, partido, uf, orgao, unidade_orcamentaria, acao, localizador, gnd,
          modalidade, natureza_despesa, dimensoes, dotacao_inicial, dotacao_atual, empenhado, liquidado, pago,
          base_siafi_em, leitura, lido_em)
  -- A mesma chave repetida no lote soma (o servidor já junta; aqui é só a garantia para o ON CONFLICT).
  SELECT (x->>'ano')::SMALLINT, x->>'chave', MIN(x->>'emenda'),
         MIN(NULLIF(btrim(x->>'rp'), '')), MIN(NULLIF(btrim(x->>'autor'), '')), MIN(NULLIF(btrim(x->>'tipo_autor'), '')),
         MIN(NULLIF(btrim(x->>'partido'), '')), MIN(NULLIF(btrim(x->>'uf'), '')), MIN(NULLIF(btrim(x->>'orgao'), '')),
         MIN(NULLIF(btrim(x->>'unidade_orcamentaria'), '')), MIN(NULLIF(btrim(x->>'acao'), '')),
         MIN(NULLIF(btrim(x->>'localizador'), '')), MIN(NULLIF(btrim(x->>'gnd'), '')), MIN(NULLIF(btrim(x->>'modalidade'), '')),
         MIN(NULLIF(btrim(x->>'natureza_despesa'), '')),
         COALESCE((array_agg(x->'dimensoes') FILTER (WHERE jsonb_typeof(x->'dimensoes') = 'object'))[1], '{}'::JSONB),
         SUM(NULLIF(x->>'dotacao_inicial', '')::NUMERIC), SUM(NULLIF(x->>'dotacao_atual', '')::NUMERIC),
         SUM(NULLIF(x->>'empenhado', '')::NUMERIC), SUM(NULLIF(x->>'liquidado', '')::NUMERIC), SUM(NULLIF(x->>'pago', '')::NUMERIC),
         p_base_siafi, p_leitura, NOW()
    FROM jsonb_array_elements(p_linhas) x
   GROUP BY 1, 2
  ON CONFLICT (ano, chave_md5) DO UPDATE SET
    chave = EXCLUDED.chave, emenda = EXCLUDED.emenda, rp = EXCLUDED.rp, autor = EXCLUDED.autor,
    tipo_autor = EXCLUDED.tipo_autor, partido = EXCLUDED.partido, uf = EXCLUDED.uf, orgao = EXCLUDED.orgao,
    unidade_orcamentaria = EXCLUDED.unidade_orcamentaria, acao = EXCLUDED.acao, localizador = EXCLUDED.localizador,
    gnd = EXCLUDED.gnd, modalidade = EXCLUDED.modalidade, natureza_despesa = EXCLUDED.natureza_despesa,
    dimensoes = EXCLUDED.dimensoes, dotacao_inicial = EXCLUDED.dotacao_inicial, dotacao_atual = EXCLUDED.dotacao_atual,
    empenhado = EXCLUDED.empenhado, liquidado = EXCLUDED.liquidado, pago = EXCLUDED.pago,
    base_siafi_em = EXCLUDED.base_siafi_em, leitura = EXCLUDED.leitura, lido_em = EXCLUDED.lido_em;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_emendas_siop_painel(UUID, JSONB, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_emendas_siop_painel(UUID, JSONB, DATE) TO service_role;

-- Fim da leitura: remove dos anos lidos as linhas que não vieram nela (emenda cancelada ou remanejada). Recusa se a
-- leitura não gravou nada num desses anos, para um erro do servidor não apagar o ano inteiro. Devolve quantas removeu.
CREATE OR REPLACE FUNCTION public.concluir_leitura_siop_painel(p_leitura UUID, p_anos SMALLINT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ano SMALLINT;
  v_n   INTEGER;
BEGIN
  IF p_leitura IS NULL OR p_anos IS NULL OR cardinality(p_anos) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: faltam a leitura ou os anos lidos.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_ano IN ARRAY p_anos LOOP
    IF NOT EXISTS (SELECT 1 FROM public.siop_painel_emendas WHERE ano = v_ano AND leitura = p_leitura) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a leitura % não gravou nenhuma linha de %; nada foi removido.', p_leitura, v_ano USING ERRCODE = '22023';
    END IF;
  END LOOP;
  DELETE FROM public.siop_painel_emendas WHERE ano = ANY (p_anos) AND leitura <> p_leitura;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.concluir_leitura_siop_painel(UUID, SMALLINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_leitura_siop_painel(UUID, SMALLINT[]) TO service_role;

-- Igual à da migration 156, mais o recurso 'emendas_siop_painel' na região de São Paulo.
CREATE OR REPLACE FUNCTION public.disparar_sincronizacao(p_recurso TEXT, p_uasg TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_segredo TEXT;
  v_cabecalhos JSONB;
  v_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'sincronizacao_url';
  SELECT decrypted_secret INTO v_segredo FROM vault.decrypted_secrets WHERE name = 'sincronizacao_segredo';

  IF v_url IS NULL OR v_segredo IS NULL THEN
    RAISE NOTICE 'Agendamento da sincronização ainda não ativado (faltam os secrets do Vault); nada foi chamado.';
    RETURN NULL;
  END IF;

  v_cabecalhos := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo);
  -- A Câmara só responde a quem chama do Brasil; o painel do SIOP também roda na região de São Paulo.
  IF p_recurso IN ('autores_emendas', 'emendas_siop_painel') THEN
    v_cabecalhos := v_cabecalhos || jsonb_build_object('x-region', 'sa-east-1');
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := v_cabecalhos,
    body := jsonb_strip_nulls(jsonb_build_object('recurso', p_recurso, 'uasg', p_uasg)),
    timeout_milliseconds := 10000
  ) INTO v_id;
  RETURN v_id;
END;
$$;

-- Só o próprio banco (jobs do pg_cron, que rodam como o dono) chama esta função (mesma regra das migrations 77 e 156).
REVOKE ALL ON FUNCTION public.disparar_sincronizacao(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-emendas-siop-painel';
    PERFORM cron.schedule('sincronizar-emendas-siop-painel', '22 13 * * *', $c$SELECT public.disparar_sincronizacao('emendas_siop_painel')$c$);
  END IF;
END;
$$;
