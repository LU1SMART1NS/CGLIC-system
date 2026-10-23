-- ==============================================================================
-- Reajuste dos preços registrados nas atas (projeção por item)
--
-- Base: Orientação Normativa AGU nº 100/2025 (reajuste de ofício na ata, com
-- cláusula no edital, por apostilamento) e a prática da CGLIC, conferida nos
-- apostilamentos e termos aditivos publicados no PNCP (estudo de 23/10/2026,
-- docs/estudos/projecao-reajuste-atas.md).
--
-- Regras aprovadas pelo usuário (23/10/2026):
--   1. Data-base: data do Termo de Conformidade da pesquisa de preços.
--   2. Percentual: variação do índice do mês do termo até o mês anterior ao
--      aniversário (12 meses), mês a mês.
--   3. Momento: vale na assinatura da ata, se o aniversário já passou; senão,
--      na prorrogação, para o novo ciclo de vigência.
--   4. Reajustes seguintes: um ano a partir dos efeitos do reajuste anterior.
--   5. Vigência máxima considerada: 2 anos (1 + 1 de prorrogação).
--
-- De onde vem cada dado:
--   - índices mensais: servidor (Banco Central: IPCA oficial e Focus projetado);
--   - índice, cláusula e data do orçamento do edital: servidor (sugestão);
--   - reajustes publicados (percentual, período, efeitos): servidor, lidos nos
--     PDFs da ata no PNCP; o gestor informa o percentual quando o PDF não traz;
--   - preço homologado do item: servidor (resultado do item no PNCP);
--   - Termo de Conformidade (data e SEI): o gestor da ata ou o coordenador
--     informa. O termo fica no SEI, que não é público.
--
-- Leitura: reajuste_ciclos_ata(ata), reajuste_itens_ata(ata) e
-- v_ata_reajuste_resumo (uma linha por ata, para a carteira e o Início).
-- O impacto em R$ fica com a tela, que já tem o saldo do item.
--
-- Nada que já existe muda de comportamento. Toda tabela nova tem a política
-- "Somente usuario ativo" (124) e auditoria (trg_audit_log_capture).
-- ==============================================================================

-- 1. Tabelas --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.indices_precos_mensais (
  indice     VARCHAR(10)  NOT NULL CHECK (indice IN ('IPCA', 'ICTI', 'INPC', 'IST', 'IGPM', 'INCC')),
  mes        DATE         NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
  tipo       VARCHAR(10)  NOT NULL CHECK (tipo IN ('OFICIAL', 'PROJETADO')),
  variacao   NUMERIC(9, 4) NOT NULL CHECK (variacao > -50 AND variacao < 50),
  fonte      VARCHAR(40)  NOT NULL,
  referencia DATE,
  lido_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (indice, mes, tipo)
);
COMMENT ON TABLE public.indices_precos_mensais IS 'Variação mensal (%) dos índices de reajuste. OFICIAL = publicado (ex.: IPCA, série 433 do SGS); PROJETADO = mediana do Focus na data de referência.';

CREATE TABLE IF NOT EXISTS public.ata_reajuste_parametros (
  ata_id                  UUID PRIMARY KEY REFERENCES public.atas_registro_preco(id) ON DELETE CASCADE,
  indice                  VARCHAR(10) CHECK (indice IN ('IPCA', 'ICTI', 'INPC', 'IST', 'IGPM', 'INCC')),
  clausula                VARCHAR(12) NOT NULL DEFAULT 'A_CONFERIR' CHECK (clausula IN ('COM_REAJUSTE', 'SEM_REAJUSTE', 'A_CONFERIR')),
  data_orcamento_edital   DATE,
  edital_lido_em          TIMESTAMPTZ,
  termo_mes_apostilamento DATE CHECK (termo_mes_apostilamento IS NULL OR EXTRACT(DAY FROM termo_mes_apostilamento) = 1),
  termo_sei_apostilamento VARCHAR(10) CHECK (termo_sei_apostilamento ~ '^\d{7,10}$'),
  termo_data              DATE,
  termo_sei               VARCHAR(10) CHECK (termo_sei ~ '^\d{7,10}$'),
  termo_informado_por     UUID,
  termo_informado_em      TIMESTAMPTZ,
  versao                  INTEGER NOT NULL DEFAULT 1,
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ata_reajuste_termo_completo CHECK ((termo_data IS NULL) = (termo_sei IS NULL))
);
COMMENT ON TABLE public.ata_reajuste_parametros IS 'Base do reajuste da ata: índice e cláusula do edital, data do orçamento do edital (sugestão), mês do termo pelo apostilamento e Termo de Conformidade informado pelo gestor.';
COMMENT ON COLUMN public.ata_reajuste_parametros.termo_data IS 'Data do Termo de Conformidade da pesquisa de preços (data-base do reajuste), informada pelo gestor da ata ou coordenador.';
COMMENT ON COLUMN public.ata_reajuste_parametros.termo_mes_apostilamento IS 'Mês do termo segundo o período do primeiro reajuste publicado no PNCP (o período começa no mês do termo).';

