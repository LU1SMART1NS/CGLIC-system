-- ==============================================================================
-- MIGRATION 83: FATURAS DOS CONTRATOS E ORDENS BANCÁRIAS
-- Versão: 20261006000083_faturas_e_ordens_bancarias.sql
--
-- Contexto (auditoria de 06/10/2026, AUDITORIA_VINCULO_EMPENHOS_CONTRATOS.md, Fase 5): o sistema lia o
-- empenho (Contratos.gov.br /empenhos) com os totais liquidado e pago por NE, mas não as faturas nem os
-- pagamentos. Duas fontes abertas fecham a cadeia Empenho → Liquidação → Pagamento:
--   - GET /api/contrato/{id}/faturas (Contratos.gov.br): cada fatura traz a NP (sfadrao_id), a data de
--     liquidação, a situação e as NEs que ela usa (dados_empenho[].id_empenho = empenhos.identificador_fonte);
--   - GET https://sta.api.gov.br/api/ordembancaria/documento/{UG}00001{NP} (Tesouro): as OBs da NP.
--
-- Medido em 06/10/2026: 8.733 faturas em 512 contratos, 1.860 NPs; 94% das NPs da amostra têm OB.
-- Duas regras saem dos dados:
--   - 27% das NPs juntam faturas de mais de um contrato: o valor da OB não é atribuível a um contrato.
--     O "pago" de um contrato é a soma das faturas dele cuja NP tem OB válida (ou que o Contratos.gov.br
--     marca como "Pago"), nunca o valor da OB.
--   - OB cancelada vem com cancelamentoob = '1' e é reemitida com outro número: não conta como pagamento.
--
-- O que entra
-- 1) contrato_faturas, fatura_empenhos e contrato_faturas_sincronizacao (faturas por contrato);
-- 2) ordens_bancarias e np_consultas (OBs por NP e quando cada NP foi consultada);
-- 3) sync_contrato_faturas_atomic e gravar_ordens_bancarias (escrita só por RPC; gestor, coordenador ou
--    servidor), com a mesma proteção da migration 81: lista vazia não remove faturas existentes;
-- 4) v_contrato_faturas (por fatura: OB válida, paga, NP compartilhada, NEs citadas sem vínculo com o
--    contrato) e v_contrato_faturas_resumo (por contrato).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Faturas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_faturas (
  id_fatura         BIGINT       PRIMARY KEY,           -- id da fatura no Contratos.gov.br
  contract_key      VARCHAR(150) NOT NULL,
  contrato_id_gov   TEXT,
  numero            TEXT,
  tipo              TEXT,
  emissao           DATE,
  vencimento        DATE,
  valor             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  glosa             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  valor_liquido     NUMERIC(18, 2) NOT NULL DEFAULT 0,
  data_liquidacao   DATE,
  situacao          TEXT,
  cancelada         BOOLEAN      NOT NULL DEFAULT FALSE,
  np                VARCHAR(20),                        -- nota de pagamento (sfadrao_id), ex.: 2025NP000545
  ug_np             VARCHAR(6),                         -- UG do contratante: a NP só vale com a UG
  referencia        TEXT,                               -- competências, ex.: "05/2024, 06/2024"
  processo          TEXT,
  sincronizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT contrato_faturas_contract_key_formato CHECK (contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$'),
  CONSTRAINT contrato_faturas_ug_np_formato CHECK (ug_np IS NULL OR ug_np ~ '^[0-9]{6}$')
);
CREATE INDEX IF NOT EXISTS contrato_faturas_contract_key_idx ON public.contrato_faturas (contract_key);
CREATE INDEX IF NOT EXISTS contrato_faturas_np_idx ON public.contrato_faturas (ug_np, np);

CREATE TABLE IF NOT EXISTS public.fatura_empenhos (
  id_fatura        BIGINT NOT NULL REFERENCES public.contrato_faturas(id_fatura) ON DELETE CASCADE,
  id_empenho_gov   TEXT   NOT NULL,                     -- = empenhos.identificador_fonte
  numero_empenho   TEXT,
  valor            NUMERIC(18, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id_fatura, id_empenho_gov)
);
CREATE INDEX IF NOT EXISTS fatura_empenhos_id_empenho_gov_idx ON public.fatura_empenhos (id_empenho_gov);
CREATE INDEX IF NOT EXISTS empenhos_identificador_fonte_idx ON public.empenhos (identificador_fonte);

CREATE TABLE IF NOT EXISTS public.contrato_faturas_sincronizacao (
  contract_key   VARCHAR(150) PRIMARY KEY,
  faturas        INTEGER      NOT NULL DEFAULT 0,
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2) Ordens bancárias
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ordens_bancarias (
  ug                   VARCHAR(6)  NOT NULL,
  gestao               VARCHAR(5)  NOT NULL,
  numero               VARCHAR(20) NOT NULL,            -- ex.: 2025OB088173
  np                   VARCHAR(20) NOT NULL,            -- documentoorigem
  emissao              DATE,
  valor                NUMERIC(18, 2) NOT NULL DEFAULT 0,
  cancelada            BOOLEAN     NOT NULL DEFAULT FALSE,
  ob_cancelamento      TEXT,
  tipo_ob              TEXT,
  favorecido_documento TEXT,
  favorecido_nome      TEXT,
  banco                TEXT,
  agencia              TEXT,
  conta                TEXT,
  processo             TEXT,
  observacao           TEXT,
  empenhos             TEXT[]      NOT NULL DEFAULT '{}',
  consultado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ug, gestao, numero),
  CONSTRAINT ordens_bancarias_ug_formato CHECK (ug ~ '^[0-9]{6}$')
);
CREATE INDEX IF NOT EXISTS ordens_bancarias_np_idx ON public.ordens_bancarias (ug, np);

