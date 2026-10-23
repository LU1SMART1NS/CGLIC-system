-- ==============================================================================
-- Reajuste das atas, parte 3: a leitura de um edital pesado não trava a fila
--
-- Primeira leitura em produção (23/10/2026, 16:03 UTC): a função gravou os índices e 3 atas em 31 s e foi
-- derrubada ao ler o edital da ata seguinte (00038/2026, compra 275/2026: zip com 13 PDFs). Sem conclusão,
-- a mesma ata voltaria ao começo da fila em toda execução e nada mais seria lido.
--
--   1. ata_reajuste_parametros.edital_tentativas: o servidor soma 1 antes de ler o edital
--      (gravar_reajuste_fontes com edital_tentativa = true).
--   2. atas_para_reajuste devolve as tentativas e põe por último as atas com edital que já derrubou a leitura.
--      O servidor desiste do edital depois de 2 tentativas: a cláusula fica "a conferir" e a ata segue com os
--      apostilamentos e o preço homologado.
--
-- DROP + CREATE em atas_para_reajuste (a lista de colunas muda): as permissões são refeitas como na 159
-- (só service_role). gravar_reajuste_fontes mantém a assinatura (CREATE OR REPLACE mantém as permissões).
-- ==============================================================================

ALTER TABLE public.ata_reajuste_parametros
  ADD COLUMN IF NOT EXISTS edital_tentativas INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.ata_reajuste_parametros.edital_tentativas IS 'Tentativas de ler o edital da compra no servidor. Depois de 2, o edital fica a conferir.';

DROP FUNCTION IF EXISTS public.atas_para_reajuste(INTEGER);
CREATE FUNCTION public.atas_para_reajuste(p_limite INTEGER DEFAULT 200)
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
  itens_sem_homologado  INTEGER,
  edital_tentativas     INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT a.id, a.numero_ata, a.codigo_uasg, a.numero_controle_pncp, a.data_vigencia_inicial, a.data_vigencia_final,
           p.ata_id IS NULL AS nova, p.edital_lido_em, COALESCE(p.documentos_pncp_lidos, '{}') AS lidos,
           p.documentos_lidos_em, p.homologados_lidos_em, COALESCE(p.edital_tentativas, 0) AS tentativas,
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
         edital_lido_em, lidos, documentos_lidos_em, sem_homologado, tentativas
    FROM base
   WHERE nova
      OR edital_lido_em IS NULL
      OR documentos_lidos_em IS NULL
      OR documentos_lidos_em < NOW() - INTERVAL '20 hours'
      OR (sem_homologado > 0 AND (homologados_lidos_em IS NULL OR homologados_lidos_em < NOW() - INTERVAL '7 days'))
   ORDER BY tentativas, nova DESC, (edital_lido_em IS NULL) DESC, documentos_lidos_em NULLS FIRST, numero_controle_pncp
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 200), 1000));
$$;
REVOKE ALL ON FUNCTION public.atas_para_reajuste(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atas_para_reajuste(INTEGER) TO service_role;

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

    -- Antes de ler o edital, o servidor marca a tentativa: se a leitura derrubar a função, a ata vai para o fim
    -- da fila e, depois de 2 tentativas, o edital fica "a conferir" (ver reajusteAtasSyncService).
    IF COALESCE((v_a ->> 'edital_tentativa')::BOOLEAN, FALSE) THEN
      UPDATE public.ata_reajuste_parametros SET edital_tentativas = edital_tentativas + 1 WHERE ata_id = v_ata;
    END IF;

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
REVOKE ALL ON FUNCTION public.gravar_reajuste_fontes(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_reajuste_fontes(JSONB) TO service_role;
