-- ==============================================================================
-- MIGRATION 231: EXECUÇÃO DO PEDIDO DE EMENDA PELA FATURA E PELA ORDEM BANCÁRIA
-- Versão: 20261028000231_emendas_execucao_pela_fatura.sql
--
-- Protótipo aprovado em 28/10/2026 (D4), entrega 2. Depois de "Contratado", o pedido mostra a execução: Faturado
-- (a primeira fatura de cada nota no Contratos.gov.br: o fornecedor entregou e o fiscal atestou), Liquidado e Pago
-- (pelos valores da nota no Tesouro, que já estão em emenda_linha_notas). Contados por nota, não por item: a fatura e
-- a ordem bancária não dizem qual item foi pago.
--
-- 1) emenda_linha_notas ganha faturas (quantas faturas citam a nota no mesmo contrato), faturado_em (a primeira
--    emissão), liquidado_em (a última liquidação das faturas) e pago_em (a última ordem bancária).
-- 2) emendas_avancar_pela_fonte() (migration 230, cron às :59) passa a preencher essas colunas. O resto da função
--    não muda. As etapas gravadas também não: a execução é calculada na tela, como "Contratado".
-- ==============================================================================

ALTER TABLE public.emenda_linha_notas
  ADD COLUMN IF NOT EXISTS faturas      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturado_em  DATE,
  ADD COLUMN IF NOT EXISTS liquidado_em DATE,
  ADD COLUMN IF NOT EXISTS pago_em      DATE;
COMMENT ON COLUMN public.emenda_linha_notas.faturas IS 'Faturas do Contratos.gov.br que citam a nota no mesmo contrato (migration 231).';
COMMENT ON COLUMN public.emenda_linha_notas.faturado_em IS 'Emissão da primeira fatura que cita a nota (migration 231).';
COMMENT ON COLUMN public.emenda_linha_notas.liquidado_em IS 'Última data de liquidação das faturas da nota (migration 231).';
COMMENT ON COLUMN public.emenda_linha_notas.pago_em IS 'Emissão da última ordem bancária das faturas da nota (migration 231).';

