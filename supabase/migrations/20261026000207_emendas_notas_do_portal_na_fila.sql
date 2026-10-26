-- ==============================================================================
-- MIGRATION 207: NOTAS DA SENASP QUE O PORTAL LIGA À EMENDA ENTRAM NA BUSCA DIÁRIA (decisão de 26/10/2026)
--
-- Depois da migration 205, 12 emendas ficaram "a confirmar" porque o Portal da Transparência liga a elas notas da SENASP
-- que a tabela empenhos não tem. Medição (26/10/2026, 21 notas):
--   - 11 são transferências (contribuições a estados e municípios) que a migration 197 tirou do escopo: são da emenda,
--     mas não são compra da CAEP, e o valor no SIOP que a CAEP informa não as inclui. Deixam de contar como faltando.
--   - 6 já estavam na fila diária (descobertas no saldo contábil) e ainda não tinham sido perguntadas: passam a entrar
--     como as citadas no SEI, na frente da fila, com a emenda do Portal.
--   - 4 o Tesouro (STA) não descreve na UG 200330 (a resposta veio só da 200331, com outro plano interno): passam a ir
--     pelo Portal (notas_das_emendas_pelo_portal / gravar_notas_pelo_portal, migration 192), como as citadas no SEI.
-- E a soma do empenhado da SENASP (migration 205) vira uma função, refeita aqui para as emendas já lidas.
-- ==============================================================================

