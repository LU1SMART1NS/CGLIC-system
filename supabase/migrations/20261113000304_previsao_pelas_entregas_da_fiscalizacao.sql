-- ==============================================================================
-- Versão: 20261113000304_previsao_pelas_entregas_da_fiscalizacao.sql
-- Previsão mensal de pagamentos pelas datas da Fiscalização (pedido do usuário em 13/11/2026).
--
-- Itens acompanhados pela SFC/CGLIC, ainda não entregues, com data prevista de entrega no mês ANTERIOR ao da
-- previsão (depois da entrega vêm o recebimento, a nota e a liquidação: o pagamento cai no mês seguinte). Itens com o
-- prazo vencido ficam de fora (decisão do usuário): entram quando o fiscal registrar a entrega ou prorrogar o prazo.
-- Valor = quantidade × valor unitário do item no contrato (vínculo do contrato com o item da ata); item sem preço
-- conta em "sem_preco". Nota de empenho: a da linha do pedido de emenda, quando há.
-- Uma linha por contrato × nota. Leitura para usuários ativos.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fisc_previsao_de_entregas(p_mes TEXT)
RETURNS TABLE (contract_key TEXT, nota TEXT, itens INTEGER, valor NUMERIC, sem_preco INTEGER, primeira DATE, ultima DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alvo  DATE;
  v_hoje  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
BEGIN
  IF public.usuario_ativo() IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Faça login.' USING ERRCODE = '42501';
  END IF;
  IF p_mes IS NULL OR p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Mês no formato AAAA-MM.' USING ERRCODE = '22023';
  END IF;
  v_alvo := (p_mes || '-01')::DATE;
  RETURN QUERY
  SELECT e.contract_key::TEXT, n.nota::TEXT, count(*)::INTEGER,
         COALESCE(sum(e.quantidade * l.valor_unitario_api), 0)::NUMERIC,
         count(*) FILTER (WHERE l.valor_unitario_api IS NULL)::INTEGER,
         min(e.prevista), max(e.prevista)
    FROM public.fisc_entregas e
    LEFT JOIN public.arp_item_contract_links l ON l.contract_key = e.contract_key AND l.item_key = e.item_key
    LEFT JOIN public.emenda_linha_notas n ON n.linha_id = e.emenda_linha_id
   WHERE e.encerrada_em IS NULL AND e.responsavel = 'SFC' AND e.entregue_em IS NULL
     AND e.prevista >= (v_alvo - INTERVAL '1 month')::DATE AND e.prevista < v_alvo
     AND e.prevista >= v_hoje
   GROUP BY e.contract_key, n.nota;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_previsao_de_entregas(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_previsao_de_entregas(TEXT) TO authenticated;