CREATE TABLE IF NOT EXISTS public.ata_reajustes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id                    UUID NOT NULL REFERENCES public.atas_registro_preco(id) ON DELETE CASCADE,
  origem                    VARCHAR(10) NOT NULL CHECK (origem IN ('PNCP', 'INFORMADO')),
  efeito_inicio             DATE NOT NULL,
  percentual                NUMERIC(9, 5) CHECK (percentual IS NULL OR (percentual > -50 AND percentual < 100)),
  periodo_inicio            DATE CHECK (periodo_inicio IS NULL OR EXTRACT(DAY FROM periodo_inicio) = 1),
  periodo_fim               DATE CHECK (periodo_fim IS NULL OR EXTRACT(DAY FROM periodo_fim) = 1),
  indice                    VARCHAR(10),
  documento_pncp_sequencial INTEGER,
  documento_titulo          TEXT,
  documento_publicado_em    DATE,
  sei_citado                VARCHAR(10) CHECK (sei_citado ~ '^\d{7,10}$'),
  informado_por             UUID,
  informado_em              TIMESTAMPTZ,
  sei_apostilamento         VARCHAR(10) CHECK (sei_apostilamento ~ '^\d{7,10}$'),
  lido_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ata_reajustes_periodo CHECK (periodo_fim IS NULL OR periodo_inicio IS NULL OR periodo_fim >= periodo_inicio),
  CONSTRAINT ata_reajustes_pncp_tem_documento CHECK (origem <> 'PNCP' OR documento_pncp_sequencial IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ata_reajustes_documento ON public.ata_reajustes (ata_id, documento_pncp_sequencial) WHERE documento_pncp_sequencial IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ata_reajustes_ata ON public.ata_reajustes (ata_id, efeito_inicio);
COMMENT ON TABLE public.ata_reajustes IS 'Reajustes publicados (PDF da ata no PNCP) ou informados pelo gestor. Percentual NULL = apostilamento publicado sem percentual legível.';
COMMENT ON COLUMN public.ata_reajustes.informado_por IS 'Quem informou ou corrigiu o percentual. Com valor, a leitura do PNCP não sobrescreve percentual, período e efeitos.';

CREATE TABLE IF NOT EXISTS public.itens_ata_preco_homologado (
  ata_id      UUID NOT NULL REFERENCES public.atas_registro_preco(id) ON DELETE CASCADE,
  numero_item VARCHAR(10) NOT NULL,
  valor       NUMERIC(18, 4) NOT NULL CHECK (valor >= 0),
  lido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ata_id, numero_item)
);
COMMENT ON TABLE public.itens_ata_preco_homologado IS 'Preço unitário homologado na licitação (resultado do item no PNCP). O valor_unitario de itens_ata é o preço atual, já reajustado quando a fonte atualiza.';

-- 2. Segurança das tabelas ------------------------------------------------------
DO $$
DECLARE v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['indices_precos_mensais', 'ata_reajuste_parametros', 'ata_reajustes', 'itens_ata_preco_homologado'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated Read: ' || v_t, v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'Authenticated Read: ' || v_t, v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Somente usuario ativo', v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
                   'USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))', 'Somente usuario ativo', v_t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_t);
  END LOOP;
END $$;

-- 3. Variação de 12 meses -------------------------------------------------------
-- Produto mês a mês a partir do mês de p_inicio. Usa o OFICIAL e, onde ainda não
-- saiu, o PROJETADO. Sem algum dos 12 meses, percentual NULL.
CREATE OR REPLACE FUNCTION public.reajuste_variacao_12_meses(p_indice TEXT, p_inicio DATE)
RETURNS TABLE (percentual NUMERIC, meses_estimados INTEGER, primeiro_mes DATE, ultimo_mes DATE)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH meses AS (
    SELECT (date_trunc('month', p_inicio) + make_interval(months => g))::DATE AS mes
      FROM generate_series(0, 11) g
  ), valores AS (
    SELECT m.mes,
           COALESCE(o.variacao, p.variacao) AS variacao,
           (o.variacao IS NULL AND p.variacao IS NOT NULL) AS estimado
      FROM meses m
      LEFT JOIN public.indices_precos_mensais o ON o.indice = p_indice AND o.mes = m.mes AND o.tipo = 'OFICIAL'
      LEFT JOIN public.indices_precos_mensais p ON p.indice = p_indice AND p.mes = m.mes AND p.tipo = 'PROJETADO'
  )
  SELECT CASE WHEN count(variacao) = 12
              THEN round(((exp(sum(ln(1 + variacao / 100))) - 1) * 100)::NUMERIC, 5)
         END,
         count(*) FILTER (WHERE estimado)::INTEGER,
         min(mes),
         max(mes)
    FROM valores;
