-- ==============================================================================
-- MIGRATION 252: EMENDAS REGISTRADAS SOZINHAS PELO PAINEL DO ORÇAMENTO FEDERAL (SIOP)
-- Versão: 20261103000252_emendas_painel_siop.sql
--
-- Protótipo aprovado em 03/11/2026 (Emendas pelo SIOP): até aqui a CAEP digitava cada emenda no "Registrar emenda do
-- SIOP". O servidor passa a ler, uma vez por dia, o Painel do Orçamento Federal (www1.siop.planejamento.gov.br, aba
-- Emendas Parlamentares, só o órgão 30000 - MJSP) pelo recurso 'emendas_siop_painel' da Edge Function
-- sincronizar-fontes, e registra sozinho as emendas novas de compra direta.
--   1) siop_painel_emendas: a foto do painel a partir de 2026, uma linha por emenda × ação × GND × modalidade.
--   2) emenda_autor_codigos: o código do autor no SIOP (4 primeiros dígitos do nº da emenda) de cada parlamentar e de
--      cada bancada. As bancadas foram criadas no banco só pela UF (migration 155); o painel traz o código delas
--      (ex.: 7106 = Bancada da Bahia). Aprendido das emendas já registradas e do próprio painel.
--   3) emendas_siop.origem: 'CAEP' (registrada à mão ou pela conferência) ou 'PAINEL' (registrada pelo servidor).
--   4) gravar_emendas_siop_painel (só o servidor), numa transação só:
--        - troca a foto dos anos lidos;
--        - aprende os códigos dos autores;
--        - registra cada emenda nova de compra direta (D1: individual ou de bancada, a partir de 2026, ação 21BM e
--          modalidade 90, valor > 0) com nº, ano, parlamentar, valor (soma da compra direta) e GND (D2);
--          o parlamentar vem pelo código; senão a bancada pela UF; senão o nome e a UF, só com resultado único (D3);
--        - na emenda que ainda não tem pedido, o valor e o GND acompanham o painel (D4); com pedido, nada muda.
--   5) v_emendas_painel_sem_parlamentar: emendas de compra direta do painel que não entraram por falta do parlamentar.
--   6) disparar_sincronizacao com x-region: sa-east-1 também para este recurso; agendamento diário às 10h22.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Foto do painel
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siop_painel_emendas (
  ano                  SMALLINT      NOT NULL CHECK (ano BETWEEN 2000 AND 2099),
  -- A emenda e as dimensões da linha, na ordem do painel ("38980002|6 - Emendas Individuais|Adolfo Viana|…").
  chave                TEXT          NOT NULL CHECK (length(chave) BETWEEN 9 AND 4000),
  chave_md5            TEXT          GENERATED ALWAYS AS (md5(chave)) STORED,
  emenda               VARCHAR(8)    NOT NULL CHECK (emenda ~ '^[0-9]{8}$'),
  -- Mesmo formato de emenda_execucao_portal.codigo (ano + 8 dígitos).
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
  dotacao_inicial      NUMERIC(18,2),
  dotacao_atual        NUMERIC(18,2),
  empenhado            NUMERIC(18,2),
  liquidado            NUMERIC(18,2),
  pago                 NUMERIC(18,2),
  -- "Dados referentes à Base SIAFI de …" do painel.
  base_siafi_em        DATE,
  lido_em              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ano, chave_md5)
);
CREATE INDEX IF NOT EXISTS siop_painel_emendas_codigo_idx ON public.siop_painel_emendas (codigo);
COMMENT ON TABLE public.siop_painel_emendas IS
  'Emendas do MJSP no Painel do Orçamento Federal do SIOP, a partir de 2026 (valores em R$). Grava só o servidor (migration 252).';

