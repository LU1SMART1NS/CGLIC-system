-- ==============================================================================
-- MIGRATION 163: EMENDAS PARLAMENTARES — RESERVA PARA UM ÓRGÃO (PARLAMENTAR A DEFINIR)
-- Versão: 20261023000163_emendas_reserva_para_orgao.sql
--
-- Decisão de 23/10/2026: a CAEP também separa itens a pedido de um órgão (o beneficiário final), antes de haver
-- parlamentar. Caso real da planilha de saldo: coluna "CBMERJ", 10 furgões de resgate (ata 00019/2025, item 4),
-- reservados ao Corpo de Bombeiros do RJ enquanto a CAEP procura quem faça a emenda.
--
-- 1) emenda_pedidos.autor_id passa a aceitar vazio, só enquanto o pedido está Reservado (ou foi cancelado assim):
--    a minuta vai ao gabinete e o ofício vem do parlamentar, então para avançar o autor tem de estar indicado.
-- 2) salvar_pedido_emenda:
--    - reserva nova com "para_orgao": true nasce sem autor; todas as linhas precisam de beneficiário;
--    - reserva sem autor recebe o autor depois (autor_id no salvar), uma vez só; quem tem autor não troca.
-- 3) Gatilho com mensagem clara quando alguém tenta avançar a reserva sem autor (a RPC de etapas da 157 não muda).
--
-- Nada que já existe muda: todos os pedidos de hoje têm autor.
-- ==============================================================================

ALTER TABLE public.emenda_pedidos ALTER COLUMN autor_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_pedidos_autor_a_definir') THEN
    ALTER TABLE public.emenda_pedidos
      ADD CONSTRAINT emenda_pedidos_autor_a_definir CHECK (autor_id IS NOT NULL OR etapa IN ('RESERVADO', 'CANCELADO'));
  END IF;
END $$;

COMMENT ON COLUMN public.emenda_pedidos.autor_id IS
  'Parlamentar ou bancada. Vazio = reserva para um órgão (beneficiário final) com o parlamentar a definir; só em Reservado.';

-- Mensagem clara ao avançar uma reserva sem autor (a restrição acima é a garantia; isto é a explicação).
CREATE OR REPLACE FUNCTION public.trg_emendas_autor_para_avancar()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.autor_id IS NULL AND NEW.etapa NOT IN ('RESERVADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'AUTOR_A_DEFINIR: Indique o parlamentar ou a bancada antes de registrar a minuta ou o ofício.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_autor_para_avancar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_emendas_autor_para_avancar ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_autor_para_avancar
  BEFORE UPDATE OF etapa ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_autor_para_avancar();

-- p_pedido: { id?, versao? (obrigatória ao alterar), autor_id?, para_orgao?, observacao, contato_nome?, contato_telefone?,
--   contato_email?, motivo? (das linhas tiradas), linhas: [{ id?, tipo: ITEM|KIT, item_key | kit_id, quantidade, beneficiario_id? }] }.
-- Novo pedido nasce Reservado: com autor_id, ou sem autor quando para_orgao = true (aí toda linha tem beneficiário).
-- Reserva sem autor recebe o autor_id depois; pedido com autor não troca de autor. Alterar itens/quantidades de pedido
-- já conferido no SIOP ou com empenho autorizado volta o pedido para "Ofício recebido". Empenhado ou cancelado não muda.
CREATE OR REPLACE FUNCTION public.salvar_pedido_emenda(p_pedido JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id     UUID;
  v_autor  TEXT;
  v_orgao  BOOLEAN;
  v_nome   TEXT;
  v_atual  RECORD;
  v_mudou  BOOLEAN;
  v_versao INTEGER;
  v_numero INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram pedidos.' USING ERRCODE = '42501';
  END IF;
  IF p_pedido IS NULL OR jsonb_typeof(p_pedido) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(p_pedido->>'id', '')::UUID;
  v_autor := NULLIF(btrim(COALESCE(p_pedido->>'autor_id', '')), '');
  v_orgao := COALESCE((p_pedido->>'para_orgao')::BOOLEAN, FALSE);
  IF v_autor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emenda_autores WHERE id = v_autor) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: autor não encontrado.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF v_autor IS NULL AND NOT v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar ou a bancada, ou marque a reserva para um órgão.' USING ERRCODE = '22023';
    END IF;
    IF v_autor IS NOT NULL AND v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: reserva para um órgão não tem parlamentar.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedidos (autor_id, observacao, contato_nome, contato_telefone, contato_email, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_autor, NULLIF(btrim(p_pedido->>'observacao'), ''), NULLIF(btrim(p_pedido->>'contato_nome'), ''),
            NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''), NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao, numero INTO v_id, v_versao, v_numero;
    PERFORM public.emendas_gravar_linhas(v_id, p_pedido->'linhas', NULL);
    IF v_autor IS NULL AND EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = v_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: na reserva para um órgão, todas as linhas precisam do beneficiário.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
  END IF;

  SELECT * INTO v_atual FROM public.emenda_pedidos WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (p_pedido->>'versao')::INTEGER IS DISTINCT FROM v_atual.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_atual.etapa IN ('EMPENHADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Pedido % não pode ser alterado.', CASE v_atual.etapa WHEN 'EMPENHADO' THEN 'empenhado' ELSE 'cancelado' END USING ERRCODE = '22023';
  END IF;
  IF v_autor IS NOT NULL AND v_atual.autor_id IS NOT NULL AND v_autor <> v_atual.autor_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o autor do pedido não muda. Cancele e faça uma nova reserva.' USING ERRCODE = '22023';
  END IF;

  v_mudou := public.emendas_gravar_linhas(v_id, p_pedido->'linhas', p_pedido->>'motivo');
  IF COALESCE(v_autor, v_atual.autor_id) IS NULL
     AND EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = v_id AND NOT cancelada AND beneficiario_id IS NULL AND beneficiario_nome IS NULL) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: na reserva para um órgão, todas as linhas precisam do beneficiário.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET
    autor_id = COALESCE(autor_id, v_autor),
    observacao = NULLIF(btrim(p_pedido->>'observacao'), ''),
    contato_nome = NULLIF(btrim(p_pedido->>'contato_nome'), ''),
    contato_telefone = NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''),
    contato_email = NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
    etapa = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN 'OFICIO' ELSE etapa END,
    siop_conferencia = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN NULL ELSE siop_conferencia END,
    conferido_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN NULL ELSE conferido_em END,
    autorizado_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN NULL ELSE autorizado_em END,
    autorizado_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN NULL ELSE autorizado_documento_sei END,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao, numero INTO v_versao, v_numero;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_pedido_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_pedido_emenda(JSONB) TO authenticated;