CREATE TABLE IF NOT EXISTS public.np_consultas (
  ug             VARCHAR(6)  NOT NULL,
  np             VARCHAR(20) NOT NULL,
  obs            INTEGER     NOT NULL DEFAULT 0,
  consultado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ug, np)
);

-- Leitura para usuários logados; escrita só pelas RPCs.
DO $$
DECLARE v_tabela TEXT;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['contrato_faturas', 'fatura_empenhos', 'contrato_faturas_sincronizacao', 'ordens_bancarias', 'np_consultas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated Read: ' || v_tabela, v_tabela);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'Authenticated Read: ' || v_tabela, v_tabela);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC, anon, authenticated', v_tabela);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_tabela);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3a) Substituir o conjunto de faturas de um contrato
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_contrato_faturas_atomic(
  p_contract_key VARCHAR,
  p_faturas JSONB,
  p_remover_ausentes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_elem JSONB;
  v_emp JSONB;
  v_id BIGINT;
  v_seen BIGINT[] := ARRAY[]::BIGINT[];
  v_gravadas INTEGER := 0;
  v_removidas INTEGER := 0;
  v_existentes INTEGER;
  v_bloqueada INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza as faturas.' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$') THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave do contrato fora do formato canônico. Valor: "%"', v_key USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_key) THEN
    RAISE EXCEPTION 'CONTRATO_DESCONHECIDO: O contrato "%" não está na carteira de contratos oficiais.', v_key USING ERRCODE = 'P0002';
  END IF;
  IF p_faturas IS NULL OR jsonb_typeof(p_faturas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de faturas deve ser um array.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_faturas) > 2000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 2000 faturas por contrato.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_contrato_faturas:' || v_key));

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_faturas)
  LOOP
    BEGIN
      v_id := (v_elem->>'id_fatura')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
      v_id := NULL;
    END;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Fatura sem id na lista.' USING ERRCODE = '22023';
    END IF;
    IF v_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Fatura repetida na operação: %', v_id USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_id);

    INSERT INTO public.contrato_faturas AS f (
      id_fatura, contract_key, contrato_id_gov, numero, tipo, emissao, vencimento, valor, glosa, valor_liquido,
      data_liquidacao, situacao, cancelada, np, ug_np, referencia, processo, sincronizado_em
    ) VALUES (
      v_id, v_key, v_elem->>'contrato_id_gov', v_elem->>'numero', v_elem->>'tipo',
      public.texto_para_data(v_elem->>'emissao'), public.texto_para_data(v_elem->>'vencimento'),
      COALESCE((v_elem->>'valor')::NUMERIC, 0), COALESCE((v_elem->>'glosa')::NUMERIC, 0), COALESCE((v_elem->>'valor_liquido')::NUMERIC, 0),
      public.texto_para_data(v_elem->>'data_liquidacao'), v_elem->>'situacao', COALESCE((v_elem->>'cancelada')::BOOLEAN, FALSE),
      NULLIF(TRIM(COALESCE(v_elem->>'np', '')), ''), NULLIF(TRIM(COALESCE(v_elem->>'ug_np', '')), ''),
      v_elem->>'referencia', v_elem->>'processo', NOW()
    )
    ON CONFLICT (id_fatura) DO UPDATE SET
      contract_key = EXCLUDED.contract_key, contrato_id_gov = EXCLUDED.contrato_id_gov, numero = EXCLUDED.numero,
      tipo = EXCLUDED.tipo, emissao = EXCLUDED.emissao, vencimento = EXCLUDED.vencimento, valor = EXCLUDED.valor,
      glosa = EXCLUDED.glosa, valor_liquido = EXCLUDED.valor_liquido, data_liquidacao = EXCLUDED.data_liquidacao,
      situacao = EXCLUDED.situacao, cancelada = EXCLUDED.cancelada, np = EXCLUDED.np, ug_np = EXCLUDED.ug_np,
      referencia = EXCLUDED.referencia, processo = EXCLUDED.processo, sincronizado_em = NOW();

    DELETE FROM public.fatura_empenhos WHERE id_fatura = v_id;
    IF jsonb_typeof(v_elem->'empenhos') = 'array' THEN
      FOR v_emp IN SELECT * FROM jsonb_array_elements(v_elem->'empenhos')
      LOOP
        IF NULLIF(TRIM(COALESCE(v_emp->>'id_empenho_gov', '')), '') IS NOT NULL THEN
          INSERT INTO public.fatura_empenhos (id_fatura, id_empenho_gov, numero_empenho, valor)
          VALUES (v_id, TRIM(v_emp->>'id_empenho_gov'), v_emp->>'numero_empenho', COALESCE((v_emp->>'valor')::NUMERIC, 0))
          ON CONFLICT (id_fatura, id_empenho_gov) DO UPDATE
            SET valor = public.fatura_empenhos.valor + EXCLUDED.valor;
        END IF;
      END LOOP;
    END IF;
    v_gravadas := v_gravadas + 1;
  END LOOP;

  IF COALESCE(p_remover_ausentes, TRUE) THEN
    SELECT COUNT(*) INTO v_existentes
      FROM public.contrato_faturas WHERE contract_key = v_key AND NOT (id_fatura = ANY (v_seen));
    IF cardinality(v_seen) = 0 AND v_existentes > 0 THEN
      v_bloqueada := v_existentes;   -- lista vazia não apaga faturas conhecidas (mesma regra da migration 81)
    ELSE
      DELETE FROM public.contrato_faturas WHERE contract_key = v_key AND NOT (id_fatura = ANY (v_seen));
      GET DIAGNOSTICS v_removidas = ROW_COUNT;
    END IF;
  END IF;

  -- Lista vazia bloqueada não conta como sincronização: o contrato volta para a frente da fila.
  IF v_bloqueada = 0 THEN
    INSERT INTO public.contrato_faturas_sincronizacao AS s (contract_key, faturas, sincronizado_em)
    VALUES (v_key, cardinality(v_seen), NOW())
    ON CONFLICT (contract_key) DO UPDATE SET faturas = EXCLUDED.faturas, sincronizado_em = NOW();
  END IF;

  RETURN jsonb_build_object('success', true, 'contract_key', v_key, 'gravadas', v_gravadas,
                            'removidas', v_removidas, 'remocao_bloqueada', v_bloqueada);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_contrato_faturas_atomic(VARCHAR, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_contrato_faturas_atomic(VARCHAR, JSONB, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3b) Gravar as OBs de uma NP (e registrar a consulta, mesmo sem OB)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_ordens_bancarias(
  p_ug VARCHAR,
  p_np VARCHAR,
  p_ordens JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ug VARCHAR(6) := TRIM(COALESCE(p_ug, ''));
  v_np VARCHAR(20) := UPPER(TRIM(COALESCE(p_np, '')));
  v_ob JSONB;
  v_total INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador grava ordens bancárias.' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_ug ~ '^[0-9]{6}$') OR NOT (v_np ~ '^[0-9]{4}NP[0-9]{6}$') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UG ou NP fora do formato (UG %, NP %).', v_ug, v_np USING ERRCODE = '22023';
  END IF;
  IF p_ordens IS NULL OR jsonb_typeof(p_ordens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de ordens bancárias deve ser um array.' USING ERRCODE = '22023';
  END IF;

  FOR v_ob IN SELECT * FROM jsonb_array_elements(p_ordens)
  LOOP
    IF COALESCE(v_ob->>'numero', '') !~ '^[0-9]{4}OB[0-9]{6}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Número de OB fora do formato: "%"', v_ob->>'numero' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.ordens_bancarias AS o (
      ug, gestao, numero, np, emissao, valor, cancelada, ob_cancelamento, tipo_ob, favorecido_documento,
      favorecido_nome, banco, agencia, conta, processo, observacao, empenhos, consultado_em
    ) VALUES (
      v_ug, COALESCE(NULLIF(v_ob->>'gestao', ''), '00001'), v_ob->>'numero', v_np,
      public.texto_para_data(v_ob->>'emissao'), COALESCE((v_ob->>'valor')::NUMERIC, 0),
      COALESCE((v_ob->>'cancelada')::BOOLEAN, FALSE), v_ob->>'ob_cancelamento', v_ob->>'tipo_ob',
      v_ob->>'favorecido_documento', v_ob->>'favorecido_nome', v_ob->>'banco', v_ob->>'agencia', v_ob->>'conta',
      v_ob->>'processo', v_ob->>'observacao',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_ob->'empenhos')), '{}'), NOW()
    )
    ON CONFLICT (ug, gestao, numero) DO UPDATE SET
      np = EXCLUDED.np, emissao = EXCLUDED.emissao, valor = EXCLUDED.valor, cancelada = EXCLUDED.cancelada,
      ob_cancelamento = EXCLUDED.ob_cancelamento, tipo_ob = EXCLUDED.tipo_ob,
      favorecido_documento = EXCLUDED.favorecido_documento, favorecido_nome = EXCLUDED.favorecido_nome,
      banco = EXCLUDED.banco, agencia = EXCLUDED.agencia, conta = EXCLUDED.conta, processo = EXCLUDED.processo,
      observacao = EXCLUDED.observacao, empenhos = EXCLUDED.empenhos, consultado_em = NOW();
    v_total := v_total + 1;
  END LOOP;

  INSERT INTO public.np_consultas AS c (ug, np, obs, consultado_em)
  VALUES (v_ug, v_np, v_total, NOW())
  ON CONFLICT (ug, np) DO UPDATE SET obs = EXCLUDED.obs, consultado_em = NOW();

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_ordens_bancarias(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_ordens_bancarias(VARCHAR, VARCHAR, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4) Views
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_contrato_faturas
WITH (security_invoker = true)
AS
WITH ob_valida AS (
  SELECT ug, np,
         string_agg(numero, ', ' ORDER BY emissao, numero) AS obs,
         MAX(emissao) AS ob_emissao,
         SUM(valor) AS ob_valor
    FROM public.ordens_bancarias
   WHERE NOT cancelada
   GROUP BY ug, np
),
np_contratos AS (
  SELECT ug_np, np, COUNT(DISTINCT contract_key) AS contratos
    FROM public.contrato_faturas
   WHERE np IS NOT NULL
   GROUP BY ug_np, np
),
nes AS (
  SELECT fe.id_fatura,
         string_agg(COALESCE(fe.numero_empenho, fe.id_empenho_gov), ', ' ORDER BY fe.numero_empenho) AS empenhos,
         COUNT(*) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
               FROM public.empenhos e
               JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
              WHERE e.identificador_fonte = fe.id_empenho_gov
                AND ce.contract_key = f.contract_key
           )
         ) AS empenhos_sem_vinculo,
         string_agg(fe.numero_empenho, ', ' ORDER BY fe.numero_empenho) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
               FROM public.empenhos e
               JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
              WHERE e.identificador_fonte = fe.id_empenho_gov
                AND ce.contract_key = f.contract_key
           )
         ) AS empenhos_sem_vinculo_numeros
    FROM public.fatura_empenhos fe
    JOIN public.contrato_faturas f ON f.id_fatura = fe.id_fatura
   GROUP BY fe.id_fatura
)
SELECT
  f.id_fatura,
  f.contract_key,
  f.numero,
  f.tipo,
  f.emissao,
  f.vencimento,
  f.valor,
  f.glosa,
  f.valor_liquido,
  f.data_liquidacao,
  f.situacao,
  f.cancelada,
  f.np,
  f.ug_np,
  f.referencia,
  ob.obs AS ordens_bancarias,
  ob.ob_emissao,
  ob.ob_valor,
  (NOT f.cancelada AND (ob.obs IS NOT NULL OR f.situacao = 'Pago')) AS paga,
  COALESCE(npc.contratos, 0) AS np_contratos,
  n.empenhos,
  COALESCE(n.empenhos_sem_vinculo, 0) AS empenhos_sem_vinculo,
  n.empenhos_sem_vinculo_numeros,
  f.sincronizado_em
