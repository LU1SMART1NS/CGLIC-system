-- Reserva do parlamentar ligada à emenda sem pedido (pedido do usuário de 29/10/2026).
--
-- A emenda registrada do SIOP só se ligava ao pedido de dois jeitos: pedido criado a partir dela ("Criar pedido com
-- esta emenda") ou nº digitado na conferência com o SIOP. A reserva feita antes, sem o nº, deixava a emenda no aviso de
-- "sem pedido" mesmo com a reserva do mesmo parlamentar. Agora a tela sugere a reserva e a CAEP (ou o coordenador)
-- confirma: o pedido fica como se tivesse nascido da emenda (emenda_id), ganha o número no ano (gatilho da migration 217)
-- e a conferência com o SIOP continua na etapa do pedido; nº diferente nela desliga, como antes (migration 206).

CREATE OR REPLACE FUNCTION public.ligar_reserva_a_emenda(p_pedido_id UUID, p_versao INTEGER, p_emenda_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_e      RECORD;
  v_nome   TEXT;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador ligam reservas às emendas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e tente de novo.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa = 'CANCELADO' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido está cancelado.' USING ERRCODE = '22023';
  END IF;
  IF v_p.emenda_id IS NOT NULL OR v_p.siop_emenda IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido já tem emenda. Para trocar, corrija o nº na conferência com o SIOP.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_e FROM public.emendas_siop WHERE id = p_emenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Emenda não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.autor_id IS DISTINCT FROM v_e.autor_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a reserva é de outro parlamentar.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);
  UPDATE public.emenda_pedidos
     SET emenda_id = p_emenda_id, versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_pedido_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_pedido_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.ligar_reserva_a_emenda(UUID, INTEGER, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ligar_reserva_a_emenda(UUID, INTEGER, UUID) TO authenticated;