$$;

-- 4. Ciclos de reajuste da ata --------------------------------------------------
-- situacao: APLICADO | PUBLICADO_SEM_PERCENTUAL | DEVIDO | PREVISTO | SE_PRORROGAR
CREATE OR REPLACE FUNCTION public.reajuste_ciclos_ata(p_ata_id UUID, p_hoje DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  ciclo                INTEGER,
  data_base            DATE,
  aniversario          DATE,
  efeito_inicio        DATE,
  situacao             TEXT,
  percentual           NUMERIC,
  percentual_calculado NUMERIC,
  meses_estimados      INTEGER,
  periodo_inicio       DATE,
  periodo_fim          DATE,
  reajuste_id          UUID
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata      RECORD;
  v_par      public.ata_reajuste_parametros%ROWTYPE;
  v_base     DATE;
  v_limite   DATE;
  v_aniv     DATE;
  v_efeito   DATE;
  v_k        INTEGER;
  v_n        INTEGER := 0;
  v_calc     RECORD;
  v_aplic    public.ata_reajustes[];
  v_ap       public.ata_reajustes;
  v_i        INTEGER := 1;
BEGIN
  SELECT a.id, a.data_vigencia_inicial AS ini, a.data_vigencia_final AS fim
    INTO v_ata FROM public.atas_registro_preco a WHERE a.id = p_ata_id;
  IF NOT FOUND OR v_ata.ini IS NULL OR v_ata.fim IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v_par FROM public.ata_reajuste_parametros WHERE ata_id = p_ata_id;
  IF NOT FOUND OR v_par.clausula = 'SEM_REAJUSTE' THEN
    RETURN;
  END IF;

  v_base := COALESCE(v_par.termo_data, v_par.termo_mes_apostilamento, v_par.data_orcamento_edital);
  IF v_base IS NULL THEN
    RETURN;
  END IF;
  v_limite := (v_ata.ini + INTERVAL '2 years')::DATE;
  SELECT COALESCE(array_agg(r ORDER BY r.efeito_inicio, r.id), '{}') INTO v_aplic
    FROM public.ata_reajustes r WHERE r.ata_id = p_ata_id;

  LOOP
    v_n := v_n + 1;
    EXIT WHEN v_n > 6;
    v_aniv := (v_base + INTERVAL '1 year')::DATE;
    EXIT WHEN v_aniv >= v_limite AND v_i > COALESCE(array_length(v_aplic, 1), 0);
    -- Na assinatura, se o aniversário já passou; senão, na prorrogação.
    v_k := 0;
    WHILE (v_ata.ini + make_interval(years => v_k))::DATE < v_aniv LOOP
      v_k := v_k + 1;
    END LOOP;
    v_efeito := (v_ata.ini + make_interval(years => v_k))::DATE;

    SELECT * INTO v_calc FROM public.reajuste_variacao_12_meses(COALESCE(v_par.indice, 'IPCA'), v_base);

    IF v_i <= COALESCE(array_length(v_aplic, 1), 0) THEN
      v_ap := v_aplic[v_i];
      v_i := v_i + 1;
      ciclo := v_n; data_base := v_base; aniversario := v_aniv; efeito_inicio := v_ap.efeito_inicio;
      situacao := CASE WHEN v_ap.percentual IS NULL THEN 'PUBLICADO_SEM_PERCENTUAL' ELSE 'APLICADO' END;
      percentual := v_ap.percentual; percentual_calculado := v_calc.percentual; meses_estimados := v_calc.meses_estimados;
      periodo_inicio := COALESCE(v_ap.periodo_inicio, v_calc.primeiro_mes); periodo_fim := COALESCE(v_ap.periodo_fim, v_calc.ultimo_mes);
      reajuste_id := v_ap.id;
      RETURN NEXT;
      v_base := v_ap.efeito_inicio;
      CONTINUE;
    END IF;

    EXIT WHEN v_efeito >= v_limite;
    ciclo := v_n; data_base := v_base; aniversario := v_aniv; efeito_inicio := v_efeito;
    situacao := CASE WHEN v_efeito >= v_ata.fim THEN 'SE_PRORROGAR'
                     WHEN v_efeito <= p_hoje THEN 'DEVIDO'
                     ELSE 'PREVISTO' END;
    percentual := v_calc.percentual; percentual_calculado := v_calc.percentual; meses_estimados := v_calc.meses_estimados;
    periodo_inicio := v_calc.primeiro_mes; periodo_fim := v_calc.ultimo_mes; reajuste_id := NULL;
    RETURN NEXT;
    v_base := v_efeito;
  END LOOP;
END;
$$;

-- 5. Projeção por item ----------------------------------------------------------
-- situacao_item: SEM_REAJUSTE | SEM_BASE | PERCENTUAL_A_INFORMAR | INDICE_INDISPONIVEL |
--                PRECO_DESATUALIZADO | DEVIDO |
--                PREVISTO | SE_PRORROGAR | EM_DIA
CREATE OR REPLACE FUNCTION public.reajuste_itens_ata(p_ata_id UUID, p_hoje DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  ata_id               UUID,
  numero_item          VARCHAR,
  preco_homologado     NUMERIC,
  homologado_lido      BOOLEAN,
  preco_atual          NUMERIC,
  percentual_no_preco  NUMERIC,
  preco_devido         NUMERIC,
  preco_aplicado       NUMERIC,
  situacao_item        TEXT,
  proximo_efeito       DATE,
  proximo_situacao     TEXT,
  proximo_percentual   NUMERIC,
  proximo_meses_estimados INTEGER,
  preco_projetado      NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH c AS (
    SELECT * FROM public.reajuste_ciclos_ata(p_ata_id, p_hoje)
  ), vencidos AS (
    -- Ciclos com efeitos até hoje. Sem percentual publicado, usa a conta do sistema.
    SELECT COALESCE(exp(sum(ln(1 + COALESCE(percentual, percentual_calculado, 0) / 100))), 1) AS fator,
           COALESCE(exp(sum(ln(1 + percentual / 100)) FILTER (WHERE situacao = 'APLICADO')), 1) AS fator_aplicado,
           bool_or(situacao = 'PUBLICADO_SEM_PERCENTUAL') AS sem_percentual,
           bool_or(situacao = 'DEVIDO' AND percentual IS NULL) AS sem_indice,
           count(*) AS n
      FROM c WHERE efeito_inicio <= p_hoje
  ), prox AS (
    SELECT * FROM c WHERE efeito_inicio > p_hoje ORDER BY efeito_inicio LIMIT 1
  ), itens AS (
    SELECT i.ata_id, i.numero_item, i.valor_unitario AS atual,
           h.valor AS homologado
      FROM public.itens_ata i
      LEFT JOIN public.itens_ata_preco_homologado h ON h.ata_id = i.ata_id AND h.numero_item = i.numero_item
     WHERE i.ata_id = p_ata_id
  )
  SELECT it.ata_id,
         it.numero_item,
         COALESCE(it.homologado, it.atual),
         it.homologado IS NOT NULL,
         it.atual,
         CASE WHEN COALESCE(it.homologado, 0) > 0 THEN round((it.atual / it.homologado - 1) * 100, 5) END,
         round(COALESCE(it.homologado, it.atual) * v.fator, 4),
         round(COALESCE(it.homologado, it.atual) * v.fator_aplicado, 4),
         CASE
           WHEN EXISTS (SELECT 1 FROM public.ata_reajuste_parametros p
                         WHERE p.ata_id = p_ata_id AND p.clausula = 'SEM_REAJUSTE') THEN 'SEM_REAJUSTE'
           WHEN NOT EXISTS (SELECT 1 FROM c) AND NOT EXISTS (
                  SELECT 1 FROM public.ata_reajuste_parametros p
                   WHERE p.ata_id = p_ata_id
                     AND COALESCE(p.termo_data, p.termo_mes_apostilamento, p.data_orcamento_edital) IS NOT NULL) THEN 'SEM_BASE'
           WHEN v.sem_percentual AND COALESCE(it.homologado, it.atual) * v.fator > it.atual * 1.005 THEN 'PERCENTUAL_A_INFORMAR'
           WHEN v.sem_indice THEN 'INDICE_INDISPONIVEL'
           WHEN COALESCE(it.homologado, it.atual) * v.fator_aplicado > it.atual * 1.005 THEN 'PRECO_DESATUALIZADO'
           WHEN COALESCE(it.homologado, it.atual) * v.fator > it.atual * 1.005 THEN 'DEVIDO'
           WHEN p.efeito_inicio IS NOT NULL AND p.situacao = 'SE_PRORROGAR' THEN 'SE_PRORROGAR'
           WHEN p.efeito_inicio IS NOT NULL THEN 'PREVISTO'
           ELSE 'EM_DIA'
         END,
         p.efeito_inicio,
         p.situacao,
         p.percentual,
         p.meses_estimados,
         CASE WHEN p.percentual IS NOT NULL
              THEN round(GREATEST(COALESCE(it.homologado, it.atual) * v.fator, it.atual) * (1 + p.percentual / 100), 4) END
    FROM itens it
    CROSS JOIN vencidos v
    LEFT JOIN prox p ON TRUE
   ORDER BY it.numero_item;
$$;

-- 6. Resumo por ata (carteira, cartão da Ata 360 e Início) ----------------------
CREATE OR REPLACE VIEW public.v_ata_reajuste_resumo
WITH (security_invoker = true) AS
SELECT a.id AS ata_id,
       a.numero_ata,
       a.codigo_uasg,
       public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg) AS ata_key,
       p.indice,
       p.clausula,
       CASE WHEN p.termo_data IS NOT NULL THEN 'INFORMADO'
            WHEN p.termo_mes_apostilamento IS NOT NULL THEN 'APOSTILAMENTO'
            WHEN p.data_orcamento_edital IS NOT NULL THEN 'EDITAL'
       END AS data_base_origem,
       COALESCE(p.termo_data, p.termo_mes_apostilamento, p.data_orcamento_edital) AS data_base,
       p.versao,
       s.itens,
       s.percentual_a_informar,
       s.indice_indisponivel,
       s.preco_desatualizado,
       s.devido,
       s.previsto,
       s.se_prorrogar,
       s.em_dia,
       s.proximo_efeito,
       s.proximo_situacao,
       s.proximo_percentual,
       CASE WHEN s.percentual_a_informar > 0 THEN 'PERCENTUAL_A_INFORMAR'
            WHEN s.indice_indisponivel > 0 THEN 'INDICE_INDISPONIVEL'
            WHEN s.devido > 0 THEN 'DEVIDO'
            WHEN s.preco_desatualizado > 0 THEN 'PRECO_DESATUALIZADO'
            WHEN p.termo_data IS NULL AND p.termo_mes_apostilamento IS NULL AND p.clausula <> 'SEM_REAJUSTE' THEN 'TERMO_A_INFORMAR'
            WHEN s.previsto > 0 THEN 'PREVISTO'
            WHEN s.se_prorrogar > 0 THEN 'SE_PRORROGAR'
            WHEN p.clausula = 'SEM_REAJUSTE' THEN 'SEM_REAJUSTE'
            ELSE 'EM_DIA'
       END AS situacao
  FROM public.atas_registro_preco a
  JOIN public.ata_reajuste_parametros p ON p.ata_id = a.id
  CROSS JOIN LATERAL (
    SELECT count(*)::INTEGER AS itens,
           count(*) FILTER (WHERE r.situacao_item = 'PERCENTUAL_A_INFORMAR')::INTEGER AS percentual_a_informar,
           count(*) FILTER (WHERE r.situacao_item = 'INDICE_INDISPONIVEL')::INTEGER AS indice_indisponivel,
           count(*) FILTER (WHERE r.situacao_item = 'PRECO_DESATUALIZADO')::INTEGER AS preco_desatualizado,
           count(*) FILTER (WHERE r.situacao_item = 'DEVIDO')::INTEGER AS devido,
           count(*) FILTER (WHERE r.situacao_item = 'PREVISTO')::INTEGER AS previsto,
           count(*) FILTER (WHERE r.situacao_item = 'SE_PRORROGAR')::INTEGER AS se_prorrogar,
           count(*) FILTER (WHERE r.situacao_item = 'EM_DIA')::INTEGER AS em_dia,
           min(r.proximo_efeito) AS proximo_efeito,
           (array_agg(r.proximo_situacao ORDER BY r.proximo_efeito) FILTER (WHERE r.proximo_efeito IS NOT NULL))[1] AS proximo_situacao,
           (array_agg(r.proximo_percentual ORDER BY r.proximo_efeito) FILTER (WHERE r.proximo_efeito IS NOT NULL))[1] AS proximo_percentual
      FROM public.reajuste_itens_ata(a.id) r
  ) s
 WHERE a.data_vigencia_final >= CURRENT_DATE;
COMMENT ON VIEW public.v_ata_reajuste_resumo IS 'Situação do reajuste por ata vigente com parâmetros. Contagens por situação dos itens e próximo marco.';

-- 7. Gestor informa o Termo de Conformidade -------------------------------------
CREATE OR REPLACE FUNCTION public.informar_termo_conformidade(
  p_ata_id UUID,
  p_data DATE,
  p_sei TEXT,
  p_versao_vista INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata    public.atas_registro_preco%ROWTYPE;
  v_sei    TEXT := btrim(COALESCE(p_sei, ''));
  v_versao INTEGER;
  v_rec    public.ata_reajuste_parametros%ROWTYPE;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa o Termo de Conformidade.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ata FROM public.atas_registro_preco WHERE id = p_ata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_NAO_ENCONTRADA: Ata não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, public.chave_gestao_ata(v_ata.numero_ata || '-' || v_ata.codigo_uasg));

  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data do Termo de Conformidade.' USING ERRCODE = '22023';
  END IF;
  IF v_ata.data_vigencia_inicial IS NOT NULL AND p_data > v_ata.data_vigencia_inicial THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data do termo precisa ser anterior ao início da ata (%).', to_char(v_ata.data_vigencia_inicial, 'DD/MM/YYYY')
      USING ERRCODE = '22023';
  END IF;
  IF v_sei !~ '^\d{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do documento SEI do termo, com 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_reajuste_parametros (ata_id) VALUES (p_ata_id) ON CONFLICT (ata_id) DO NOTHING;
  SELECT versao INTO v_versao FROM public.ata_reajuste_parametros WHERE ata_id = p_ata_id FOR UPDATE;
  IF p_versao_vista IS NOT NULL AND p_versao_vista <> v_versao THEN
    RAISE EXCEPTION 'CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.ata_reajuste_parametros
     SET termo_data = p_data,
         termo_sei = v_sei,
         termo_informado_por = auth.uid(),
         termo_informado_em = NOW(),
         versao = versao + 1,
         atualizado_em = NOW()
   WHERE ata_id = p_ata_id
  RETURNING * INTO v_rec;

  RETURN jsonb_build_object('success', true, 'parametros', to_jsonb(v_rec));
END;
$$;

-- 8. Gestor informa ou corrige o percentual de um reajuste ----------------------
-- Com p_reajuste_id: completa ou corrige um reajuste (ex.: PDF sem percentual).
-- Sem p_reajuste_id: registra um reajuste que não está no PNCP.
CREATE OR REPLACE FUNCTION public.informar_reajuste_ata(
  p_ata_id UUID,
  p_reajuste_id UUID,
  p_percentual NUMERIC,
  p_periodo_inicio DATE,
  p_periodo_fim DATE,
  p_efeito_inicio DATE,
  p_sei TEXT,
  p_versao_vista INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata    public.atas_registro_preco%ROWTYPE;
  v_sei    TEXT := btrim(COALESCE(p_sei, ''));
  v_versao INTEGER;
  v_rec    public.ata_reajustes%ROWTYPE;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa o reajuste.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ata FROM public.atas_registro_preco WHERE id = p_ata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_NAO_ENCONTRADA: Ata não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, public.chave_gestao_ata(v_ata.numero_ata || '-' || v_ata.codigo_uasg));

  IF p_percentual IS NULL OR p_percentual <= -50 OR p_percentual >= 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o percentual aplicado, por exemplo 4,44.' USING ERRCODE = '22023';
  END IF;
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL OR p_periodo_fim < p_periodo_inicio THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o primeiro e o último mês do índice.' USING ERRCODE = '22023';
  END IF;
  IF p_efeito_inicio IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data de início dos efeitos.' USING ERRCODE = '22023';
  END IF;
  IF v_sei !~ '^\d{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do documento SEI do apostilamento, com 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_reajuste_parametros (ata_id) VALUES (p_ata_id) ON CONFLICT (ata_id) DO NOTHING;
  SELECT versao INTO v_versao FROM public.ata_reajuste_parametros WHERE ata_id = p_ata_id FOR UPDATE;
  IF p_versao_vista IS NOT NULL AND p_versao_vista <> v_versao THEN
    RAISE EXCEPTION 'CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.' USING ERRCODE = '40001';
  END IF;

  IF p_reajuste_id IS NOT NULL THEN
    UPDATE public.ata_reajustes
       SET percentual = p_percentual,
           periodo_inicio = date_trunc('month', p_periodo_inicio)::DATE,
           periodo_fim = date_trunc('month', p_periodo_fim)::DATE,
           efeito_inicio = p_efeito_inicio,
           sei_apostilamento = v_sei,
           informado_por = auth.uid(),
           informado_em = NOW()
     WHERE id = p_reajuste_id AND ata_id = p_ata_id
    RETURNING * INTO v_rec;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'REAJUSTE_NAO_ENCONTRADO: Reajuste não encontrado nesta ata.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.ata_reajustes (ata_id, origem, efeito_inicio, percentual, periodo_inicio, periodo_fim, sei_apostilamento, informado_por, informado_em)
    VALUES (p_ata_id, 'INFORMADO', p_efeito_inicio, p_percentual,
            date_trunc('month', p_periodo_inicio)::DATE, date_trunc('month', p_periodo_fim)::DATE, v_sei, auth.uid(), NOW())
    RETURNING * INTO v_rec;
  END IF;

  UPDATE public.ata_reajuste_parametros SET versao = versao + 1, atualizado_em = NOW() WHERE ata_id = p_ata_id;
  RETURN jsonb_build_object('success', true, 'reajuste', to_jsonb(v_rec));
END;
$$;

-- 9. Gravação pelo servidor -----------------------------------------------------
-- p_payload: {
--   indices: [{indice, mes 'AAAA-MM-01', tipo, variacao, fonte, referencia}],
--   projetados_substituir: [indice]   -- apaga os PROJETADO desses índices antes de gravar
--   atas: [{ ata_id, indice, clausula, data_orcamento_edital, termo_mes_apostilamento,
--            termo_sei_apostilamento, homologados: [{numero_item, valor}],
--            reajustes: [{documento_pncp_sequencial, documento_titulo, documento_publicado_em,
--                         efeito_inicio, percentual, periodo_inicio, periodo_fim, indice, sei_citado}] }]
-- }
-- Nunca sobrescreve o que o gestor informou (termo e percentual com informado_por).
CREATE OR REPLACE FUNCTION public.gravar_reajuste_fontes(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ind  INTEGER := 0;
  v_par  INTEGER := 0;
  v_hom  INTEGER := 0;
  v_rea  INTEGER := 0;
  v_a    JSONB;
  v_ata  UUID;
  v_n    INTEGER;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava as fontes do reajuste.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_payload -> 'projetados_substituir') = 'array' THEN
    DELETE FROM public.indices_precos_mensais
     WHERE tipo = 'PROJETADO'
       AND indice IN (SELECT jsonb_array_elements_text(p_payload -> 'projetados_substituir'));
  END IF;

  INSERT INTO public.indices_precos_mensais (indice, mes, tipo, variacao, fonte, referencia, lido_em)
  SELECT x ->> 'indice', (x ->> 'mes')::DATE, x ->> 'tipo', (x ->> 'variacao')::NUMERIC, x ->> 'fonte',
         NULLIF(x ->> 'referencia', '')::DATE, NOW()
    FROM jsonb_array_elements(COALESCE(p_payload -> 'indices', '[]'::JSONB)) x
  ON CONFLICT (indice, mes, tipo) DO UPDATE
     SET variacao = EXCLUDED.variacao, fonte = EXCLUDED.fonte, referencia = EXCLUDED.referencia, lido_em = NOW();
  GET DIAGNOSTICS v_ind = ROW_COUNT;

  -- Um mês com OFICIAL não precisa mais do PROJETADO.
  DELETE FROM public.indices_precos_mensais p
   WHERE p.tipo = 'PROJETADO'
     AND EXISTS (SELECT 1 FROM public.indices_precos_mensais o WHERE o.indice = p.indice AND o.mes = p.mes AND o.tipo = 'OFICIAL');

  FOR v_a IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'atas', '[]'::JSONB)) LOOP
    v_ata := (v_a ->> 'ata_id')::UUID;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.atas_registro_preco WHERE id = v_ata);

    INSERT INTO public.ata_reajuste_parametros (ata_id, indice, clausula, data_orcamento_edital, edital_lido_em,
                                                termo_mes_apostilamento, termo_sei_apostilamento)
    VALUES (v_ata, NULLIF(v_a ->> 'indice', ''), COALESCE(NULLIF(v_a ->> 'clausula', ''), 'A_CONFERIR'),
            NULLIF(v_a ->> 'data_orcamento_edital', '')::DATE,
            CASE WHEN v_a ? 'clausula' THEN NOW() END,
            NULLIF(v_a ->> 'termo_mes_apostilamento', '')::DATE, NULLIF(v_a ->> 'termo_sei_apostilamento', ''))
    ON CONFLICT (ata_id) DO UPDATE
       SET indice = COALESCE(EXCLUDED.indice, ata_reajuste_parametros.indice),
           clausula = CASE WHEN v_a ? 'clausula' THEN EXCLUDED.clausula ELSE ata_reajuste_parametros.clausula END,
           data_orcamento_edital = COALESCE(EXCLUDED.data_orcamento_edital, ata_reajuste_parametros.data_orcamento_edital),
           edital_lido_em = COALESCE(EXCLUDED.edital_lido_em, ata_reajuste_parametros.edital_lido_em),
           termo_mes_apostilamento = COALESCE(EXCLUDED.termo_mes_apostilamento, ata_reajuste_parametros.termo_mes_apostilamento),
           termo_sei_apostilamento = COALESCE(EXCLUDED.termo_sei_apostilamento, ata_reajuste_parametros.termo_sei_apostilamento),
           atualizado_em = NOW();
    v_par := v_par + 1;

    INSERT INTO public.itens_ata_preco_homologado (ata_id, numero_item, valor, lido_em)
    SELECT v_ata, h ->> 'numero_item', (h ->> 'valor')::NUMERIC, NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'homologados', '[]'::JSONB)) h
     WHERE (h ->> 'valor') IS NOT NULL
    ON CONFLICT (ata_id, numero_item) DO UPDATE SET valor = EXCLUDED.valor, lido_em = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hom := v_hom + v_n;

    INSERT INTO public.ata_reajustes (ata_id, origem, efeito_inicio, percentual, periodo_inicio, periodo_fim, indice,
                                      documento_pncp_sequencial, documento_titulo, documento_publicado_em, sei_citado, lido_em)
    SELECT v_ata, 'PNCP', (r ->> 'efeito_inicio')::DATE, NULLIF(r ->> 'percentual', '')::NUMERIC,
           NULLIF(r ->> 'periodo_inicio', '')::DATE, NULLIF(r ->> 'periodo_fim', '')::DATE, NULLIF(r ->> 'indice', ''),
           (r ->> 'documento_pncp_sequencial')::INTEGER, r ->> 'documento_titulo', NULLIF(r ->> 'documento_publicado_em', '')::DATE,
           NULLIF(r ->> 'sei_citado', ''), NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'reajustes', '[]'::JSONB)) r
    ON CONFLICT (ata_id, documento_pncp_sequencial) WHERE documento_pncp_sequencial IS NOT NULL DO UPDATE
       SET documento_titulo = EXCLUDED.documento_titulo,
           documento_publicado_em = EXCLUDED.documento_publicado_em,
           sei_citado = COALESCE(EXCLUDED.sei_citado, ata_reajustes.sei_citado),
           indice = COALESCE(EXCLUDED.indice, ata_reajustes.indice),
           -- O que o gestor informou fica.
           percentual = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.percentual ELSE ata_reajustes.percentual END,
           periodo_inicio = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.periodo_inicio ELSE ata_reajustes.periodo_inicio END,
           periodo_fim = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.periodo_fim ELSE ata_reajustes.periodo_fim END,
           efeito_inicio = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.efeito_inicio ELSE ata_reajustes.efeito_inicio END,
           lido_em = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rea := v_rea + v_n;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'indices', v_ind, 'atas', v_par, 'homologados', v_hom, 'reajustes', v_rea);
END;
$$;

-- 10. Permissões das funções ----------------------------------------------------
REVOKE ALL ON FUNCTION public.reajuste_variacao_12_meses(TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reajuste_ciclos_ata(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reajuste_itens_ata(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.informar_termo_conformidade(UUID, DATE, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.informar_reajuste_ata(UUID, UUID, NUMERIC, DATE, DATE, DATE, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gravar_reajuste_fontes(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reajuste_variacao_12_meses(TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reajuste_ciclos_ata(UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reajuste_itens_ata(UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.informar_termo_conformidade(UUID, DATE, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.informar_reajuste_ata(UUID, UUID, NUMERIC, DATE, DATE, DATE, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gravar_reajuste_fontes(JSONB) TO service_role;
REVOKE ALL ON public.v_ata_reajuste_resumo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_ata_reajuste_resumo TO authenticated, service_role;

-- 11. Auditoria -----------------------------------------------------------------
DO $$
DECLARE v_t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    FOREACH v_t IN ARRAY ARRAY['ata_reajuste_parametros', 'ata_reajustes'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || v_t, v_t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                     'FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()', 'trg_audit_' || v_t, v_t);
    END LOOP;
  END IF;
END $$;