-- Empenhado das notas da SENASP ('UG:NE') pela tabela empenhos e as que faltam (sem contar as transferências fora do
-- escopo, migration 197).
CREATE OR REPLACE FUNCTION public.emendas_valor_notas_senasp(p_notas TEXT[])
RETURNS TABLE (empenhado NUMERIC, sem_valor INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(sum(e.valor_empenhado), 0),
         (count(*) FILTER (WHERE e.id IS NULL AND t.situacao IS DISTINCT FROM 'FORA_DO_ESCOPO'))::INTEGER
    FROM unnest(COALESCE(p_notas, ARRAY[]::TEXT[])) nt
    LEFT JOIN LATERAL (SELECT em.id, em.valor_empenhado FROM public.empenhos em
                        WHERE em.uasg_emitente = split_part(nt, ':', 1) AND em.numero_oficial = split_part(nt, ':', 2)
                        ORDER BY em.updated_at DESC NULLS LAST LIMIT 1) e ON TRUE
    LEFT JOIN public.emenda_notas_tesouro_tentativas t ON t.numero_oficial = split_part(nt, ':', 2);
$$;
REVOKE ALL ON FUNCTION public.emendas_valor_notas_senasp(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_valor_notas_senasp(TEXT[]) TO service_role;

-- Igual à da migration 205, com a soma pela função acima.
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
  )
  INSERT INTO public.emenda_execucao_portal AS d (codigo, ano, emenda, encontrada, valor_empenhado, valor_liquidado, valor_pago, autor,
                                                 notas_senasp, empenhado_senasp, notas_sem_valor, lido_em)
  SELECT en.codigo, left(en.codigo, 4)::SMALLINT, right(en.codigo, 8), COALESCE((en.x->>'encontrada')::BOOLEAN, FALSE),
         NULLIF(en.x->>'valor_empenhado', '')::NUMERIC, NULLIF(en.x->>'valor_liquidado', '')::NUMERIC, NULLIF(en.x->>'valor_pago', '')::NUMERIC,
         left(NULLIF(btrim(en.x->>'autor'), ''), 200), en.notas, v.empenhado, v.sem_valor, NOW()
    FROM entrada en
    LEFT JOIN LATERAL (SELECT s.empenhado, s.sem_valor FROM public.emendas_valor_notas_senasp(en.notas) s WHERE en.notas IS NOT NULL) v ON TRUE
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

-- Fila do Tesouro: igual à da migration 188 e seguintes, mais as notas que o Portal liga às emendas.
CREATE OR REPLACE FUNCTION public.notas_das_emendas_a_trazer(p_reconsulta interval DEFAULT '1 day'::interval)
RETURNS TABLE(numero_oficial character varying, emendas text[], tentativa_em timestamp with time zone, situacao character varying)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH citadas AS (
    SELECT upper(btrim(d.nota_empenho)) AS numero, array_agg(DISTINCT p.siop_emenda) AS emendas
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
     WHERE d.etapa = 'EMPENHO'
       AND upper(btrim(d.nota_empenho)) ~ '^[0-9]{4}NE[0-9]{6}$'
       AND p.siop_emenda IS NOT NULL
     GROUP BY 1
  ),
  -- Migration 207: as notas da SENASP que o Portal liga às emendas dos pedidos (emenda_execucao_portal) e que o sistema
  -- ainda não tem entram como as citadas no SEI, com a emenda do Portal.
  do_portal AS (
    SELECT split_part(n, ':', 2) AS numero, array_agg(DISTINCT x.emenda::TEXT) AS emendas
      FROM public.emenda_execucao_portal x, unnest(x.notas_senasp) n
     WHERE NOT EXISTS (SELECT 1 FROM public.empenhos e WHERE e.uasg_emitente = split_part(n, ':', 1) AND e.numero_oficial = split_part(n, ':', 2))
     GROUP BY 1
  ),
  -- As emendas de todos os pedidos: a nota achada no saldo contábil pode ser de qualquer uma.
  dos_pedidos AS (
    SELECT array_agg(DISTINCT p.siop_emenda) AS emendas
      FROM public.emenda_pedidos p WHERE p.siop_emenda IS NOT NULL AND p.etapa <> 'CANCELADO'
  ),
  descobertas AS (
    SELECT DISTINCT s.numero_empenho AS numero
      FROM public.empenho_saldo_contabil s
     WHERE s.ug = '200330'
       AND s.numero_empenho ~ '^[0-9]{4}NE[0-9]{6}$'
       AND left(s.numero_empenho, 4)::INTEGER >= EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER - 1
       AND NOT EXISTS (SELECT 1 FROM public.empenhos e WHERE e.numero_oficial = s.numero_empenho AND e.uasg_emitente = '200330')
       AND NOT EXISTS (SELECT 1 FROM citadas c WHERE c.numero = s.numero_empenho)
       AND NOT EXISTS (SELECT 1 FROM do_portal p WHERE p.numero = s.numero_empenho)
  ),
  todas AS (
    SELECT c.numero, c.emendas, TRUE AS citada FROM citadas c
    UNION ALL
    SELECT p.numero, p.emendas, TRUE FROM do_portal p WHERE NOT EXISTS (SELECT 1 FROM citadas c WHERE c.numero = p.numero)
    UNION ALL
    SELECT d.numero, (SELECT emendas FROM dos_pedidos), FALSE FROM descobertas d
  )
  SELECT c.numero::VARCHAR, c.emendas, t.tentativa_em, t.situacao
    FROM todas c
    LEFT JOIN public.emenda_notas_tesouro_tentativas t ON t.numero_oficial = c.numero
   WHERE NOT EXISTS (
           SELECT 1 FROM public.empenhos e
            WHERE e.numero_oficial = c.numero
              AND e.uasg_emitente IN ('200330', '200331')
              AND EXISTS (SELECT 1 FROM unnest(c.emendas) em WHERE public.nota_casa_com_emenda(e.plano_interno, em)))
     AND (t.tentativa_em IS NULL OR t.tentativa_em < NOW() - COALESCE(p_reconsulta, INTERVAL '1 day'))
     -- Transferência (convênio) não é perguntada de novo (migration 197).
     AND t.situacao IS DISTINCT FROM 'FORA_DO_ESCOPO'
     -- A achada no saldo contábil que o Tesouro já disse não ser de emenda nenhuma dos pedidos só volta quando algum
     -- pedido passa a ter a emenda do plano interno dela.
     AND (c.citada OR t.situacao IS NULL OR t.situacao <> 'SEM_PLANO_DA_EMENDA'
          OR EXISTS (SELECT 1 FROM unnest(c.emendas) em WHERE public.nota_casa_com_emenda(t.plano_interno, em)))
   ORDER BY c.citada DESC, t.tentativa_em NULLS FIRST, c.numero DESC;
$function$;

-- Fila do Portal: igual à da migration 192, mais as notas da 200330 que o Portal liga às emendas.
CREATE OR REPLACE FUNCTION public.notas_das_emendas_pelo_portal(p_reconsulta interval DEFAULT '1 day'::interval)
RETURNS TABLE(numero_oficial character varying, emenda text, anos integer[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH citadas AS (
    SELECT DISTINCT upper(btrim(d.nota_empenho)) AS numero, p.siop_emenda AS emenda, p.siop_emenda_ano AS ano
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
     WHERE d.etapa = 'EMPENHO'
       AND upper(btrim(d.nota_empenho)) ~ '^[0-9]{4}NE[0-9]{6}$'
       AND p.siop_emenda ~ '^[0-9]{8}$'
       AND p.etapa <> 'CANCELADO'
    -- Migration 207: e as da UG 200330 que o Portal liga à emenda (emenda_execucao_portal), com o ano da emenda.
    UNION
    SELECT split_part(n, ':', 2), x.emenda::TEXT, x.ano
      FROM public.emenda_execucao_portal x, unnest(x.notas_senasp) n
     WHERE split_part(n, ':', 1) = '200330'
  )
  SELECT c.numero::VARCHAR, c.emenda,
         -- O ano da emenda, quando o pedido sabe (migration 186); senão o da nota e o anterior (emenda de um ano
         -- empenhada no seguinte).
         array_agg(DISTINCT a ORDER BY a DESC) AS anos
    FROM citadas c
    JOIN public.emenda_notas_tesouro_tentativas t ON t.numero_oficial = c.numero
    CROSS JOIN LATERAL unnest(CASE WHEN c.ano IS NOT NULL THEN ARRAY[c.ano::INTEGER]
                                   ELSE ARRAY[left(c.numero, 4)::INTEGER, left(c.numero, 4)::INTEGER - 1] END) a
   WHERE t.situacao IN ('SEM_PLANO_DA_EMENDA', 'TESOURO_SEM_A_NOTA')
     -- O STA não devolveu a nota na 200330 (sem plano interno guardado e sem resposta da 200330 no detalhe).
     AND t.plano_interno IS NULL
     AND COALESCE(t.detalhe, '') NOT LIKE '%200330:%'
     AND (t.portal_em IS NULL OR t.portal_em < NOW() - COALESCE(p_reconsulta, INTERVAL '1 day'))
     AND EXISTS (SELECT 1 FROM public.empenho_saldo_contabil s WHERE s.ug = '200330' AND s.numero_empenho = c.numero)
     AND NOT EXISTS (SELECT 1 FROM public.empenhos e WHERE e.numero_oficial = c.numero AND e.uasg_emitente = '200330')
   GROUP BY c.numero, c.emenda
   ORDER BY c.numero;
$function$;

-- Refaz a soma das emendas já lidas (as transferências deixam de contar como faltando).
UPDATE public.emenda_execucao_portal x
   SET (empenhado_senasp, notas_sem_valor) = (SELECT v.empenhado, v.sem_valor FROM public.emendas_valor_notas_senasp(x.notas_senasp) v)
 WHERE x.notas_senasp IS NOT NULL;
