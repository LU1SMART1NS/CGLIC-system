-- ==============================================================================
-- Versão: 20261111000273_fiscalizacao_avancar_voltar.sql
-- Etapa do item da Fiscalização no mesmo jeito do pedido de emenda (protótipo aprovado em 11/11/2026):
--
-- 1) Histórico ganha VOLTA (voltou um passo, com motivo), DESFEITO (o passo que a volta desfez, riscado na tela) e
--    CORRECAO (o coordenador corrigiu a etapa). Mantém os tipos de antes, inclusive BENEFICIARIO (migration 272).
-- 2) fisc_proximas_etapas: para onde o item pode ir a partir de cada etapa (as mesmas regras de
--    src/utils/fiscalizacaoPassos.ts). Depois da produção o caminho se divide; Pagamento só segue depois de pago.
-- 3) mudar_etapa_entregas passa a aceitar só o próximo passo. A gravação sai para fisc_aplicar_etapa (interna),
--    usada também pela correção.
-- 4) corrigir_etapa_entregas: só o coordenador; pula ou volta várias etapas, com motivo de 10 letras ou mais.
-- 5) voltar_etapa_entrega: desfaz só o último passo do item, com motivo. Não volta: item da área requisitante, nota
--    já paga, etapa que veio da carga sem passo anterior, e Informação/Ordem do pedido de emenda (a sincronização com
--    o pedido avançaria o item de novo; a correção é no pedido).
-- ==============================================================================

-- 1) Tipos do histórico ---------------------------------------------------------------------------------------
ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT IF EXISTS fisc_entrega_movimentos_tipo;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo
  CHECK (tipo IN ('CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA', 'PROGRAMA', 'ITEM', 'BENEFICIARIO',
                  'VOLTA', 'DESFEITO', 'CORRECAO'));

-- 2) Próximos passos ------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_proximas_etapas(p_etapa TEXT, p_pago BOOLEAN, p_emenda BOOLEAN)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_etapa
    WHEN 'INFO_PEDIDA'  THEN ARRAY['INFO_ENVIADA']
    WHEN 'INFO_ENVIADA' THEN ARRAY['ORDEM']
    WHEN 'ORDEM'        THEN ARRAY['PRODUCAO']
    WHEN 'PRODUCAO'     THEN ARRAY['TRANSITO', 'RETIRADA', 'CONTROLADO', 'ENTREGUE']
    WHEN 'CONTROLADO'   THEN ARRAY['TRANSITO', 'RETIRADA', 'ENTREGUE']
    WHEN 'TRANSITO'     THEN ARRAY['ENTREGUE']
    WHEN 'RETIRADA'     THEN ARRAY['ENTREGUE']
    WHEN 'ENTREGUE'     THEN ARRAY['TRP']
    WHEN 'TRP'          THEN ARRAY['TRD']
    WHEN 'TRD'          THEN ARRAY['PAGAMENTO']
    WHEN 'PAGAMENTO'    THEN CASE WHEN NOT COALESCE(p_pago, FALSE) THEN ARRAY[]::TEXT[]
                                  WHEN COALESCE(p_emenda, FALSE) THEN ARRAY['SAL'] ELSE ARRAY['FINALIZADO'] END
    WHEN 'SAL'          THEN ARRAY['FINALIZADO']
    ELSE ARRAY[]::TEXT[]
  END;
