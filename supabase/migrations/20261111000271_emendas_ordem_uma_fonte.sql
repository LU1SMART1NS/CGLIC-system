-- ==============================================================================
-- Versão: 20261111000271_emendas_ordem_uma_fonte.sql
-- Ordem de Fornecimento numa fonte só: emenda_pedido_ordens (por pedido × contrato, migration 250).
--
-- 1) mudar_etapa_entregas (Fiscalização): a Informação para a Ordem (etapa INFO_ENVIADA) numa entrega de emenda passa
--    a ir também ao pedido, como a Ordem já ia. O caminho contrário (pedido → entregas) já existe em
--    fisc_criar_entregas_do_contrato.
-- 2) Sai o registro único da migration 245, que nenhum pedido usou: as colunas emenda_pedidos.ordem_fornecimento_em
--    e ordem_fornecimento_documento_sei e a RPC registrar_ordem_fornecimento. A migration 250 previa esta limpeza
--    "depois que o código deixar de lê-las" (PR desta migration). A tela lê emenda_pedidos com select(*), então a
--    versão publicada antes do PR continua funcionando sem as colunas.
-- Achado 1.3 da auditoria de informação duplicada (docs/estudos/auditoria-duplicacao-modulos.md).
-- ==============================================================================

-- 1) Informação da Fiscalização chega ao pedido -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mudar_etapa_entregas(p_ids uuid[], p_etapa text, p_data date, p_documento_sei text, p_observacao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    VALUES (e.id, 'ETAPA', p_etapa, p_data, v_sei, v_obs, auth.uid(), v_nome);

    -- A Ordem da SFC/CGLIC numa entrega de emenda é a mesma Ordem do pedido (Pedido 360 › Andamento).
    IF p_etapa = 'ORDEM' AND e.pedido_id IS NOT NULL THEN
      INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, ordem_em, ordem_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
      VALUES (e.pedido_id, e.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
      ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
        SET ordem_em = EXCLUDED.ordem_em, ordem_documento_sei = EXCLUDED.ordem_documento_sei,
            atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    END IF;
    -- A Informação para a Ordem também é a mesma do pedido (migration 271): antes só a Ordem voltava ao pedido.
    IF p_etapa = 'INFO_ENVIADA' AND e.pedido_id IS NOT NULL THEN
      INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, informacao_em, informacao_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
      VALUES (e.pedido_id, e.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
      ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
        SET informacao_em = EXCLUDED.informacao_em, informacao_documento_sei = EXCLUDED.informacao_documento_sei,
            atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('entregas', v_n, 'etapa', p_etapa);
END;
$function$;

-- 2) Limpeza do registro único da 245 ------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.emenda_pedidos WHERE ordem_fornecimento_em IS NOT NULL OR ordem_fornecimento_documento_sei IS NOT NULL) THEN
    RAISE EXCEPTION 'Há pedido com a Ordem de Fornecimento no registro antigo (migration 245): passe-o a emenda_pedido_ordens antes de apagar as colunas.';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.registrar_ordem_fornecimento(UUID, TEXT, DATE);
ALTER TABLE public.emenda_pedidos DROP CONSTRAINT IF EXISTS emenda_pedidos_ordem_fornecimento_sei;
ALTER TABLE public.emenda_pedidos DROP COLUMN IF EXISTS ordem_fornecimento_em;
ALTER TABLE public.emenda_pedidos DROP COLUMN IF EXISTS ordem_fornecimento_documento_sei;
