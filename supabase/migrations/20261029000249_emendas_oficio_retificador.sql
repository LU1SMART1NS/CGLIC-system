-- ==============================================================================
-- Ofício retificador (protótipo aprovado em 29/10/2026, D1–D7) — entrega 1: antes do empenho
--
-- A caixa "Ofício retificador" saiu das telas. O retificador reabre o pedido inteiro: a CAEP ajusta os itens ao novo
-- ofício e confirma que a soma dos itens bate com ele; o valor do ofício não é mais digitado. O ofício anterior fica
-- no histórico do pedido (emenda_pedido_movimentos, ação RETIFICADOR, com o SEI, o valor e os itens de antes).
--
-- 1) emenda_pedido_movimentos aceita a ação RETIFICADOR.
-- 2) trg_emendas_conferencia_preco não vale para o retificador: ele não responde à minuta (o prazo e o preço da minuta
--    são do primeiro ofício); os itens novos entram pelo preço de hoje.
-- 3) registrar_oficio_retificador: de "Conferido no SIOP" até "Enviado à CGOFI". Com itens mudados, o pedido volta para
--    "Conferido no SIOP" (a solicitação de empenho é refeita); a conferência no SIOP continua valendo. Depois do empenho
--    o retificador fica para a entrega 2 (o item empenhado não desce; o aumento vira item novo para empenho complementar).
-- ==============================================================================

-- 1) Histórico ---------------------------------------------------------------------------------------------------
ALTER TABLE public.emenda_pedido_movimentos DROP CONSTRAINT IF EXISTS emenda_pedido_movimentos_acao;
ALTER TABLE public.emenda_pedido_movimentos ADD CONSTRAINT emenda_pedido_movimentos_acao
  CHECK (acao IN ('ENVIO_CCGA', 'DEVOLUCAO_CCGA', 'DESFEITO_CCGA', 'VOLTOU_ETAPA', 'RETIFICADOR'));
COMMENT ON TABLE public.emenda_pedido_movimentos IS
  'Vai e volta do pedido com a CCGA, etapas voltadas pela CAEP e ofícios retificadores, com o motivo e o que foi substituído (migrations 248 e 249). Grava só pelas RPCs.';

