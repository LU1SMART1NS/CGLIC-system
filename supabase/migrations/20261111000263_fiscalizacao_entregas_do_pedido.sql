-- ==============================================================================
-- MIGRATION 263: FISCALIZAÇÃO — ENTREGAS DO PEDIDO DE EMENDA (régua do Pedido 360)
-- Versão: 20261111000263_fiscalizacao_entregas_do_pedido.sql
--
-- Protótipo aprovado em 10/11/2026: o quadro "Onde está cada item" do Pedido 360 mostra os passos da Fiscalização
-- (Informações · Ordem · Produção · Entregue · Recebido · Ofício à SAL). O gestor de emendas só lê (D8).
--
-- fisc_entregas_do_pedido(pedido): as entregas das linhas do pedido (uma linha pode ter várias, entrega parcial),
-- com etapa, datas e quem fiscaliza. Quem não lê a fiscalização recebe a lista vazia (a régua cai para as notas).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fisc_entregas_do_pedido(p_pedido UUID)
RETURNS TABLE (
  id               UUID,
  linha_id         UUID,
  contract_key     TEXT,
  quantidade       INTEGER,
  responsavel      TEXT,
  etapa            TEXT,
  etapa_em         DATE,
  prevista         DATE,
  entregue_em      DATE,
  dividida_de      UUID,
  fiscal_nome      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.id, e.emenda_linha_id, e.contract_key::TEXT, e.quantidade, e.responsavel::TEXT, e.etapa::TEXT, e.etapa_em, e.prevista,
         e.entregue_em, e.dividida_de, f.fiscal_nome::TEXT
    FROM public.fisc_entregas e
    JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
    JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
   WHERE l.pedido_id = p_pedido
     AND public.has_permission('fiscalizacao.view') IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.fisc_entregas_do_pedido(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_do_pedido(UUID) TO authenticated;
