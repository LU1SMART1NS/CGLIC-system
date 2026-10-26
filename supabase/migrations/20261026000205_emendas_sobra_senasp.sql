-- ==============================================================================
-- MIGRATION 205: SOBRA DAS EMENDAS SÓ COM O EMPENHADO DA SENASP (decisão de 26/10/2026)
--
-- A primeira leitura (migration 204) mostrou que o empenhado do Portal da Transparência é o da emenda inteira, de todos
-- os órgãos: em 8 emendas ele passa do valor no SIOP que a CAEP informa, que é só a parte dela (ex.: R$ 17,3 mi × R$ 11,1
-- mi). A conta da sobra passa a usar só as notas das UGs da SENASP (200330 e 200331):
--   - o servidor lê também /emendas/documentos/{codigo} e grava as notas de empenho da SENASP (notas_senasp, 'UG:NE');
--   - a gravação soma o empenhado delas pela tabela empenhos (valor do Tesouro, com as anulações descontadas) e conta
--     as que o sistema ainda não tem (notas_sem_valor; a busca diária das notas das emendas as traz depois);
--   - a fila lê primeiro as emendas lidas há mais tempo: com muitas páginas de documentos, o tempo da função pode não
--     dar para todas num dia.
-- ==============================================================================

ALTER TABLE public.emenda_execucao_portal
  ADD COLUMN IF NOT EXISTS notas_senasp TEXT[],
  ADD COLUMN IF NOT EXISTS empenhado_senasp NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS notas_sem_valor INTEGER;
COMMENT ON COLUMN public.emenda_execucao_portal.notas_senasp IS
  'Notas de empenho da emenda emitidas pelas UGs da SENASP, no formato UG:NE (Portal, /emendas/documentos). NULL = documentos ainda não lidos.';
COMMENT ON COLUMN public.emenda_execucao_portal.empenhado_senasp IS
  'Soma do empenhado (tabela empenhos, Tesouro) das notas da SENASP da emenda, na hora da leitura (migration 205).';

CREATE OR REPLACE FUNCTION public.emendas_a_ler_no_portal()
RETURNS TABLE (codigo TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.codigo
    FROM (SELECT DISTINCT p.siop_emenda_ano::TEXT || p.siop_emenda AS codigo
            FROM public.emenda_pedidos p
           WHERE p.siop_emenda ~ '^[0-9]{8}$' AND p.siop_emenda_ano IS NOT NULL AND p.etapa <> 'CANCELADO'
             AND p.siop_emenda_ano >= EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER - 1) c
    LEFT JOIN public.emenda_execucao_portal x ON x.codigo = c.codigo
   ORDER BY x.notas_senasp IS NOT NULL, x.lido_em NULLS FIRST, c.codigo;
$$;

-- p_emendas: [{codigo, encontrada, valor_empenhado, valor_liquidado, valor_pago, autor, notas_senasp: ['200330:2026NE000309']}].
CREATE OR REPLACE FUNCTION public.gravar_execucao_emendas_portal(p_emendas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n INTEGER;
BEGIN
  IF jsonb_typeof(p_emendas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a lista de emendas deve ser um array.' USING ERRCODE = '22023';
  END IF;
  WITH entrada AS (
    SELECT x->>'codigo' AS codigo, x,
           CASE WHEN jsonb_typeof(x->'notas_senasp') = 'array'
                THEN ARRAY(SELECT DISTINCT n FROM jsonb_array_elements_text(x->'notas_senasp') n WHERE n ~ '^20033[01]:[0-9]{4}NE[0-9]{6}$' ORDER BY n)
           END AS notas
      FROM jsonb_array_elements(p_emendas) x
     WHERE x->>'codigo' ~ '^20[0-9]{10}$'
  ), valores AS (
    SELECT en.codigo,
           sum(e.valor_empenhado) AS empenhado,
           count(*) FILTER (WHERE e.id IS NULL)::INTEGER AS sem_valor
      FROM entrada en
      CROSS JOIN LATERAL unnest(en.notas) nt
      LEFT JOIN LATERAL (SELECT em.id, em.valor_empenhado FROM public.empenhos em
                          WHERE em.uasg_emitente = split_part(nt, ':', 1) AND em.numero_oficial = split_part(nt, ':', 2)
                          ORDER BY em.updated_at DESC NULLS LAST LIMIT 1) e ON TRUE
     GROUP BY en.codigo
  )
  INSERT INTO public.emenda_execucao_portal AS d (codigo, ano, emenda, encontrada, valor_empenhado, valor_liquidado, valor_pago, autor,
                                                 notas_senasp, empenhado_senasp, notas_sem_valor, lido_em)
  SELECT en.codigo, left(en.codigo, 4)::SMALLINT, right(en.codigo, 8), COALESCE((en.x->>'encontrada')::BOOLEAN, FALSE),
         NULLIF(en.x->>'valor_empenhado', '')::NUMERIC, NULLIF(en.x->>'valor_liquidado', '')::NUMERIC, NULLIF(en.x->>'valor_pago', '')::NUMERIC,
         left(NULLIF(btrim(en.x->>'autor'), ''), 200), en.notas,
         CASE WHEN en.notas IS NULL THEN NULL ELSE COALESCE(v.empenhado, 0) END,
         CASE WHEN en.notas IS NULL THEN NULL ELSE COALESCE(v.sem_valor, 0) END,
         NOW()
    FROM entrada en LEFT JOIN valores v ON v.codigo = en.codigo
  ON CONFLICT (codigo) DO UPDATE SET
    encontrada = EXCLUDED.encontrada, valor_empenhado = EXCLUDED.valor_empenhado, valor_liquidado = EXCLUDED.valor_liquidado,
    valor_pago = EXCLUDED.valor_pago, autor = EXCLUDED.autor,
    -- Sem os documentos nesta leitura (tempo da função), fica o que já estava.
    notas_senasp = COALESCE(EXCLUDED.notas_senasp, d.notas_senasp),
    empenhado_senasp = COALESCE(EXCLUDED.empenhado_senasp, d.empenhado_senasp),
    notas_sem_valor = COALESCE(EXCLUDED.notas_sem_valor, d.notas_sem_valor),
    lido_em = EXCLUDED.lido_em;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_execucao_emendas_portal(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_execucao_emendas_portal(JSONB) TO service_role;