-- 2) A conferência pelo preço da minuta não vale para o retificador ----------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_emendas_conferencia_preco()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mudou TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.etapa <> 'CONFERIDO' OR OLD.etapa <> 'OFICIO' THEN
    RETURN NEW;
  END IF;
  -- Migration 249: o retificador volta o pedido a "Conferido no SIOP" sem responder à minuta.
  IF COALESCE(current_setting('emendas.retificador', true), '') = 'sim' THEN
    RETURN NEW;
  END IF;
  IF NEW.minuta_valida_ate IS NOT NULL AND NEW.oficio_em IS NOT NULL AND NEW.oficio_em > NEW.minuta_valida_ate THEN
    RAISE EXCEPTION 'PRAZO_DO_OFICIO: O ofício chegou em %, depois do prazo de %. Gere uma nova minuta com o preço do dia.',
      to_char(NEW.oficio_em, 'DD/MM/YYYY'), to_char(NEW.minuta_valida_ate, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;
  IF NEW.minuta_precos IS NOT NULL THEN
    SELECT string_agg(DISTINCT split_part(c.item_key, '-', 1), ', ') INTO v_mudou
      FROM public.emenda_pedido_linhas l
      CROSS JOIN LATERAL public.emendas_itens_da_linha(l.tipo, l.item_key, l.kit_composicao) k
      JOIN public.v_emendas_itens_caep c ON c.item_key = k
     WHERE l.pedido_id = NEW.id AND NOT l.cancelada
       AND NEW.minuta_precos ? k
       AND round((NEW.minuta_precos->>k)::NUMERIC, 2) <> round(c.valor_unitario, 2);
    IF v_mudou IS NOT NULL THEN
      RAISE EXCEPTION 'PRECO_MUDOU: O preço mudou depois da minuta (ata %). Gere uma nova minuta com o preço do dia.', v_mudou USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_conferencia_preco() FROM PUBLIC, anon, authenticated;

-- 3) Registrar o ofício retificador ------------------------------------------------------------------------------
-- p_dados: documento_sei (do retificador), data (recebido em), valor_oficio (a soma dos itens que a CAEP confirmou) e
-- ajustes (texto de cada ajuste, para o histórico). p_linhas: as linhas ajustadas, como em salvar_pedido_emenda; NULL =
-- o retificador não mudou os itens.
CREATE OR REPLACE FUNCTION public.registrar_oficio_retificador(p_id UUID, p_versao INTEGER, p_dados JSONB, p_linhas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p       RECORD;
  v_d       JSONB := COALESCE(p_dados, '{}'::jsonb);
  v_nome    TEXT;
  v_data    DATE;
  v_sei     TEXT;
  v_valor   NUMERIC;
  v_anterior TEXT;
  v_antes   JSONB;
  v_ajustes TEXT;
  v_salvo   JSONB;
  v_etapa   TEXT;
  v_versao  INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram o ofício retificador.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa NOT IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: %', CASE
      WHEN v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') THEN 'O retificador de pedido já empenhado ainda não pode ser registrado aqui.'
      WHEN v_p.etapa = 'CANCELADO' THEN 'O pedido está cancelado.'
      ELSE 'Antes da conferência, o ofício mais novo é o que se confere.' END USING ERRCODE = '22023';
  END IF;

  v_sei := regexp_replace(COALESCE(v_d->>'documento_sei', ''), '\D', '', 'g');
  IF v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o documento SEI do retificador (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
  END IF;
  v_anterior := COALESCE(v_p.oficio_valor_documento_sei, v_p.oficio_documento_sei);
  IF v_sei = v_anterior THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o SEI % já é o do ofício que vale. Informe o SEI do retificador.', v_sei USING ERRCODE = '22023';
  END IF;
  v_data := COALESCE(NULLIF(v_d->>'data', '')::DATE, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
  IF v_data > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a data do retificador não pode ser futura.' USING ERRCODE = '22023';
  END IF;
  v_valor := NULLIF(v_d->>'valor_oficio', '')::NUMERIC;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: confira a soma dos itens com o retificador.' USING ERRCODE = '22023';
  END IF;

  -- O que o retificador substitui: o ofício, o valor e os itens de antes.
  SELECT jsonb_agg(jsonb_build_object('id', l.id, 'tipo', l.tipo, 'item_key', l.item_key, 'kit_id', l.kit_id,
                                      'quantidade', l.quantidade, 'beneficiario_id', l.beneficiario_id) ORDER BY l.ordem)
    INTO v_antes
    FROM public.emenda_pedido_linhas l
   WHERE l.pedido_id = p_id AND NOT l.cancelada;
  IF jsonb_typeof(v_d->'ajustes') = 'array' THEN
    SELECT string_agg(x, '; ') INTO v_ajustes FROM jsonb_array_elements_text(v_d->'ajustes') x WHERE btrim(x) <> '';
  END IF;

  PERFORM set_config('emendas.retificador', 'sim', true);
  v_versao := p_versao;
  IF p_linhas IS NOT NULL THEN
    v_salvo := public.salvar_pedido_emenda(jsonb_build_object(
      'id', p_id, 'versao', p_versao, 'autor_id', v_p.autor_id, 'observacao', v_p.observacao,
      'contato_nome', v_p.contato_nome, 'contato_telefone', v_p.contato_telefone, 'contato_email', v_p.contato_email,
      'motivo', 'Ajustado ao ofício retificador SEI ' || v_sei, 'linhas', p_linhas));
    v_versao := (v_salvo->>'versao')::INTEGER;
  END IF;

  -- Itens mudados: salvar_pedido_emenda voltou o pedido ao ofício; a conferência no SIOP continua valendo, então ele
  -- volta para "Conferido no SIOP" e a solicitação de empenho é refeita.
  SELECT etapa INTO v_etapa FROM public.emenda_pedidos WHERE id = p_id;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  UPDATE public.emenda_pedidos SET
    etapa = CASE WHEN etapa = 'OFICIO' THEN 'CONFERIDO' ELSE etapa END,
    siop_conferencia = CASE WHEN etapa = 'OFICIO' THEN v_p.siop_conferencia ELSE siop_conferencia END,
    conferido_em = CASE WHEN etapa = 'OFICIO' THEN v_p.conferido_em ELSE conferido_em END,
    oficio_valor = v_valor, oficio_valor_documento_sei = v_sei, oficio_valor_retificador = TRUE,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = p_id AND versao = v_versao
  RETURNING etapa, versao INTO v_etapa, v_versao;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  PERFORM set_config('emendas.retificador', '', true);

  INSERT INTO public.emenda_pedido_movimentos (pedido_id, acao, etapa_de, etapa_para, documento_sei, motivo, explicacao, apagado, data, criado_por, criado_por_nome)
  VALUES (p_id, 'RETIFICADOR', v_p.etapa, v_etapa, v_sei,
          left('Substitui o ofício' || COALESCE(' SEI ' || v_anterior, '') || COALESCE(' (R$ ' || replace(to_char(v_p.oficio_valor, 'FM999999999990.00'), '.', ',') || ')', ''), 200),
          v_ajustes,
          jsonb_build_object('oficio_documento_sei', v_anterior, 'oficio_valor', v_p.oficio_valor,
                             'oficio_valor_retificador', v_p.oficio_valor_retificador, 'etapa', v_p.etapa, 'linhas', COALESCE(v_antes, '[]'::jsonb)),
          v_data, auth.uid(), v_nome);

  RETURN jsonb_build_object('id', p_id, 'versao', v_versao, 'etapa', v_etapa);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_oficio_retificador(UUID, INTEGER, JSONB, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_oficio_retificador(UUID, INTEGER, JSONB, JSONB) TO authenticated;
COMMENT ON FUNCTION public.registrar_oficio_retificador(UUID, INTEGER, JSONB, JSONB) IS
  'Ofício retificador antes do empenho (migration 249): ajusta os itens, grava a soma conferida como valor do ofício e guarda o ofício anterior no histórico.';
