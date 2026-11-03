-- ==============================================================================
-- MIGRATION 252: EMENDAS LIDAS DO PAINEL DO ORÇAMENTO FEDERAL (SIOP)
-- Versão: 20261103000252_emendas_painel_siop.sql
--
-- Até aqui a CAEP copiava do SIOP à mão o valor de cada emenda (emendas_siop, migrations 205 e 243). O Painel do
-- Orçamento Federal (www1.siop.planejamento.gov.br, QlikView, aba Emendas Parlamentares) mostra, por emenda, ação e
-- modalidade: dotação inicial, dotação atual, empenhado, liquidado e pago, com a base SIAFI do dia. O servidor passa a
-- ler o painel uma vez por dia (recurso 'emendas_siop_painel' da Edge Function sincronizar-fontes).
--   1) siop_painel_emendas: a foto do painel, uma linha por (ano, emenda, ação, modalidade); grava só o servidor.
--   2) gravar_emendas_siop_painel: troca a foto dos anos lidos de uma vez (grava as linhas e remove as que saíram do
--      painel). O servidor só chama com a leitura inteira e conferida com a linha Total do painel.
--   3) disparar_sincronizacao manda x-region: sa-east-1 também para este recurso (o SIOP é servidor do governo, como
--      a Câmara da migration 156, que só responde a quem chama do Brasil).
--   4) Agendamento diário às 10h22 de Brasília (o painel atualiza a base de manhã, ~9h30).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.siop_painel_emendas (
  ano             SMALLINT      NOT NULL CHECK (ano BETWEEN 2000 AND 2099),
  emenda          VARCHAR(8)    NOT NULL CHECK (emenda ~ '^[0-9]{8}$'),
  -- "2723 - Policiamento, Fiscalização, …" e "90 - Aplicações Diretas", como no painel.
  acao            VARCHAR(300)  NOT NULL,
  modalidade      VARCHAR(200)  NOT NULL,
  -- Mesmo formato de emenda_execucao_portal.codigo (ano + 8 dígitos), para juntar com o Portal e com os pedidos.
  codigo          VARCHAR(12)   GENERATED ALWAYS AS ((ano::INTEGER)::TEXT || emenda) STORED,
  rp              VARCHAR(100),
  autor           VARCHAR(200),
  tipo_autor      VARCHAR(100),
  orgao           VARCHAR(200),
  dotacao_inicial NUMERIC(18,2),
  dotacao_atual   NUMERIC(18,2),
  empenhado       NUMERIC(18,2),
  liquidado       NUMERIC(18,2),
  pago            NUMERIC(18,2),
  -- "Dados referentes à Base SIAFI de …" do painel.
  base_siafi_em   DATE,
  lido_em         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ano, emenda, acao, modalidade)
);
CREATE INDEX IF NOT EXISTS siop_painel_emendas_codigo_idx ON public.siop_painel_emendas (codigo);
COMMENT ON TABLE public.siop_painel_emendas IS
  'Emendas do MJSP no Painel do Orçamento Federal do SIOP, por ação e modalidade (valores em R$). Grava só o servidor (migration 252).';

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