CREATE OR REPLACE FUNCTION public.emendas_avancar_pela_fonte()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r          RECORD;
  v_para       TEXT;
  v_empenhados INTEGER := 0;
  v_contratos  INTEGER := 0;
  v_datas      INTEGER := 0;
  v_faturas    INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador atualizam as etapas.' USING ERRCODE = '42501';
  END IF;

  -- Data de assinatura do contrato de cada nota (o registro do Contratos.gov.br traz dataAssinatura).
  WITH c AS (
    SELECT contract_key,
           CASE WHEN registro->>'dataAssinatura' ~ '^\d{4}-\d{2}-\d{2}' THEN left(registro->>'dataAssinatura', 10)::DATE END AS assinado
      FROM public.contratos_oficiais)
  UPDATE public.emenda_linha_notas n SET contrato_assinado_em = c.assinado
    FROM c
   WHERE c.contract_key = n.contract_key AND n.contrato_assinado_em IS DISTINCT FROM c.assinado;
  GET DIAGNOSTICS v_datas = ROW_COUNT;
  UPDATE public.emenda_linha_notas SET contrato_assinado_em = NULL WHERE contract_key IS NULL AND contrato_assinado_em IS NOT NULL;

  -- Migration 231: faturas do Contratos.gov.br que citam a nota (fatura_empenhos), no mesmo contrato, e a ordem
  -- bancária da fatura (fatura_pagamento). Por nota: quantas faturas, a primeira emissão, a última liquidação e o
  -- último pagamento. Os valores liquidado e pago continuam os da nota no Tesouro.
  WITH f AS (
    SELECT n.linha_id, count(DISTINCT cf.id_fatura) AS faturas, min(cf.emissao) AS faturado_em,
           max(cf.data_liquidacao) AS liquidado_em, max(fp.ob_emissao) AS pago_em
      FROM public.emenda_linha_notas n
      JOIN public.fatura_empenhos fe ON fe.numero_empenho = n.nota
      JOIN public.contrato_faturas cf ON cf.id_fatura = fe.id_fatura AND cf.contract_key = n.contract_key AND NOT cf.cancelada
      LEFT JOIN public.fatura_pagamento fp ON fp.id_fatura = cf.id_fatura
     WHERE n.contract_key IS NOT NULL AND n.nota IS NOT NULL
     GROUP BY n.linha_id)
  UPDATE public.emenda_linha_notas n
     SET faturas = COALESCE(f.faturas, 0), faturado_em = f.faturado_em, liquidado_em = f.liquidado_em, pago_em = f.pago_em
    FROM public.emenda_linha_notas x
    LEFT JOIN f ON f.linha_id = x.linha_id
   WHERE n.linha_id = x.linha_id
     AND (n.faturas IS DISTINCT FROM COALESCE(f.faturas, 0) OR n.faturado_em IS DISTINCT FROM f.faturado_em
          OR n.liquidado_em IS DISTINCT FROM f.liquidado_em OR n.pago_em IS DISTINCT FROM f.pago_em);
  GET DIAGNOSTICS v_faturas = ROW_COUNT;

  FOR v_r IN
    WITH l AS (
      SELECT p.id AS pedido_id, p.etapa, n.empenho_id, n.emitida_em, n.contract_key,
             (n.empenho_id IS NOT NULL AND COALESCE(n.valor_empenhado, 0) > 0) AS valida
        FROM public.emenda_pedidos p
        JOIN public.emenda_pedido_linhas l ON l.pedido_id = p.id AND NOT l.cancelada
        LEFT JOIN public.emenda_linha_notas n ON n.linha_id = l.id
       WHERE p.etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI', 'EMPENHADO'))
    SELECT pedido_id, etapa,
           count(*) AS itens,
           count(*) FILTER (WHERE valida) AS com_nota,
           count(*) FILTER (WHERE valida AND contract_key IS NOT NULL) AS com_contrato,
           max(emitida_em) FILTER (WHERE valida) AS ultima_nota,
           COALESCE(array_agg(DISTINCT empenho_id ORDER BY empenho_id) FILTER (WHERE valida), '{}') AS notas
      FROM l
     GROUP BY pedido_id, etapa
  LOOP
    IF v_r.com_contrato > 0 THEN
      v_para := 'CONTRATACAO';
    ELSIF v_r.com_nota = v_r.itens AND v_r.etapa <> 'EMPENHADO' THEN
      v_para := 'EMPENHADO';
    ELSE
      CONTINUE;
    END IF;
    -- As mesmas notas não avançam o pedido de novo para a mesma etapa (a CAEP pode ter voltado o pedido).
    IF EXISTS (SELECT 1 FROM public.emenda_avancos_pela_fonte a
                WHERE a.pedido_id = v_r.pedido_id AND a.para_etapa = v_para AND a.notas = v_r.notas) THEN
      CONTINUE;
    END IF;

    UPDATE public.emenda_pedidos SET
           etapa = v_para,
           empenhado_em = CASE WHEN etapa = 'EMPENHADO' THEN empenhado_em ELSE COALESCE(empenhado_em, v_r.ultima_nota) END,
           empenhado_pela_fonte = empenhado_pela_fonte OR etapa <> 'EMPENHADO',
           contratacao_pela_fonte = (v_para = 'CONTRATACAO'),
           versao = versao + 1, atualizado_por = NULL, atualizado_por_nome = 'Sistema (pela fonte)', atualizado_em = NOW()
     WHERE id = v_r.pedido_id AND etapa = v_r.etapa;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    INSERT INTO public.emenda_avancos_pela_fonte (pedido_id, de_etapa, para_etapa, notas, data)
    VALUES (v_r.pedido_id, v_r.etapa, v_para, v_r.notas, v_r.ultima_nota);
    IF v_para = 'CONTRATACAO' THEN v_contratos := v_contratos + 1; ELSE v_empenhados := v_empenhados + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('empenhados', v_empenhados, 'contratacao', v_contratos, 'datas_de_contrato', v_datas, 'faturas', v_faturas);
END;
$$;

REVOKE ALL ON FUNCTION public.emendas_avancar_pela_fonte() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_avancar_pela_fonte() TO service_role;