FROM public.contrato_faturas f
LEFT JOIN ob_valida ob ON ob.ug = f.ug_np AND ob.np = f.np
LEFT JOIN np_contratos npc ON npc.ug_np = f.ug_np AND npc.np = f.np
LEFT JOIN nes n ON n.id_fatura = f.id_fatura;

COMMENT ON VIEW public.v_contrato_faturas IS
  'Faturas dos contratos com OB válida da NP, situação de pagamento, NP compartilhada entre contratos e NEs citadas sem vínculo com o contrato.';

CREATE OR REPLACE VIEW public.v_contrato_faturas_resumo
WITH (security_invoker = true)
AS
SELECT
  contract_key,
  COUNT(*) FILTER (WHERE NOT cancelada) AS faturas,
  COALESCE(SUM(valor) FILTER (WHERE NOT cancelada), 0) AS valor_faturado,
  COALESCE(SUM(valor) FILTER (WHERE NOT cancelada AND data_liquidacao IS NOT NULL), 0) AS valor_liquidado,
  COALESCE(SUM(valor) FILTER (WHERE paga), 0) AS valor_pago,
  COUNT(*) FILTER (WHERE NOT cancelada AND data_liquidacao IS NOT NULL AND NOT paga) AS liquidadas_sem_pagamento,
  COUNT(*) FILTER (WHERE empenhos_sem_vinculo > 0) AS faturas_com_ne_sem_vinculo,
  MAX(data_liquidacao) AS ultima_liquidacao,
  MAX(ob_emissao) AS ultimo_pagamento
