-- ==============================================================================
-- Versão: 20261113000305_entregas_para_pagamento.sql
-- Pagamentos pelas datas da Fiscalização (pedido do usuário em 13/11/2026): o quadro "Expectativa de pagamento" do
-- Contrato 360 mostra os itens da Fiscalização (o cadastro manual de entregas previstas sai das telas; a lista
-- contrato_entregas_previstas nunca teve linha) e o aviso "nota não chegou" passa a valer 10 dias depois da entrega
-- registrada pelo fiscal.
--
-- fisc_entregas_para_pagamento(contrato | NULL, janela em dias): itens acompanhados pela SFC/CGLIC, por contrato × situação × data:
--   A_ENTREGAR  ainda não entregues, com data prevista;
--   ENTREGUE    entregues na janela (regra "pagamento.avisoEntregaJanelaDias" da tela Regras e alertas, 120 dias) e ainda antes do envio para pagamento (Entregue, recebimento provisório
--               ou definitivo), sem pagamento registrado.
-- Valor = quantidade × valor unitário do item no contrato (o mesmo da migration 304). Leitura para usuários ativos.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fisc_entregas_para_pagamento(p_contrato TEXT DEFAULT NULL, p_janela_dias INTEGER DEFAULT 120)
RETURNS TABLE (contract_key TEXT, situacao TEXT, data DATE, itens INTEGER, valor NUMERIC, sem_preco INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
BEGIN
  IF public.usuario_ativo() IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Faça login.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.contract_key::TEXT,
         CASE WHEN e.entregue_em IS NULL THEN 'A_ENTREGAR' ELSE 'ENTREGUE' END,
         COALESCE(e.entregue_em, e.prevista),
         count(*)::INTEGER,
         COALESCE(sum(e.quantidade * l.valor_unitario_api), 0)::NUMERIC,
         count(*) FILTER (WHERE l.valor_unitario_api IS NULL)::INTEGER
    FROM public.fisc_entregas e
    LEFT JOIN public.arp_item_contract_links l ON l.contract_key = e.contract_key AND l.item_key = e.item_key
    LEFT JOIN public.emenda_linha_notas n ON n.linha_id = e.emenda_linha_id
   WHERE e.encerrada_em IS NULL AND e.responsavel = 'SFC'
     AND (p_contrato IS NULL OR e.contract_key = p_contrato)
     AND (
       (e.entregue_em IS NULL AND e.prevista IS NOT NULL)
       OR (e.entregue_em >= v_hoje - LEAST(GREATEST(COALESCE(p_janela_dias, 120), 1), 730) AND e.etapa IN ('ENTREGUE', 'TRP', 'TRD') AND n.pago_em IS NULL)
     )
   GROUP BY 1, 2, 3;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_entregas_para_pagamento(TEXT, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_para_pagamento(TEXT, INTEGER) TO authenticated;
