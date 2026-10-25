-- ==============================================================================
-- MIGRATION 182: NOTAS DAS EMENDAS PARLAMENTARES NA LEITURA DO PORTAL DA TRANSPARÊNCIA (SIAFI)
-- Versão: 20261024000182_notas_das_emendas_no_portal.sql
--
-- O servidor (recurso itens_notas_siafi, a cada 30 minutos por UG) lê no Portal da Transparência os itens e as
-- quantidades de cada nota de empenho, mas só das notas em contratos de 2+ itens ou sem itens (migration 121): numa
-- nota de contrato de um item só, o item é óbvio. Para conferir os pedidos das emendas com o empenho de fato (pedido
-- do usuário em 24/10/2026), é preciso a quantidade de cada nota das emendas, qualquer que seja o contrato. Medição de
-- 24/10/2026: 110 notas ligadas às linhas das emendas, só 42 lidas.
--
-- notas_para_ler_no_siafi passa a incluir, na mesma UG emitente e com as mesmas regras de releitura:
-- - as notas que o sistema ligou às linhas dos pedidos das emendas (emenda_linha_notas.empenho_id);
-- - as notas citadas nos despachos de empenho do SEI dos pedidos (emenda_pedido_documentos_sei, etapa EMPENHO).
-- Nada mais muda: a gravação (gravar_leituras_siafi) e a Edge Function são as mesmas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.notas_para_ler_no_siafi(p_uasg TEXT, p_limite INTEGER DEFAULT 500)
RETURNS TABLE (empenho_id UUID, numero_oficial VARCHAR, uasg_emitente VARCHAR, motivo TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH n AS (
    SELECT ce.empenho_id, max(COALESCE(x.n, 0)) AS max_itens, min(COALESCE(x.n, 0)) AS min_itens
      FROM public.contrato_empenhos ce
      LEFT JOIN (SELECT contract_key, count(*) AS n FROM public.v_contrato_itens_numerados GROUP BY contract_key) x
        ON x.contract_key = ce.contract_key
     GROUP BY ce.empenho_id
  ),
  -- Notas das emendas parlamentares (migration 182): ligadas às linhas dos pedidos ou citadas no SEI
  das_emendas AS (
    SELECT n.empenho_id AS id FROM public.emenda_linha_notas n WHERE n.empenho_id IS NOT NULL
    UNION
    SELECT e.id
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.empenhos e ON e.numero_oficial = d.nota_empenho AND e.uasg_emitente = p_uasg
     WHERE d.etapa = 'EMPENHO' AND d.nota_empenho IS NOT NULL
  ),
  alvo AS (
    SELECT e.id, e.numero_oficial, e.uasg_emitente, e.data_emissao, l.lido_em, l.valor_no_sistema, e.valor_empenhado
      FROM public.empenhos e
      LEFT JOIN n ON n.empenho_id = e.id
      LEFT JOIN public.empenho_leituras_siafi l ON l.empenho_id = e.id
     WHERE e.uasg_emitente = p_uasg
       AND e.valor_empenhado > 0
       AND ((n.empenho_id IS NOT NULL AND (n.max_itens >= 2 OR n.min_itens = 0))
            OR e.id IN (SELECT id FROM das_emendas))
  )
  SELECT a.id, a.numero_oficial, a.uasg_emitente,
         CASE WHEN a.lido_em IS NULL THEN 'NUNCA_LIDA'
              WHEN a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado THEN 'VALOR_MUDOU'
              ELSE 'RELEITURA' END
    FROM alvo a
   WHERE a.lido_em IS NULL
      OR a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado
      OR (a.lido_em < NOW() - INTERVAL '30 days' AND a.data_emissao > (CURRENT_DATE - INTERVAL '2 years'))
   ORDER BY CASE WHEN a.lido_em IS NULL THEN 1 WHEN a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado THEN 2 ELSE 3 END,
            a.data_emissao DESC NULLS LAST
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 5000));
$$;

REVOKE ALL ON FUNCTION public.notas_para_ler_no_siafi(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notas_para_ler_no_siafi(TEXT, INTEGER) TO service_role;
