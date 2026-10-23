-- ==============================================================================
-- Reajuste das atas, parte 2: leitura pelo servidor (recurso 'reajuste_atas')
--
-- O servidor (src/services/reajusteAtasSyncService.ts) lê, para as atas vigentes gerenciadas pela SENASP:
--   - o IPCA oficial (Banco Central, série 433) e o projetado (Focus);
--   - a cláusula de reajuste do edital (índice e data do orçamento, só como sugestão);
--   - os apostilamentos e termos aditivos publicados no PNCP (percentual, período e efeitos);
--   - o preço homologado de cada item.
-- Esta migration guarda o que já foi lido, dá ao servidor a fila de atas e agenda a leitura.
--
--   1. ata_reajuste_parametros ganha documentos_pncp_lidos (sequenciais dos arquivos da ata no PNCP já
--      lidos, com ou sem reajuste), documentos_lidos_em e homologados_lidos_em.
--   2. ata_reajustes ganha sei_citado_conformidade: o texto diz que o SEI citado é a conformidade da
--      pesquisa de preços.
--   3. atas_para_reajuste(p_limite): fila do servidor.
--   4. gravar_reajuste_fontes passa a aceitar documentos_lidos e a deduzir, dos reajustes gravados, o mês
--      do Termo de Conformidade (período do primeiro reajuste) e o SEI do termo, quando o texto diz que é ele.
--   5. O mesmo reajuste publicado em dois documentos da ata (termo aditivo de prorrogação e apostilamento)
--      conta uma vez: a gravação pula a repetição e reajuste_ciclos_ata ignora as que já existirem.
--   6. Agendamento: de 3 em 3 horas, no minuto 44 (livre na tabela de docs/migrations.md).
--
-- Nada que já existe muda de comportamento. O recurso só funciona depois de publicar a função.
-- ==============================================================================

-- 1. Colunas --------------------------------------------------------------------
ALTER TABLE public.ata_reajuste_parametros
  ADD COLUMN IF NOT EXISTS documentos_pncp_lidos INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS documentos_lidos_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS homologados_lidos_em TIMESTAMPTZ;
COMMENT ON COLUMN public.ata_reajuste_parametros.documentos_pncp_lidos IS 'Sequenciais dos arquivos da ata no PNCP já lidos pelo servidor (com ou sem reajuste). O arquivo 1 é a própria ata.';

ALTER TABLE public.ata_reajustes
  ADD COLUMN IF NOT EXISTS sei_citado_conformidade BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.ata_reajustes.sei_citado_conformidade IS 'O documento diz que o SEI citado é a conformidade da pesquisa de preços (Termo de Conformidade).';

