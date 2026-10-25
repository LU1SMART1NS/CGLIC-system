-- ==============================================================================
-- MIGRATION 186: Nº DA EMENDA NUM FORMATO SÓ (8 DÍGITOS + ANO)
-- Versão: 20261025000186_emendas_numero_da_emenda.sql
--
-- O nº da emenda era texto livre na conferência com o SIOP (migration 174), e a tela sugeria "2026 4095 0004". As
-- regras que acham a nota da emenda comparam 8 dígitos com o plano interno da nota (SP999S9… + ano + 8 dígitos;
-- migrations 183 e 184): um número digitado com o ano e espaços nunca acharia a nota, e o código do autor (os 4
-- primeiros dígitos) viraria "2026". Medição de 25/10/2026: os 108 pedidos com número têm 8 dígitos.
--
-- 1) emenda_pedidos.siop_emenda só aceita 8 dígitos.
-- 2) emenda_pedidos.siop_emenda_ano: o ano da emenda (o número se repete entre anos). Nos pedidos que já têm nota
--    ligada, vem do plano interno das notas quando todas dizem o mesmo ano; nos outros fica vazio.
-- 3) avancar_pedido_emenda, na conferência: limpa o número (tira espaços, pontos e traços), aceita os 12 dígitos do
--    código (ano + número) ou os 8 com o ano à parte, e recusa o resto. Só muda o ramo CONFERIDO.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) e 2) Colunas
-- ------------------------------------------------------------------------------
ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS siop_emenda_ano SMALLINT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.emenda_pedidos WHERE siop_emenda IS NOT NULL AND siop_emenda !~ '^[0-9]{8}$') THEN
    RAISE EXCEPTION 'Há pedido com o nº da emenda fora de 8 dígitos: corrija antes de aplicar.';
  END IF;
END;
$$;

ALTER TABLE public.emenda_pedidos DROP CONSTRAINT IF EXISTS emenda_pedidos_siop_emenda;
ALTER TABLE public.emenda_pedidos ADD CONSTRAINT emenda_pedidos_siop_emenda
  CHECK (siop_emenda IS NULL OR siop_emenda ~ '^[0-9]{8}$');
ALTER TABLE public.emenda_pedidos DROP CONSTRAINT IF EXISTS emenda_pedidos_siop_emenda_ano;
ALTER TABLE public.emenda_pedidos ADD CONSTRAINT emenda_pedidos_siop_emenda_ano
  CHECK (siop_emenda_ano IS NULL OR (siop_emenda_ano BETWEEN 2015 AND 2100 AND siop_emenda IS NOT NULL));

COMMENT ON COLUMN public.emenda_pedidos.siop_emenda IS 'Nº da emenda, 8 dígitos: os 4 do autor e os 4 da emenda (migration 186).';
COMMENT ON COLUMN public.emenda_pedidos.siop_emenda_ano IS 'Ano da emenda. O número se repete entre anos; no plano interno da nota vem antes dos 8 dígitos (migration 186).';

-- Pedidos que já têm nota: o ano do plano interno, quando todas as notas ligadas dizem o mesmo.
UPDATE public.emenda_pedidos p SET siop_emenda_ano = a.ano
  FROM (
    SELECT l.pedido_id, min(substring(e.plano_interno from ('(20[0-9]{2})' || pe.siop_emenda))::SMALLINT) AS ano
      FROM public.emenda_linha_notas n
      JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id
      JOIN public.emenda_pedidos pe ON pe.id = l.pedido_id
      JOIN public.empenhos e ON e.id = n.empenho_id
     WHERE pe.siop_emenda IS NOT NULL AND e.plano_interno ~ ('20[0-9]{2}' || pe.siop_emenda)
     GROUP BY l.pedido_id
    HAVING count(DISTINCT substring(e.plano_interno from ('(20[0-9]{2})' || pe.siop_emenda))) = 1) a
 WHERE p.id = a.pedido_id AND p.siop_emenda_ano IS NULL;