-- p_linhas: [{ano, emenda, acao, modalidade, rp, autor, tipo_autor, orgao, dotacao_inicial, dotacao_atual, empenhado,
-- liquidado, pago}]; p_base_siafi: dia da base do painel. Devolve {gravadas, removidas}.
CREATE OR REPLACE FUNCTION public.gravar_emendas_siop_painel(p_linhas JSONB, p_base_siafi DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gravadas  INTEGER;
  v_removidas INTEGER;
BEGIN
  IF jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a lista de linhas do painel deve ser um array com ao menos uma linha.' USING ERRCODE = '22023';
  END IF;
  -- Uma linha inválida recusa tudo: a foto do ano é trocada inteira, então ela tem de vir inteira.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_linhas) x
     WHERE NOT (COALESCE(x->>'ano', '') ~ '^20[0-9]{2}$' AND COALESCE(x->>'emenda', '') ~ '^[0-9]{8}$'
                AND btrim(COALESCE(x->>'acao', '')) <> '' AND btrim(COALESCE(x->>'modalidade', '')) <> '')
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: há linha do painel sem ano, emenda (8 dígitos), ação ou modalidade.' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _painel_siop (
    ano SMALLINT, emenda TEXT, acao TEXT, modalidade TEXT, rp TEXT, autor TEXT, tipo_autor TEXT, orgao TEXT,
    dotacao_inicial NUMERIC, dotacao_atual NUMERIC, empenhado NUMERIC, liquidado NUMERIC, pago NUMERIC
  ) ON COMMIT DROP;
  TRUNCATE _painel_siop;
  -- A mesma chave repetida no lote soma (o servidor já junta; aqui é só a garantia para o ON CONFLICT).
  INSERT INTO _painel_siop
  SELECT (x->>'ano')::SMALLINT, x->>'emenda', left(btrim(x->>'acao'), 300), left(btrim(x->>'modalidade'), 200),
         left(NULLIF(btrim(MIN(x->>'rp')), ''), 100), left(NULLIF(btrim(MIN(x->>'autor')), ''), 200),
         left(NULLIF(btrim(MIN(x->>'tipo_autor')), ''), 100), left(NULLIF(btrim(MIN(x->>'orgao')), ''), 200),
         SUM(NULLIF(x->>'dotacao_inicial', '')::NUMERIC), SUM(NULLIF(x->>'dotacao_atual', '')::NUMERIC),
         SUM(NULLIF(x->>'empenhado', '')::NUMERIC), SUM(NULLIF(x->>'liquidado', '')::NUMERIC), SUM(NULLIF(x->>'pago', '')::NUMERIC)
    FROM jsonb_array_elements(p_linhas) x
   GROUP BY 1, 2, 3, 4;

  INSERT INTO public.siop_painel_emendas AS d
         (ano, emenda, acao, modalidade, rp, autor, tipo_autor, orgao,
          dotacao_inicial, dotacao_atual, empenhado, liquidado, pago, base_siafi_em, lido_em)
  SELECT ano, emenda, acao, modalidade, rp, autor, tipo_autor, orgao,
         dotacao_inicial, dotacao_atual, empenhado, liquidado, pago, p_base_siafi, NOW()
    FROM _painel_siop
  ON CONFLICT (ano, emenda, acao, modalidade) DO UPDATE SET
    rp = EXCLUDED.rp, autor = EXCLUDED.autor, tipo_autor = EXCLUDED.tipo_autor, orgao = EXCLUDED.orgao,
    dotacao_inicial = EXCLUDED.dotacao_inicial, dotacao_atual = EXCLUDED.dotacao_atual, empenhado = EXCLUDED.empenhado,
    liquidado = EXCLUDED.liquidado, pago = EXCLUDED.pago, base_siafi_em = EXCLUDED.base_siafi_em, lido_em = EXCLUDED.lido_em;
  GET DIAGNOSTICS v_gravadas = ROW_COUNT;

  -- Linhas dos anos lidos que saíram do painel (emenda cancelada, remanejada para outra ação ou modalidade).
  DELETE FROM public.siop_painel_emendas d
   WHERE d.ano IN (SELECT DISTINCT ano FROM _painel_siop)
     AND NOT EXISTS (SELECT 1 FROM _painel_siop n
                      WHERE n.ano = d.ano AND n.emenda = d.emenda AND n.acao = d.acao AND n.modalidade = d.modalidade);
  GET DIAGNOSTICS v_removidas = ROW_COUNT;

  RETURN jsonb_build_object('gravadas', v_gravadas, 'removidas', v_removidas);
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_emendas_siop_painel(JSONB, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_emendas_siop_painel(JSONB, DATE) TO service_role;

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