-- 2. Fila do servidor -----------------------------------------------------------
-- Atas vigentes gerenciadas pela SENASP com controle do PNCP. Entram as nunca lidas, as que não tiveram o
-- edital lido, as com documentos lidos há mais de 20 horas e as com item sem preço homologado (de novo só
-- depois de 7 dias, para não insistir num item que o PNCP não tem).
CREATE OR REPLACE FUNCTION public.atas_para_reajuste(p_limite INTEGER DEFAULT 200)
RETURNS TABLE (
  ata_id                UUID,
  numero_ata            VARCHAR,
  codigo_uasg           VARCHAR,
  numero_controle_pncp  VARCHAR,
  data_vigencia_inicial DATE,
  data_vigencia_final   DATE,
  edital_lido_em        TIMESTAMPTZ,
  documentos_pncp_lidos INTEGER[],
  documentos_lidos_em   TIMESTAMPTZ,
  itens_sem_homologado  INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT a.id, a.numero_ata, a.codigo_uasg, a.numero_controle_pncp, a.data_vigencia_inicial, a.data_vigencia_final,
           p.ata_id IS NULL AS nova, p.edital_lido_em, COALESCE(p.documentos_pncp_lidos, '{}') AS lidos,
           p.documentos_lidos_em, p.homologados_lidos_em,
           (SELECT count(*)::INTEGER FROM public.itens_ata i
             WHERE i.ata_id = a.id
               AND NOT EXISTS (SELECT 1 FROM public.itens_ata_preco_homologado h WHERE h.ata_id = i.ata_id AND h.numero_item = i.numero_item)) AS sem_homologado
      FROM public.atas_registro_preco a
      LEFT JOIN public.ata_reajuste_parametros p ON p.ata_id = a.id
     WHERE a.papel_senasp = 'GERENCIADORA'
       AND a.data_vigencia_final >= CURRENT_DATE
       AND a.numero_controle_pncp ~ '^\d{14}-1-\d{6}/\d{4}-\d{6}$'
  )
  SELECT id, numero_ata, codigo_uasg, numero_controle_pncp, data_vigencia_inicial, data_vigencia_final,
         edital_lido_em, lidos, documentos_lidos_em, sem_homologado
    FROM base
   WHERE nova
      OR edital_lido_em IS NULL
      OR documentos_lidos_em IS NULL
      OR documentos_lidos_em < NOW() - INTERVAL '20 hours'
      OR (sem_homologado > 0 AND (homologados_lidos_em IS NULL OR homologados_lidos_em < NOW() - INTERVAL '7 days'))
   ORDER BY nova DESC, (edital_lido_em IS NULL) DESC, documentos_lidos_em NULLS FIRST, numero_controle_pncp
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 200), 1000));
$$;
REVOKE ALL ON FUNCTION public.atas_para_reajuste(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atas_para_reajuste(INTEGER) TO service_role;

-- 3. Gravação pelo servidor -----------------------------------------------------
-- Mesmo contrato da migration 158, mais, em cada ata:
--   documentos_lidos: [sequencial]   -- arquivos da ata lidos nesta execução (soma aos já lidos)
--   reajustes[].sei_citado_conformidade: boolean
--   homologados_completos: boolean    -- true: todos os itens sem preço foram consultados (marca homologados_lidos_em) O mês e o SEI do termo pelo apostilamento são
-- deduzidos dos reajustes gravados (o payload não precisa mandar).
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
  v_pri  RECORD;
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
                                      documento_pncp_sequencial, documento_titulo, documento_publicado_em, sei_citado,
                                      sei_citado_conformidade, lido_em)
    SELECT v_ata, 'PNCP', (r ->> 'efeito_inicio')::DATE, NULLIF(r ->> 'percentual', '')::NUMERIC,
           NULLIF(r ->> 'periodo_inicio', '')::DATE, NULLIF(r ->> 'periodo_fim', '')::DATE, NULLIF(r ->> 'indice', ''),
           (r ->> 'documento_pncp_sequencial')::INTEGER, r ->> 'documento_titulo', NULLIF(r ->> 'documento_publicado_em', '')::DATE,
           NULLIF(r ->> 'sei_citado', ''), COALESCE((r ->> 'sei_citado_conformidade')::BOOLEAN, FALSE), NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'reajustes', '[]'::JSONB)) r
     -- O mesmo reajuste já gravado a partir de outro documento da ata não entra de novo.
     WHERE NOT EXISTS (
       SELECT 1 FROM public.ata_reajustes x
        WHERE x.ata_id = v_ata
          AND x.documento_pncp_sequencial IS DISTINCT FROM (r ->> 'documento_pncp_sequencial')::INTEGER
          AND x.percentual IS NOT DISTINCT FROM NULLIF(r ->> 'percentual', '')::NUMERIC
          AND x.periodo_inicio IS NOT DISTINCT FROM NULLIF(r ->> 'periodo_inicio', '')::DATE
          AND x.periodo_fim IS NOT DISTINCT FROM NULLIF(r ->> 'periodo_fim', '')::DATE
          AND (x.periodo_inicio IS NOT NULL OR x.efeito_inicio = (r ->> 'efeito_inicio')::DATE))
    ON CONFLICT (ata_id, documento_pncp_sequencial) WHERE documento_pncp_sequencial IS NOT NULL DO UPDATE
       SET documento_titulo = EXCLUDED.documento_titulo,
           documento_publicado_em = EXCLUDED.documento_publicado_em,
           sei_citado = COALESCE(EXCLUDED.sei_citado, ata_reajustes.sei_citado),
           sei_citado_conformidade = EXCLUDED.sei_citado_conformidade OR ata_reajustes.sei_citado_conformidade,
           indice = COALESCE(EXCLUDED.indice, ata_reajustes.indice),
           -- O que o gestor informou fica.
           percentual = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.percentual ELSE ata_reajustes.percentual END,
           periodo_inicio = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.periodo_inicio ELSE ata_reajustes.periodo_inicio END,
           periodo_fim = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.periodo_fim ELSE ata_reajustes.periodo_fim END,
           efeito_inicio = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.efeito_inicio ELSE ata_reajustes.efeito_inicio END,
           lido_em = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rea := v_rea + v_n;

    -- Documentos lidos e preços homologados lidos.
    IF jsonb_typeof(v_a -> 'documentos_lidos') = 'array' THEN
      UPDATE public.ata_reajuste_parametros p
         SET documentos_pncp_lidos = ARRAY(
               SELECT DISTINCT s FROM unnest(p.documentos_pncp_lidos || ARRAY(SELECT (jsonb_array_elements_text(v_a -> 'documentos_lidos'))::INTEGER)) s
                ORDER BY s),
             documentos_lidos_em = NOW()
       WHERE p.ata_id = v_ata;
    END IF;
    IF COALESCE((v_a ->> 'homologados_completos')::BOOLEAN, FALSE) THEN
      UPDATE public.ata_reajuste_parametros SET homologados_lidos_em = NOW() WHERE ata_id = v_ata;
    END IF;

    -- Mês do Termo de Conformidade: o período do primeiro reajuste começa no mês do termo.
    SELECT r.periodo_inicio, r.sei_citado, r.sei_citado_conformidade INTO v_pri
      FROM public.ata_reajustes r
     WHERE r.ata_id = v_ata AND r.periodo_inicio IS NOT NULL
     ORDER BY r.efeito_inicio, r.periodo_inicio
     LIMIT 1;
    IF FOUND THEN
      UPDATE public.ata_reajuste_parametros
         SET termo_mes_apostilamento = v_pri.periodo_inicio,
             termo_sei_apostilamento = CASE WHEN v_pri.sei_citado_conformidade THEN v_pri.sei_citado ELSE termo_sei_apostilamento END
       WHERE ata_id = v_ata;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'indices', v_ind, 'atas', v_par, 'homologados', v_hom, 'reajustes', v_rea);