-- ------------------------------------------------------------------------------
-- 3) Etapas do pedido (igual à migration 174, menos o ramo CONFERIDO)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avancar_pedido_emenda(p_id UUID, p_versao INTEGER, p_acao TEXT, p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      RECORD;
  v_nome   TEXT;
  v_acao   TEXT := upper(COALESCE(p_acao, ''));
  v_d      JSONB := COALESCE(p_dados, '{}'::jsonb);
  v_data   DATE;
  v_sei    TEXT;
  v_seis   TEXT[];
  v_conf   JSONB;
  v_rodada INTEGER;
  v_versao INTEGER;
  v_num    TEXT;
  v_ano    INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram as etapas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_data := COALESCE(NULLIF(v_d->>'data', '')::DATE, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);

  IF v_acao IN ('OFICIO', 'SOLICITADO', 'CGOFI') THEN
    v_sei := regexp_replace(COALESCE(v_d->>'documento_sei', ''), '\D', '', 'g');
    IF v_sei !~ '^[0-9]{7,10}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o documento SEI (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
    END IF;
  ELSIF v_acao IN ('EMPENHADO', 'CONTRATACAO', 'ACRESCENTAR_SEI') THEN
    IF jsonb_typeof(v_d->'documentos_sei') <> 'array' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe pelo menos um documento SEI.' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT n ORDER BY n) INTO v_seis
      FROM (SELECT regexp_replace(p, '\D', '', 'g') AS n
              FROM jsonb_array_elements_text(v_d->'documentos_sei') x, regexp_split_to_table(x, '[,;[:space:]]+') p) t
     WHERE n <> '';
    IF v_seis IS NULL OR EXISTS (SELECT 1 FROM unnest(v_seis) n WHERE n !~ '^[0-9]{7,10}$') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe pelo menos um documento SEI (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_acao = 'MINUTA' THEN
    IF v_p.etapa <> 'RESERVADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A minuta é registrada em pedido reservado.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'MINUTA', minuta_em = v_data WHERE id = p_id;

  ELSIF v_acao = 'OFICIO' THEN
    IF v_p.etapa NOT IN ('RESERVADO', 'MINUTA', 'OFICIO') THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O ofício é registrado antes da conferência com o SIOP.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'processo_sei'), '') = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o processo SEI.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'OFICIO', oficio_documento_sei = v_sei,
           oficio_processo_sei = left(btrim(v_d->>'processo_sei'), 40), oficio_em = v_data, divergencia = NULL WHERE id = p_id;

  ELSIF v_acao = 'DIVERGENCIA' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A divergência é registrada com o ofício recebido, antes da conferência.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'texto'), '') = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: descreva o que não bate.' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(max(rodada), 0) + 1 INTO v_rodada FROM public.emenda_pedido_devolucoes WHERE pedido_id = p_id;
    INSERT INTO public.emenda_pedido_devolucoes (pedido_id, rodada, minuta_em, oficio_em, oficio_documento_sei, oficio_processo_sei,
                                                 oficio_numero, motivo, devolvido_em, criado_por, criado_por_nome)
    VALUES (p_id, v_rodada, v_p.minuta_em, v_p.oficio_em, v_p.oficio_documento_sei, v_p.oficio_processo_sei,
            v_p.oficio_numero, btrim(v_d->>'texto'), v_data, auth.uid(), v_nome);
    -- Volta para a minuta: a nova minuta e o novo ofício entram no mesmo processo SEI.
    UPDATE public.emenda_pedidos SET etapa = 'RESERVADO', minuta_em = NULL, minuta_documento_sei = NULL, oficio_em = NULL,
           oficio_documento_sei = NULL, oficio_numero = NULL, divergencia = btrim(v_d->>'texto'), devolvido_em = v_data
     WHERE id = p_id;

  ELSIF v_acao = 'CONFERIDO' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A conferência com o SIOP vem depois do ofício.' USING ERRCODE = '22023';
    END IF;
    v_conf := v_d->'conferencia';
    IF v_conf IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['numero_emenda', 'autor', 'valor', 'gnd', 'beneficiario', 'objeto']) k
       WHERE (v_conf->>k)::BOOLEAN IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: os 6 pontos da conferência (nº da emenda, autor, valor, GND, beneficiário e objeto) precisam bater.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'emenda'), '') = '' OR (v_d->>'gnd') NOT IN ('GND-3', 'GND-4') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o número da emenda e o GND.' USING ERRCODE = '22023';
    END IF;
    -- Migration 186: 8 dígitos (autor + emenda) com o ano à parte, ou os 12 do código (ano + número).
    v_num := regexp_replace(v_d->>'emenda', '\D', '', 'g');
    IF v_num ~ '^20[0-9]{10}$' THEN
      v_ano := left(v_num, 4)::INTEGER;
      v_num := right(v_num, 8);
    ELSIF v_num ~ '^[0-9]{8}$' THEN
      v_ano := CASE WHEN COALESCE(v_d->>'ano', '') ~ '^[0-9]{4}$' THEN (v_d->>'ano')::INTEGER END;
    ELSE
      RAISE EXCEPTION 'INVALID_PAYLOAD: o nº da emenda tem 8 dígitos (ex.: 4095 0004), ou 12 com o ano na frente (2026 4095 0004).' USING ERRCODE = '22023';
    END IF;
    IF v_ano IS NULL OR v_ano NOT BETWEEN 2015 AND 2100 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o ano da emenda.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: todas as linhas precisam de beneficiário antes da conferência.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CONFERIDO', siop_emenda = v_num, siop_emenda_ano = v_ano,
           siop_valor = NULLIF(v_d->>'valor', '')::NUMERIC, siop_gnd = v_d->>'gnd', siop_conferencia = v_conf,
           conferido_em = v_data, divergencia = NULL WHERE id = p_id;

  ELSIF v_acao = 'SOLICITADO' THEN
    IF v_p.etapa <> 'CONFERIDO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A solicitação de empenho vem depois da conferência.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'SOLICITADO', solicitado_em = v_data, solicitado_documento_sei = v_sei WHERE id = p_id;

  ELSIF v_acao = 'AUTORIZADO' THEN
    IF v_p.etapa <> 'SOLICITADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A autorização de empenho vem depois da solicitação.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'AUTORIZADO', autorizado_em = v_data, autorizado_documento_sei = solicitado_documento_sei WHERE id = p_id;

  ELSIF v_acao = 'CGOFI' THEN
    IF v_p.etapa <> 'AUTORIZADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O envio à CGOFI vem depois da autorização.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CGOFI', cgofi_em = v_data, cgofi_documento_sei = v_sei WHERE id = p_id;

  ELSIF v_acao = 'EMPENHADO' THEN
    IF v_p.etapa <> 'CGOFI' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O empenho vem depois do envio à CGOFI.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'EMPENHADO', empenhado_em = v_data, empenhado_documentos_sei = v_seis WHERE id = p_id;

  ELSIF v_acao = 'CONTRATACAO' THEN
    IF v_p.etapa <> 'EMPENHADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O envio para contratação vem depois do empenho.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CONTRATACAO', contratacao_em = v_data, contratacao_documentos_sei = v_seis WHERE id = p_id;

  ELSIF v_acao = 'ACRESCENTAR_SEI' THEN
    IF v_d->>'etapa' = 'EMPENHADO' AND v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') THEN
      UPDATE public.emenda_pedidos SET empenhado_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(empenhado_documentos_sei, '{}') || v_seis) n ORDER BY n) WHERE id = p_id;
    ELSIF v_d->>'etapa' = 'CONTRATACAO' AND v_p.etapa = 'CONTRATACAO' THEN
      UPDATE public.emenda_pedidos SET contratacao_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(contratacao_documentos_sei, '{}') || v_seis) n ORDER BY n) WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'ETAPA_INVALIDA: Só se acrescenta número ao empenho ou ao envio para contratação já registrados.' USING ERRCODE = '22023';
    END IF;

  ELSE
    RAISE EXCEPTION 'INVALID_PAYLOAD: ação desconhecida: %.', p_acao USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.avancar_pedido_emenda(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.avancar_pedido_emenda(UUID, INTEGER, TEXT, JSONB) TO authenticated;
