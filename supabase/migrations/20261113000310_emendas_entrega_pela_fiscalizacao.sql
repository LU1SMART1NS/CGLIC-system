-- ==============================================================================
-- MIGRATION 310: EMENDAS ENXERGAM A ENTREGA DA FISCALIZAÇÃO E O ENVIO À SFC CHEGA NA HORA
-- Versão: 20261113000310_emendas_entrega_pela_fiscalizacao.sql
--
-- Protótipo aprovado em 13/11/2026 (decisões D1–D3 e parecer de UX):
-- 1) fisc_entregas_das_emendas(): as entregas de todos os pedidos de emenda numa leitura só (a mesma linha de
--    fisc_entregas_do_pedido, com o pedido). A lista de Pedidos, o Início e as telas 360 de Emendas mostram a etapa
--    da entrega e os avisos de entrega atrasada e de produto no Exército. Lê quem tem fiscalizacao.view.
-- 2) registrar_informacao_ordem e registrar_ordem_fornecimento_contrato (migration 250): depois de gravar no pedido,
--    avançam na hora as entregas da SFC/CGLIC daquele contrato (fisc_criar_entregas_do_contrato). Antes a Informação
--    da CAEP só chegava à Fiscalização na rodada de hora em hora (fiscalizacao-criar-entregas, minuto 04), e o fiscal
--    ficava até uma hora sem ver "Emitir a Ordem". Pedido do usuário: o envio à SFC deve ser como o envio à CCGA, que
--    aparece na hora no Início do gestor da ata.
--
-- Os corpos das duas RPCs são os da migration 250, com a chamada no fim. CREATE OR REPLACE mantém as permissões.
-- ==============================================================================

-- 1) Entregas de todos os pedidos ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_entregas_das_emendas()
RETURNS TABLE (
  id               UUID,
  pedido_id        UUID,
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
  SELECT e.id, l.pedido_id, e.emenda_linha_id, e.contract_key::TEXT, e.quantidade, e.responsavel::TEXT, e.etapa::TEXT,
         e.etapa_em, e.prevista, e.entregue_em, e.dividida_de, f.fiscal_nome::TEXT
    FROM public.fisc_entregas e
    JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
    JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
   WHERE e.encerrada_em IS NULL
     AND public.has_permission('fiscalizacao.view') IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.fisc_entregas_das_emendas() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_das_emendas() TO authenticated;

-- 2) Informação da CAEP chega na hora às entregas da SFC/CGLIC ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_informacao_ordem(p_alvos JSONB, p_data DATE, p_documento_sei TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sei       TEXT := public.emendas_conferir_ordem(p_data, p_documento_sei);
  v_nome      TEXT := left(public.nome_do_usuario_logado(), 200);
  v_a         RECORD;
  v_n         INTEGER := 0;
  v_contratos TEXT[] := ARRAY[]::TEXT[];
  v_c         TEXT;
BEGIN
  FOR v_a IN SELECT * FROM public.emendas_alvos_da_ordem(p_alvos) LOOP
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_ordens o WHERE o.pedido_id = v_a.pedido_id AND o.contract_key = v_a.contract_key AND o.ordem_em IS NOT NULL AND o.ordem_em < p_data) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A Ordem de Fornecimento do contrato % é anterior a esta data; para retificar, corrija também a Ordem.', v_a.contract_key USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, informacao_em, informacao_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
    VALUES (v_a.pedido_id, v_a.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
    ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
      SET informacao_em = EXCLUDED.informacao_em, informacao_documento_sei = EXCLUDED.informacao_documento_sei,
          atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    v_n := v_n + 1;
    IF NOT (v_a.contract_key::TEXT = ANY (v_contratos)) THEN v_contratos := v_contratos || v_a.contract_key::TEXT; END IF;
  END LOOP;
  -- Envio à SFC: as entregas que esperavam a Informação avançam já (antes, só na rodada de hora em hora).
  FOREACH v_c IN ARRAY v_contratos LOOP
    PERFORM public.fisc_criar_entregas_do_contrato(v_c);
  END LOOP;
  RETURN jsonb_build_object('registros', v_n, 'documento_sei', v_sei);
END;
$$;

-- 3) Ordem registrada no pedido também chega na hora -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_ordem_fornecimento_contrato(p_alvos JSONB, p_data DATE, p_documento_sei TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sei       TEXT := public.emendas_conferir_ordem(p_data, p_documento_sei);
  v_nome      TEXT := left(public.nome_do_usuario_logado(), 200);
  v_a         RECORD;
  v_info      DATE;
  v_n         INTEGER := 0;
  v_contratos TEXT[] := ARRAY[]::TEXT[];
  v_c         TEXT;
BEGIN
  FOR v_a IN SELECT * FROM public.emendas_alvos_da_ordem(p_alvos) LOOP
    SELECT o.informacao_em INTO v_info FROM public.emenda_pedido_ordens o WHERE o.pedido_id = v_a.pedido_id AND o.contract_key = v_a.contract_key;
    IF v_info IS NOT NULL AND p_data < v_info THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A Ordem não pode ser antes da Informação (%).', to_char(v_info, 'DD/MM/YYYY') USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, ordem_em, ordem_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
    VALUES (v_a.pedido_id, v_a.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
    ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
      SET ordem_em = EXCLUDED.ordem_em, ordem_documento_sei = EXCLUDED.ordem_documento_sei,
          atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    v_n := v_n + 1;
    IF NOT (v_a.contract_key::TEXT = ANY (v_contratos)) THEN v_contratos := v_contratos || v_a.contract_key::TEXT; END IF;
  END LOOP;
  FOREACH v_c IN ARRAY v_contratos LOOP
    PERFORM public.fisc_criar_entregas_do_contrato(v_c);
  END LOOP;
  RETURN jsonb_build_object('registros', v_n, 'documento_sei', v_sei);
END;
$$;
