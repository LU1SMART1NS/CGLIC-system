-- ==============================================================================
-- Emendas: excluir kit que nenhum pedido usa (29/10/2026)
-- ==============================================================================
-- Até aqui o kit só se desativava. Kit que nunca entrou num pedido pode ser excluído de vez (a composição
-- sai junto, emenda_kit_itens tem ON DELETE CASCADE). Kit em qualquer pedido, mesmo cancelado, só se desativa:
-- a linha do pedido guarda o kit (emenda_pedido_linhas.kit_id, sem ON DELETE).
-- ==============================================================================

-- p_versao: a versão que a tela mostrou; se outra pessoa alterou o kit depois, recusa.
CREATE OR REPLACE FUNCTION public.excluir_kit_emenda(p_id UUID, p_versao INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kit     public.emenda_kits%ROWTYPE;
  v_pedidos INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador excluem kits.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_kit FROM public.emenda_kits WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Kit não encontrado. Recarregue a tela.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_kit.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este kit. Recarregue e confira antes de excluir.' USING ERRCODE = '40001';
  END IF;

  SELECT count(DISTINCT pedido_id) INTO v_pedidos FROM public.emenda_pedido_linhas WHERE kit_id = p_id;
  IF v_pedidos > 0 THEN
    RAISE EXCEPTION 'EM_USO: % está em % pedido(s) e não pode ser excluído. Desative o kit para tirá-lo da lista dos pedidos.',
      v_kit.nome, v_pedidos USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.emenda_kits WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_kit_emenda(UUID, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_kit_emenda(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.excluir_kit_emenda(UUID, INTEGER) IS
  'Exclui o kit que nenhum pedido usa (emendas.manage). Kit em pedido só se desativa por salvar_kit_emenda.';