FROM public.v_contrato_faturas
GROUP BY contract_key;

COMMENT ON VIEW public.v_contrato_faturas_resumo IS
  'Resumo por contrato: faturado, liquidado e pago (soma das faturas com OB válida, nunca o valor da OB, que pode cobrir vários contratos).';

GRANT SELECT ON public.v_contrato_faturas, public.v_contrato_faturas_resumo TO authenticated;

-- ------------------------------------------------------------------------------
-- 5) Agendamento (pg_cron): faturas aos minutos 20/22 e ordens bancárias aos 55/57 de cada hora.
--    Como os demais recursos, a função só age quando a última execução bem-sucedida passou da validade
--    ou quando a anterior ficou PARCIAL.
-- ------------------------------------------------------------------------------
SELECT cron.schedule('sincronizar-faturas-200330',          '20 * * * *', $$SELECT public.disparar_sincronizacao('faturas', '200330')$$);
SELECT cron.schedule('sincronizar-faturas-200331',          '22 * * * *', $$SELECT public.disparar_sincronizacao('faturas', '200331')$$);
SELECT cron.schedule('sincronizar-ordens-bancarias-200330', '55 * * * *', $$SELECT public.disparar_sincronizacao('ordens_bancarias', '200330')$$);
SELECT cron.schedule('sincronizar-ordens-bancarias-200331', '57 * * * *', $$SELECT public.disparar_sincronizacao('ordens_bancarias', '200331')$$);
