-- ==============================================================================
-- MIGRATION 230: O PEDIDO DE EMENDA AVANÇA PELA FONTE (nota emitida e contrato assinado)
-- Versão: 20261028000230_emendas_avanco_pela_fonte.sql
--
-- Protótipo aprovado em 28/10/2026 (D1, D2, D3 e D6). Até aqui a etapa do pedido só mudava quando a CAEP registrava,
-- mesmo com a nota já ligada aos itens (migration 189) e o contrato já no Contratos.gov.br.
--
-- 1) Nota de empenho emitida (D1): quando todos os itens ativos do pedido têm nota válida (ligada e com empenhado
--    maior que zero no Tesouro), o pedido passa a EMPENHADO com a data de emissão da nota mais recente.
-- 2) Contratado (D3): contrato no Contratos.gov.br já está assinado. Basta um item com nota num contrato para o pedido
--    ir a CONTRATACAO, em qualquer etapa depois da conferência; o "Contratado" continua calculado pelas notas
--    (contratosDoPedido), agora com a data de assinatura copiada para emenda_linha_notas.contrato_assinado_em.
-- 3) Passos que a CAEP não registrou (D2) ficam sem data e sem SEI: a tela diz "comprovado pela nota" ou "pelo
--    contrato" (empenhado_pela_fonte / contratacao_pela_fonte). A CAEP completa o SEI depois pela ação
--    ACRESCENTAR_SEI de avancar_pedido_emenda, que passa a aceitar o envio à CGOFI e a data junto.
-- 4) Anulação (D6): segue registrar_anulacao_empenho (migrations 203/208). A nota zerada não conta como válida, e
--    emenda_avancos_pela_fonte guarda cada avanço com as notas que o provaram: o mesmo conjunto de notas nunca avança
--    o mesmo pedido duas vezes para a mesma etapa.
-- 5) emendas_avancar_pela_fonte() roda pelo cron às :59, depois da ligação das notas (:58).
-- ==============================================================================

ALTER TABLE public.emenda_pedidos
  ADD COLUMN IF NOT EXISTS empenhado_pela_fonte   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contratacao_pela_fonte BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.emenda_pedidos.empenhado_pela_fonte IS 'O empenho foi registrado pelo sistema, pela nota emitida (migration 230).';
COMMENT ON COLUMN public.emenda_pedidos.contratacao_pela_fonte IS 'O pedido chegou à contratação pelo contrato no Contratos.gov.br, sem o envio à CCGA registrado (migration 230).';

ALTER TABLE public.emenda_linha_notas ADD COLUMN IF NOT EXISTS contrato_assinado_em DATE;
COMMENT ON COLUMN public.emenda_linha_notas.contrato_assinado_em IS 'Data de assinatura do contrato da nota, do Contratos.gov.br (migration 230).';

CREATE TABLE IF NOT EXISTS public.emenda_avancos_pela_fonte (
  id          BIGSERIAL   PRIMARY KEY,
  pedido_id   UUID        NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  de_etapa    VARCHAR(20) NOT NULL,
  para_etapa  VARCHAR(20) NOT NULL,
  notas       UUID[]      NOT NULL,
  data        DATE,
  avancado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS emenda_avancos_pela_fonte_unico ON public.emenda_avancos_pela_fonte (pedido_id, para_etapa, notas);
COMMENT ON TABLE public.emenda_avancos_pela_fonte IS 'Cada avanço de etapa feito pelo sistema e as notas que o provaram; não repete (migration 230).';
ALTER TABLE public.emenda_avancos_pela_fonte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.emenda_avancos_pela_fonte FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.emenda_avancos_pela_fonte_id_seq FROM PUBLIC, anon, authenticated;

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

  RETURN jsonb_build_object('empenhados', v_empenhados, 'contratacao', v_contratos, 'datas_de_contrato', v_datas);
END;
$$;

REVOKE ALL ON FUNCTION public.emendas_avancar_pela_fonte() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_avancar_pela_fonte() TO service_role;
COMMENT ON FUNCTION public.emendas_avancar_pela_fonte() IS 'Avança o pedido de emenda pela nota emitida e pelo contrato assinado (migration 230).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avancar-pedidos-emendas-pela-fonte') THEN
    PERFORM cron.unschedule('avancar-pedidos-emendas-pela-fonte');
  END IF;
  PERFORM cron.schedule('avancar-pedidos-emendas-pela-fonte', '59 * * * *', 'SELECT public.emendas_avancar_pela_fonte()');
END $$;

-- Completar o SEI e a data dos passos comprovados pela fonte (ACRESCENTAR_SEI). Mesma função da migration 186,
-- tirada de produção em 28/10/2026; muda só o ramo ACRESCENTAR_SEI.
CREATE OR REPLACE FUNCTION public.avancar_pedido_emenda(p_id UUID, p_versao INTEGER, p_acao TEXT, p_dados JSONB)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    -- Migration 230: a data vem junto quando a etapa avançou pela fonte sem data (comprovada pela nota ou pelo contrato).
    v_data := NULLIF(v_d->>'data', '')::DATE;
    IF v_d->>'etapa' = 'CGOFI' AND v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') AND v_p.cgofi_documento_sei IS NULL THEN
      -- Envio à CGOFI comprovado pela nota: a CAEP completa o documento depois (um só, como no registro da etapa).
      IF array_length(v_seis, 1) <> 1 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: o envio à CGOFI tem um documento SEI só.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.emenda_pedidos SET cgofi_documento_sei = v_seis[1], cgofi_em = COALESCE(cgofi_em, v_data) WHERE id = p_id;
    ELSIF v_d->>'etapa' = 'EMPENHADO' AND v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') THEN
      UPDATE public.emenda_pedidos SET empenhado_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(empenhado_documentos_sei, '{}') || v_seis) n ORDER BY n),
        empenhado_em = COALESCE(empenhado_em, v_data) WHERE id = p_id;
    ELSIF v_d->>'etapa' = 'CONTRATACAO' AND v_p.etapa = 'CONTRATACAO' THEN
      UPDATE public.emenda_pedidos SET contratacao_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(contratacao_documentos_sei, '{}') || v_seis) n ORDER BY n),
        contratacao_em = COALESCE(contratacao_em, v_data) WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'ETAPA_INVALIDA: Só se acrescenta número ao envio à CGOFI, ao empenho ou ao envio para contratação já registrados.' USING ERRCODE = '22023';
    END IF;

  ELSE
    RAISE EXCEPTION 'INVALID_PAYLOAD: ação desconhecida: %.', p_acao USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;

