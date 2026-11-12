-- ==============================================================================
-- MIGRATION 245: EMENDAS PARLAMENTARES — INFORMAÇÕES PARA A ORDEM DE FORNECIMENTO
-- Versão: 20261029000245_emendas_ordem_fornecimento.sql
--
-- Pedido do usuário em 29/10/2026: a fase Execução do andamento do pedido começa com "Reunir as informações para a
-- Ordem de Fornecimento". Decisões: quem faz é a CAEP; a tarefa abre com o contrato assinado; fecha quando a CAEP
-- registra a data e o documento SEI. Não é etapa do pedido (como o contrato, a entrega e o pagamento): a etapa não muda.
--
-- 1) emenda_pedidos.ordem_fornecimento_em e ordem_fornecimento_documento_sei.
-- 2) registrar_ordem_fornecimento(pedido, documento SEI, data): grava (ou corrige) os dois, só com o pedido em
--    "Enviado para contratação". Só o gestor de emendas e o coordenador (emendas.manage).
-- ==============================================================================

-- 1) Colunas ------------------------------------------------------------------------
ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS ordem_fornecimento_em DATE;
ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS ordem_fornecimento_documento_sei VARCHAR(10);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_pedidos_ordem_fornecimento_sei') THEN
    ALTER TABLE public.emenda_pedidos ADD CONSTRAINT emenda_pedidos_ordem_fornecimento_sei
      CHECK (ordem_fornecimento_documento_sei IS NULL OR ordem_fornecimento_documento_sei ~ '^[0-9]{7,10}$');
  END IF;
END $$;
COMMENT ON COLUMN public.emenda_pedidos.ordem_fornecimento_em IS
  'Data em que a CAEP concluiu as informações para a emissão da Ordem de Fornecimento (migration 245).';
COMMENT ON COLUMN public.emenda_pedidos.ordem_fornecimento_documento_sei IS
  'Documento SEI com as informações para a emissão da Ordem de Fornecimento (migration 245).';

-- 2) Registrar ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_ordem_fornecimento(p_id UUID, p_documento_sei TEXT, p_data DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_sei    TEXT := regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g');
  v_hoje   DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram as etapas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.etapa <> 'CONTRATACAO' THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: As informações da Ordem de Fornecimento vêm depois do envio para contratação.' USING ERRCODE = '22023';
  END IF;
  IF v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Documento SEI: só números, 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data.' USING ERRCODE = '22023';
  END IF;
  IF p_data > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data não pode ser depois de hoje.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos
     SET ordem_fornecimento_em = p_data, ordem_fornecimento_documento_sei = v_sei,
         versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = left(public.nome_do_usuario_logado(), 200), atualizado_em = NOW()
   WHERE id = p_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao, 'documento_sei', v_sei);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_ordem_fornecimento(UUID, TEXT, DATE) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_ordem_fornecimento(UUID, TEXT, DATE) TO authenticated;