$$;
REVOKE ALL ON FUNCTION public.fisc_proximas_etapas(TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_proximas_etapas(TEXT, BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- 3) Gravação da etapa (interna): as regras de sempre, a etapa, o histórico e a Informação/Ordem no pedido ----------
CREATE OR REPLACE FUNCTION public.fisc_aplicar_etapa(p_ids UUID[], p_etapa TEXT, p_data DATE, p_documento_sei TEXT, p_observacao TEXT,
                                                    p_tipo TEXT, p_so_proximo BOOLEAN)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sei   TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI');
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_obs   TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_hoje  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  e       RECORD;
  v_n     INTEGER := 0;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF public.fisc_ordem_da_etapa(p_etapa) IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Etapa desconhecida.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR p_data > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data (até hoje).' USING ERRCODE = '22023';
  END IF;
  IF p_etapa IN ('INFO_ENVIADA', 'ORDEM', 'TRP', 'TRD', 'PAGAMENTO', 'SAL') AND v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Esta etapa tem documento: informe o número SEI.' USING ERRCODE = '22023';
  END IF;

  FOR e IN
    SELECT x.*, n.pago_em, l.pedido_id
      FROM public.fisc_entregas x
      LEFT JOIN public.emenda_linha_notas n ON n.linha_id = x.emenda_linha_id
      LEFT JOIN public.emenda_pedido_linhas l ON l.id = x.emenda_linha_id
     WHERE x.id = ANY (p_ids)
  LOOP
    IF e.responsavel = 'AREA' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Entrega da área requisitante não tem etapa na SFC/CGLIC.' USING ERRCODE = '22023';
    END IF;
    IF p_so_proximo AND NOT (p_etapa = ANY (public.fisc_proximas_etapas(e.etapa, e.pago_em IS NOT NULL,
                                                                        e.origem = 'EMENDA' OR e.emenda_linha_id IS NOT NULL OR e.emenda_texto IS NOT NULL))) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Esta etapa não é o próximo passo do item. Para pular ou voltar etapas, o coordenador usa "Corrigir a etapa".'
        USING ERRCODE = '22023';
    END IF;
    IF p_etapa IN ('PAGAMENTO', 'SAL', 'FINALIZADO') AND e.entregue_em IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Registre a entrega antes do envio para pagamento e doação.' USING ERRCODE = '22023';
    END IF;
    IF p_etapa IN ('SAL', 'FINALIZADO') AND e.origem = 'EMENDA' AND e.pago_em IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O Ofício à SAL e o fim da fiscalização vêm depois do pagamento (a nota ainda não foi paga).' USING ERRCODE = '22023';
    END IF;
    IF p_etapa = 'SAL' AND e.emenda_linha_id IS NULL AND e.emenda_texto IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Ofício à SAL só em entrega de emenda.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.fisc_entregas
       SET etapa = p_etapa, etapa_em = p_data,
           entregue_em = CASE WHEN p_etapa = 'ENTREGUE' THEN p_data
                              WHEN public.fisc_ordem_da_etapa(p_etapa) < public.fisc_ordem_da_etapa('ENTREGUE') THEN NULL
                              ELSE entregue_em END,
           atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = e.id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, etapa, data, documento_sei, observacao, criado_por, criado_por_nome)
    VALUES (e.id, p_tipo, p_etapa, p_data, v_sei, v_obs, auth.uid(), v_nome);

    -- A Ordem e a Informação da SFC/CGLIC numa entrega de emenda são as mesmas do pedido (migrations 262 e 271).
    IF p_etapa = 'ORDEM' AND e.pedido_id IS NOT NULL THEN
      INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, ordem_em, ordem_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
      VALUES (e.pedido_id, e.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
      ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
        SET ordem_em = EXCLUDED.ordem_em, ordem_documento_sei = EXCLUDED.ordem_documento_sei,
            atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    END IF;
    IF p_etapa = 'INFO_ENVIADA' AND e.pedido_id IS NOT NULL THEN
      INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, informacao_em, informacao_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
      VALUES (e.pedido_id, e.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
      ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
        SET informacao_em = EXCLUDED.informacao_em, informacao_documento_sei = EXCLUDED.informacao_documento_sei,
            atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_aplicar_etapa(UUID[], TEXT, DATE, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_aplicar_etapa(UUID[], TEXT, DATE, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

-- Avançar: só o próximo passo (mesma assinatura e permissões de antes).
CREATE OR REPLACE FUNCTION public.mudar_etapa_entregas(p_ids UUID[], p_etapa TEXT, p_data DATE, p_documento_sei TEXT, p_observacao TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n INTEGER;
BEGIN
  v_n := public.fisc_aplicar_etapa(p_ids, p_etapa, p_data, p_documento_sei, p_observacao, 'ETAPA', TRUE);
  RETURN jsonb_build_object('entregas', v_n, 'etapa', p_etapa);
END;
$$;

-- 4) Corrigir (só o coordenador) ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corrigir_etapa_entregas(p_ids UUID[], p_etapa TEXT, p_data DATE, p_documento_sei TEXT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_n      INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador corrige a etapa.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo da correção (10 letras ou mais).' USING ERRCODE = '22023';
  END IF;
  v_n := public.fisc_aplicar_etapa(p_ids, p_etapa, p_data, p_documento_sei, left(v_motivo, 1000), 'CORRECAO', FALSE);
  RETURN jsonb_build_object('entregas', v_n, 'etapa', p_etapa);
END;
$$;
REVOKE ALL ON FUNCTION public.corrigir_etapa_entregas(UUID[], TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.corrigir_etapa_entregas(UUID[], TEXT, DATE, TEXT, TEXT) TO authenticated;

-- 5) Voltar um passo ------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.voltar_etapa_entrega(p_id UUID, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo   TEXT := btrim(COALESCE(p_motivo, ''));
  v_nome     TEXT := left(public.nome_do_usuario_logado(), 200);
  v_hoje     DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  e          RECORD;
  v_atual    public.fisc_entrega_movimentos%ROWTYPE;
  v_anterior public.fisc_entrega_movimentos%ROWTYPE;
BEGIN
  PERFORM public.fisc_conferir_entregas(ARRAY[p_id]);
  IF char_length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo (10 letras ou mais).' USING ERRCODE = '22023';
  END IF;
  SELECT x.*, n.pago_em INTO e
    FROM public.fisc_entregas x LEFT JOIN public.emenda_linha_notas n ON n.linha_id = x.emenda_linha_id
   WHERE x.id = p_id;
  IF e.responsavel = 'AREA' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Item da área requisitante não tem etapa na SFC/CGLIC.' USING ERRCODE = '22023';
  END IF;
  IF e.etapa = 'PAGAMENTO' AND e.pago_em IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A nota já foi paga: a etapa não volta. Se o registro está errado, peça ao coordenador para corrigir.' USING ERRCODE = '22023';
  END IF;
  IF e.etapa IN ('INFO_ENVIADA', 'ORDEM') AND e.emenda_linha_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A Informação e a Ordem deste item estão também no pedido de emenda: a correção é no Pedido 360.' USING ERRCODE = '22023';
  END IF;

  -- Os passos do item, do mais novo ao mais velho; o atual é o mais novo com a etapa de hoje.
  SELECT * INTO v_atual FROM public.fisc_entrega_movimentos
   WHERE entrega_id = p_id AND etapa = e.etapa AND tipo IN ('ETAPA', 'CARGA', 'CRIADA', 'AUTOMATICA', 'CORRECAO')
   ORDER BY criado_em DESC, id DESC LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_anterior FROM public.fisc_entrega_movimentos
     WHERE entrega_id = p_id AND etapa IS NOT NULL AND etapa <> e.etapa AND tipo IN ('ETAPA', 'CARGA', 'CRIADA', 'AUTOMATICA', 'CORRECAO')
       AND (criado_em, id) < (v_atual.criado_em, v_atual.id)
     ORDER BY criado_em DESC, id DESC LIMIT 1;
  END IF;
  IF v_anterior.id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Não há passo anterior registrado para voltar. Se a etapa está errada, peça ao coordenador para corrigir.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fisc_entregas
     SET etapa = v_anterior.etapa, etapa_em = COALESCE(v_anterior.data, v_hoje),
         entregue_em = CASE WHEN public.fisc_ordem_da_etapa(v_anterior.etapa) < public.fisc_ordem_da_etapa('ENTREGUE') THEN NULL ELSE entregue_em END,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id;
  UPDATE public.fisc_entrega_movimentos SET tipo = 'DESFEITO' WHERE id = v_atual.id;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, etapa, data, observacao, criado_por, criado_por_nome)
  VALUES (p_id, 'VOLTA', v_anterior.etapa, v_hoje, left(v_motivo, 1000), auth.uid(), v_nome);
  RETURN jsonb_build_object('etapa', v_anterior.etapa, 'desfeito', v_atual.etapa);
END;
$$;
REVOKE ALL ON FUNCTION public.voltar_etapa_entrega(UUID, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.voltar_etapa_entrega(UUID, TEXT) TO authenticated;