END;
$$;
-- CREATE OR REPLACE mantém as permissões da migration 158 (só service_role); reforço:
REVOKE ALL ON FUNCTION public.gravar_reajuste_fontes(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_reajuste_fontes(JSONB) TO service_role;

-- 4. Ciclos: o mesmo reajuste em dois documentos conta uma vez -----------------
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
  -- O mesmo reajuste aparece em mais de um documento da ata (termo aditivo de prorrogação e apostilamento,
  -- ou o PDF republicado): mesmo percentual e período contam uma vez. O informado pelo gestor tem preferência.
  SELECT COALESCE(array_agg(u.reg ORDER BY u.efeito, u.rid), '{}') INTO v_aplic
    FROM (
      SELECT DISTINCT ON (COALESCE(r.percentual, -1), r.periodo_inicio, r.periodo_fim,
                          CASE WHEN r.periodo_inicio IS NULL THEN r.efeito_inicio END)
             r AS reg, r.efeito_inicio AS efeito, r.id AS rid
        FROM public.ata_reajustes r
       WHERE r.ata_id = p_ata_id
       ORDER BY COALESCE(r.percentual, -1), r.periodo_inicio, r.periodo_fim,
                CASE WHEN r.periodo_inicio IS NULL THEN r.efeito_inicio END,
                (r.informado_por IS NULL), r.efeito_inicio, r.documento_pncp_sequencial NULLS FIRST
    ) u;

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

-- 5. Agendamento ----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-reajuste-atas';
    PERFORM cron.schedule('sincronizar-reajuste-atas', '44 */3 * * *', $c$SELECT public.disparar_sincronizacao('reajuste_atas')$c$);
  END IF;
END $$;