-- ------------------------------------------------------------------------------
-- 2) Código do autor no SIOP
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_autor_codigos (
  codigo    CHAR(4)      PRIMARY KEY CHECK (codigo ~ '^[0-9]{4}$'),
  autor_id  VARCHAR(20)  NOT NULL REFERENCES public.emenda_autores(id),
  -- EMENDA: aprendido de uma emenda registrada; PAINEL: do painel do SIOP (bancada pela UF ou nome e UF).
  origem    VARCHAR(10)  NOT NULL CHECK (origem IN ('EMENDA', 'PAINEL')),
  criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emenda_autor_codigos_autor_idx ON public.emenda_autor_codigos (autor_id);
COMMENT ON TABLE public.emenda_autor_codigos IS
  'Código do autor no SIOP (4 primeiros dígitos do nº da emenda) → parlamentar ou bancada. Grava só o servidor (migration 252).';

DO $$
DECLARE v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['siop_painel_emendas', 'emenda_autor_codigos'] LOOP
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
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Origem da emenda registrada
-- ------------------------------------------------------------------------------
ALTER TABLE public.emendas_siop ADD COLUMN IF NOT EXISTS origem VARCHAR(10) NOT NULL DEFAULT 'CAEP';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emendas_siop_origem') THEN
    ALTER TABLE public.emendas_siop ADD CONSTRAINT emendas_siop_origem CHECK (origem IN ('CAEP', 'PAINEL'));
  END IF;
END $$;
COMMENT ON COLUMN public.emendas_siop.origem IS
  'CAEP: registrada à mão ou pela conferência; PAINEL: registrada pelo servidor a partir do painel do SIOP (migration 252).';

-- ------------------------------------------------------------------------------
-- Funções de apoio
-- ------------------------------------------------------------------------------
-- Nome sem acento, minúsculo e com um espaço só, para comparar o autor do painel com o cadastro.
CREATE OR REPLACE FUNCTION public.nome_para_comparar(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(btrim(translate(lower(COALESCE(p, '')),
           'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '\s+', ' ', 'g');
$$;
REVOKE ALL ON FUNCTION public.nome_para_comparar(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nome_para_comparar(TEXT) TO authenticated, service_role;

-- Aprende os códigos das emendas registradas e dos pedidos: código usado por um autor só.
CREATE OR REPLACE FUNCTION public.aprender_codigos_dos_autores()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n INTEGER;
BEGIN
  INSERT INTO public.emenda_autor_codigos (codigo, autor_id, origem)
  SELECT codigo, MIN(autor_id), 'EMENDA'
    FROM (SELECT left(numero, 4) AS codigo, autor_id FROM public.emendas_siop
          UNION
          SELECT left(siop_emenda, 4), autor_id FROM public.emenda_pedidos
           WHERE siop_emenda ~ '^[0-9]{8}$' AND autor_id IS NOT NULL AND etapa <> 'CANCELADO') x
   GROUP BY codigo
  HAVING COUNT(DISTINCT autor_id) = 1
  ON CONFLICT (codigo) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.aprender_codigos_dos_autores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprender_codigos_dos_autores() TO service_role;

-- Carga inicial dos códigos pelas 82 emendas registradas até 03/11/2026.
SELECT public.aprender_codigos_dos_autores();

-- ------------------------------------------------------------------------------
-- 5) Emendas de compra direta do painel (por emenda) e as que ficaram sem parlamentar
-- ------------------------------------------------------------------------------
-- D1: individual (RP 6) ou de bancada (RP 7), a partir de 2026, com compra direta (ação 21BM, modalidade 90).
CREATE OR REPLACE VIEW public.v_emendas_do_painel
WITH (security_invoker = true) AS
SELECT p.ano,
       p.emenda AS numero,
       MIN(p.autor) AS autor,
       MIN(p.tipo_autor) AS tipo_autor,
       MIN(p.uf) AS uf,
       SUM(p.dotacao_atual) FILTER (WHERE p.acao LIKE '21BM%' AND p.modalidade LIKE '90%') AS valor,
       CASE
         WHEN bool_and(p.gnd LIKE '4%') FILTER (WHERE p.acao LIKE '21BM%' AND p.modalidade LIKE '90%') THEN 'GND-4'
         WHEN bool_and(p.gnd LIKE '3%') FILTER (WHERE p.acao LIKE '21BM%' AND p.modalidade LIKE '90%') THEN 'GND-3'
       END AS gnd,
       COALESCE(jsonb_agg(jsonb_build_object('acao', p.acao, 'modalidade', p.modalidade,
                                             'autorizado', COALESCE(p.dotacao_atual, 0), 'empenhado', COALESCE(p.empenhado, 0))
                          ORDER BY p.acao, p.modalidade)
                FILTER (WHERE NOT (p.acao LIKE '21BM%' AND p.modalidade LIKE '90%')), '[]'::JSONB) AS fora_compra_direta,
       MAX(p.base_siafi_em) AS base_siafi_em
  FROM public.siop_painel_emendas p
 WHERE p.ano >= 2026 AND p.rp ~ '^[67] '
 GROUP BY p.ano, p.emenda
HAVING bool_or(p.acao LIKE '21BM%' AND p.modalidade LIKE '90%');
COMMENT ON VIEW public.v_emendas_do_painel IS
  'Emendas de compra direta (21BM, modalidade 90) do painel do SIOP, individuais e de bancada, a partir de 2026 (migration 252).';

CREATE OR REPLACE VIEW public.v_emendas_painel_sem_parlamentar
WITH (security_invoker = true) AS
SELECT d.*
  FROM public.v_emendas_do_painel d
 WHERE d.valor > 0
   AND NOT EXISTS (SELECT 1 FROM public.emendas_siop e WHERE e.ano = d.ano AND e.numero = d.numero);
COMMENT ON VIEW public.v_emendas_painel_sem_parlamentar IS
  'Emendas do painel do SIOP que o servidor não registrou por não achar um parlamentar só (migration 252).';

REVOKE ALL ON public.v_emendas_do_painel, public.v_emendas_painel_sem_parlamentar FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emendas_do_painel, public.v_emendas_painel_sem_parlamentar TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4) Gravação da leitura e registro das emendas
-- ------------------------------------------------------------------------------
-- p_linhas: [{ano, emenda, chave, rp, autor, tipo_autor, partido, uf, orgao, unidade_orcamentaria, acao, localizador, gnd,
-- modalidade, natureza_despesa, dotacao_inicial, dotacao_atual, empenhado, liquidado, pago}] de todos os anos de p_anos.
-- O servidor só chama com a leitura inteira e conferida com a linha Total do painel. Tudo numa transação.
CREATE OR REPLACE FUNCTION public.gravar_emendas_siop_painel(p_linhas JSONB, p_base_siafi DATE, p_anos SMALLINT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_quem       CONSTANT TEXT := 'Painel do SIOP';
  v_hoje       DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_gravadas   INTEGER;
  v_removidas  INTEGER;
  v_codigos    INTEGER;
  v_aprendidos INTEGER;
  v_registradas INTEGER;
  v_atualizadas INTEGER;
  v_sem        JSONB;
BEGIN
  IF jsonb_typeof(p_linhas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a leitura do painel deve ser um array com ao menos uma linha.' USING ERRCODE = '22023';
  END IF;
  IF p_anos IS NULL OR cardinality(p_anos) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: faltam os anos lidos.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_linhas) x
     WHERE NOT (COALESCE(x->>'ano', '') ~ '^20[0-9]{2}$' AND COALESCE(x->>'emenda', '') ~ '^[0-9]{8}$'
                AND length(COALESCE(x->>'chave', '')) BETWEEN 9 AND 4000
                AND (x->>'ano')::SMALLINT = ANY (p_anos))
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: há linha do painel sem ano lido, emenda (8 dígitos) ou chave.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_anos) a WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_linhas) x WHERE (x->>'ano')::SMALLINT = a)) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: um dos anos lidos veio sem nenhuma linha; nada foi gravado.' USING ERRCODE = '22023';
  END IF;

  -- Foto dos anos lidos (a mesma chave repetida soma).
  CREATE TEMP TABLE _painel ON COMMIT DROP AS
  SELECT (x->>'ano')::SMALLINT AS ano, x->>'chave' AS chave, MIN(x->>'emenda') AS emenda,
         MIN(NULLIF(btrim(x->>'rp'), '')) AS rp, MIN(NULLIF(btrim(x->>'autor'), '')) AS autor,
         MIN(NULLIF(btrim(x->>'tipo_autor'), '')) AS tipo_autor, MIN(NULLIF(btrim(x->>'partido'), '')) AS partido,
         MIN(NULLIF(btrim(x->>'uf'), '')) AS uf, MIN(NULLIF(btrim(x->>'orgao'), '')) AS orgao,
         MIN(NULLIF(btrim(x->>'unidade_orcamentaria'), '')) AS unidade_orcamentaria, MIN(NULLIF(btrim(x->>'acao'), '')) AS acao,
         MIN(NULLIF(btrim(x->>'localizador'), '')) AS localizador, MIN(NULLIF(btrim(x->>'gnd'), '')) AS gnd,
         MIN(NULLIF(btrim(x->>'modalidade'), '')) AS modalidade, MIN(NULLIF(btrim(x->>'natureza_despesa'), '')) AS natureza_despesa,
         SUM(NULLIF(x->>'dotacao_inicial', '')::NUMERIC) AS dotacao_inicial, SUM(NULLIF(x->>'dotacao_atual', '')::NUMERIC) AS dotacao_atual,
         SUM(NULLIF(x->>'empenhado', '')::NUMERIC) AS empenhado, SUM(NULLIF(x->>'liquidado', '')::NUMERIC) AS liquidado,
         SUM(NULLIF(x->>'pago', '')::NUMERIC) AS pago
    FROM jsonb_array_elements(p_linhas) x
   GROUP BY 1, 2;

  DELETE FROM public.siop_painel_emendas d
   WHERE d.ano = ANY (p_anos)
     AND NOT EXISTS (SELECT 1 FROM _painel n WHERE n.ano = d.ano AND md5(n.chave) = d.chave_md5);
  GET DIAGNOSTICS v_removidas = ROW_COUNT;

  INSERT INTO public.siop_painel_emendas AS d
         (ano, chave, emenda, rp, autor, tipo_autor, partido, uf, orgao, unidade_orcamentaria, acao, localizador, gnd,
          modalidade, natureza_despesa, dotacao_inicial, dotacao_atual, empenhado, liquidado, pago, base_siafi_em, lido_em)
  SELECT ano, chave, emenda, rp, autor, tipo_autor, partido, uf, orgao, unidade_orcamentaria, acao, localizador, gnd,
         modalidade, natureza_despesa, dotacao_inicial, dotacao_atual, empenhado, liquidado, pago, p_base_siafi, NOW()
    FROM _painel
  ON CONFLICT (ano, chave_md5) DO UPDATE SET
    emenda = EXCLUDED.emenda, rp = EXCLUDED.rp, autor = EXCLUDED.autor, tipo_autor = EXCLUDED.tipo_autor,
    partido = EXCLUDED.partido, uf = EXCLUDED.uf, orgao = EXCLUDED.orgao, unidade_orcamentaria = EXCLUDED.unidade_orcamentaria,
    acao = EXCLUDED.acao, localizador = EXCLUDED.localizador, gnd = EXCLUDED.gnd, modalidade = EXCLUDED.modalidade,
    natureza_despesa = EXCLUDED.natureza_despesa, dotacao_inicial = EXCLUDED.dotacao_inicial,
    dotacao_atual = EXCLUDED.dotacao_atual, empenhado = EXCLUDED.empenhado, liquidado = EXCLUDED.liquidado,
    pago = EXCLUDED.pago, base_siafi_em = EXCLUDED.base_siafi_em, lido_em = EXCLUDED.lido_em;
  GET DIAGNOSTICS v_gravadas = ROW_COUNT;

  -- Códigos: das emendas registradas; das bancadas pela UF; dos parlamentares pelo nome e UF (um só no cadastro).
  v_codigos := public.aprender_codigos_dos_autores();
  -- Todas as linhas individuais e de bancada do painel, não só as de compra direta: assim toda bancada ganha o código.
  WITH autores_do_painel AS (
    SELECT DISTINCT left(d.emenda, 4) AS codigo, d.autor, d.tipo_autor, d.uf
      FROM public.siop_painel_emendas d
     WHERE d.ano = ANY (p_anos) AND d.rp ~ '^[67] '
       AND NOT EXISTS (SELECT 1 FROM public.emenda_autor_codigos c WHERE c.codigo = left(d.emenda, 4))
  ), achados AS (
    SELECT p.codigo, MIN(a.id) AS autor_id
      FROM autores_do_painel p
      JOIN public.emenda_autores a
        ON (p.tipo_autor ILIKE 'Bancada%' AND a.tipo = 'BANCADA' AND a.uf = p.uf)
        OR (NOT p.tipo_autor ILIKE 'Bancada%'
            AND a.tipo = CASE WHEN p.tipo_autor ILIKE 'Senador%' THEN 'SENADOR' ELSE 'DEPUTADO' END
            AND (p.uf IS NULL OR a.uf = p.uf)
            AND public.nome_para_comparar(p.autor) IN (public.nome_para_comparar(a.nome), public.nome_para_comparar(a.nome_civil)))
     GROUP BY p.codigo
    HAVING COUNT(DISTINCT a.id) = 1
  )
  INSERT INTO public.emenda_autor_codigos (codigo, autor_id, origem)
  SELECT codigo, autor_id, 'PAINEL' FROM achados
  ON CONFLICT (codigo) DO NOTHING;
  GET DIAGNOSTICS v_aprendidos = ROW_COUNT;
  v_codigos := v_codigos + v_aprendidos;

  -- Emendas novas (D1–D3).
  WITH novas AS (
    INSERT INTO public.emendas_siop (ano, numero, autor_id, valor, gnd, vista_em, fora_compra_direta, siop_lido_em, origem,
                                     criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    SELECT d.ano, d.numero, c.autor_id, d.valor, d.gnd, v_hoje, d.fora_compra_direta, d.base_siafi_em, 'PAINEL',
           NULL, c_quem, NULL, c_quem
      FROM public.v_emendas_do_painel d
      JOIN public.emenda_autor_codigos c ON c.codigo = left(d.numero, 4)
     WHERE d.valor > 0
       AND NOT EXISTS (SELECT 1 FROM public.emendas_siop e WHERE e.ano = d.ano AND e.numero = d.numero)
    RETURNING id, ano, numero
  ), ligados AS (
    -- Como no registro à mão: pedido com o mesmo nº passa a apontar para a emenda.
    UPDATE public.emenda_pedidos p SET emenda_id = n.id
      FROM novas n
     WHERE p.etapa <> 'CANCELADO' AND p.emenda_id IS NULL AND p.siop_emenda = n.numero AND COALESCE(p.siop_emenda_ano, n.ano) = n.ano
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_registradas FROM novas;

  -- D4: emenda sem pedido acompanha o valor e o GND do painel; com pedido, nada muda sozinho.
  UPDATE public.emendas_siop e
     SET valor = d.valor, gnd = COALESCE(d.gnd, e.gnd), fora_compra_direta = d.fora_compra_direta,
         siop_lido_em = d.base_siafi_em, versao = e.versao + 1,
         atualizado_por = NULL, atualizado_por_nome = c_quem, atualizado_em = NOW()
    FROM public.v_emendas_do_painel d
   WHERE d.ano = e.ano AND d.numero = e.numero AND d.valor > 0
     AND (e.valor IS DISTINCT FROM d.valor OR (d.gnd IS NOT NULL AND e.gnd IS DISTINCT FROM d.gnd))
     AND NOT EXISTS (SELECT 1 FROM public.emenda_pedidos p
                      WHERE p.etapa <> 'CANCELADO'
                        AND (p.emenda_id = e.id OR (p.siop_emenda = e.numero AND COALESCE(p.siop_emenda_ano, e.ano) = e.ano)));
  GET DIAGNOSTICS v_atualizadas = ROW_COUNT;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('ano', ano, 'numero', numero, 'autor', autor, 'uf', uf) ORDER BY ano, numero), '[]'::JSONB)
    INTO v_sem FROM public.v_emendas_painel_sem_parlamentar;

  RETURN jsonb_build_object('gravadas', v_gravadas, 'removidas', v_removidas, 'codigos', v_codigos,
                            'registradas', v_registradas, 'atualizadas', v_atualizadas, 'sem_parlamentar', v_sem);
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_emendas_siop_painel(JSONB, DATE, SMALLINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_emendas_siop_painel(JSONB, DATE, SMALLINT[]) TO service_role;

-- ------------------------------------------------------------------------------
-- 6) Agendamento
-- ------------------------------------------------------------------------------
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
