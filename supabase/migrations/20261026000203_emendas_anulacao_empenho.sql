-- ==============================================================================
-- Anulação de empenho nas emendas (protótipo aprovado em 26/10/2026)
--
-- Quando a nota de empenho de linhas do pedido é anulada, os itens voltam para a interlocução com o parlamentar
-- (novos itens e beneficiários). O sistema só avisa (nota zerada no Tesouro, tela); quem registra é o gestor, porque a
-- nota pode ter sido refeita.
--   - Anulação total (todas as linhas ativas): o próprio pedido volta a "Itens reservados". As etapas seguintes
--     (minuta, ofício, SIOP, solicitação, autorização, CGOFI, empenho, contratação) e os documentos SEI delas saem do
--     pedido e ficam guardados no registro da anulação, como a devolução do ofício guarda a tentativa devolvida.
--   - Anulação parcial: a etapa é do pedido inteiro, então as linhas anuladas vão para um pedido novo em "Itens
--     reservados", ligado ao original (pedido_origem_id), com o mesmo parlamentar e contato. No original elas ficam
--     canceladas, com o motivo apontando o pedido novo. A quantidade continua reservada (sai de um e entra no outro):
--     o saldo da CAEP não muda, e a trava do prazo de indicação não barra essa volta.
-- ==============================================================================

ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS pedido_origem_id UUID REFERENCES public.emenda_pedidos(id);
COMMENT ON COLUMN public.emenda_pedidos.pedido_origem_id IS
  'Pedido de onde vieram os itens: preenchido no pedido aberto por uma anulação parcial de empenho (migration 203).';

CREATE TABLE IF NOT EXISTS public.emenda_pedido_anulacoes (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         UUID         NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  novo_pedido_id    UUID         REFERENCES public.emenda_pedidos(id) ON DELETE SET NULL,
  total             BOOLEAN      NOT NULL,
  notas             TEXT[]       NOT NULL DEFAULT '{}',
  -- [{linha_id, nova_linha_id, tipo, item_key, kit_nome, quantidade, empenho_documento_sei, despacho_documento_sei, contrato_numero}]
  linhas            JSONB        NOT NULL,
  documento_sei     VARCHAR(10)  NOT NULL CHECK (documento_sei ~ '^[0-9]{7,10}$'),
  anulado_em        DATE         NOT NULL,
  motivo            TEXT         NOT NULL CHECK (btrim(motivo) <> ''),
  -- Só na anulação total: as colunas das etapas e os documentos SEI que saíram do pedido.
  etapas_anteriores JSONB,
  criado_por        UUID,
  criado_por_nome   VARCHAR(200),
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emenda_pedido_anulacoes_pedido ON public.emenda_pedido_anulacoes (pedido_id);
COMMENT ON TABLE public.emenda_pedido_anulacoes IS
  'Anulações de empenho registradas no pedido: linhas, notas, documento SEI e o que saiu do pedido. Grava só por registrar_anulacao_empenho.';

DO $$
DECLARE v_t TEXT := 'emenda_pedido_anulacoes';
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leitura das emendas: ' || v_t, v_t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_permission(''emendas.view'')))',
                 'Leitura das emendas: ' || v_t, v_t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Somente usuario ativo', v_t);
  EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
                 'USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))', 'Somente usuario ativo', v_t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', v_t);
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || v_t, v_t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()', 'trg_audit_' || v_t, v_t);
  END IF;
END $$;

-- A volta dos itens anulados à interlocução não é uma indicação nova: a trava do prazo (migration 162) não a barra.
-- Igual à da migration 162, mais o desvio pela marca da transação que só registrar_anulacao_empenho liga.
CREATE OR REPLACE FUNCTION public.trg_emendas_prazo_linha()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.cancelada OR current_setting('emendas.volta_da_anulacao', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NOT OLD.cancelada
     AND (OLD.tipo, OLD.item_key, OLD.kit_id, OLD.kit_composicao) IS NOT DISTINCT FROM (NEW.tipo, NEW.item_key, NEW.kit_id, NEW.kit_composicao)
     AND NEW.quantidade <= OLD.quantidade THEN
    RETURN NEW;
  END IF;
  FOR v_item IN SELECT public.emendas_itens_da_linha(NEW.tipo, NEW.item_key, NEW.kit_composicao) LOOP
    PERFORM public.emendas_conferir_prazo_do_item(v_item);
  END LOOP;
  RETURN NEW;
END;
$$;

-- Registra a anulação. p_dados: { linhas: [uuid das linhas anuladas], documento_sei, data, motivo }.
CREATE OR REPLACE FUNCTION public.registrar_anulacao_empenho(p_id UUID, p_versao INTEGER, p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p        RECORD;
  v_l        RECORD;
  v_d        JSONB := COALESCE(p_dados, '{}'::jsonb);
  v_nome     TEXT;
  v_linhas   UUID[];
  v_ativas   INTEGER;
  v_total    BOOLEAN;
  v_sei      TEXT;
  v_data     DATE;
  v_motivo   TEXT;
  v_notas    TEXT[];
  v_novo     UUID;
  v_numero   INTEGER;
  v_ordem    INTEGER := 0;
  v_nova     UUID;
  v_registro JSONB := '[]'::jsonb;
  v_antes    JSONB;
  v_versao   INTEGER;
  v_anulacao UUID;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram a anulação.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa NOT IN ('CGOFI', 'EMPENHADO', 'CONTRATACAO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Só há empenho a anular depois do envio à CGOFI.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_d->'linhas') <> 'array' OR jsonb_array_length(v_d->'linhas') = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: marque pelo menos um item cujo empenho foi anulado.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT x::UUID) INTO v_linhas FROM jsonb_array_elements_text(v_d->'linhas') x;
  IF EXISTS (
    SELECT 1 FROM unnest(v_linhas) x
     WHERE NOT EXISTS (SELECT 1 FROM public.emenda_pedido_linhas l WHERE l.id = x AND l.pedido_id = p_id AND NOT l.cancelada)
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: algum item marcado não é deste pedido ou já saiu dele.' USING ERRCODE = '22023';
  END IF;
  v_sei := regexp_replace(COALESCE(v_d->>'documento_sei', ''), '\D', '', 'g');
  IF v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o documento SEI da anulação (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
  END IF;
  v_data := NULLIF(v_d->>'data', '')::DATE;
  IF v_data IS NULL OR v_data > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe a data da anulação (hoje ou antes).' USING ERRCODE = '22023';
  END IF;
  v_motivo := btrim(COALESCE(v_d->>'motivo', ''));
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o motivo da anulação.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);
  SELECT count(*) INTO v_ativas FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada;
  v_total := cardinality(v_linhas) = v_ativas;
  SELECT COALESCE(array_agg(DISTINCT n.nota ORDER BY n.nota), '{}') INTO v_notas
    FROM public.emenda_linha_notas n WHERE n.linha_id = ANY (v_linhas) AND n.nota IS NOT NULL;

  PERFORM set_config('emendas.volta_da_anulacao', 'on', TRUE);

  IF v_total THEN
    -- O próprio pedido volta a "Itens reservados"; o que sai do pedido fica guardado no registro.
    SELECT jsonb_build_object(
             'etapa', v_p.etapa, 'minuta_em', v_p.minuta_em, 'oficio_documento_sei', v_p.oficio_documento_sei,
             'oficio_processo_sei', v_p.oficio_processo_sei, 'oficio_em', v_p.oficio_em, 'siop_emenda', v_p.siop_emenda,
             'siop_emenda_ano', v_p.siop_emenda_ano, 'siop_valor', v_p.siop_valor, 'siop_gnd', v_p.siop_gnd,
             'siop_conferencia', v_p.siop_conferencia, 'conferido_em', v_p.conferido_em, 'solicitado_em', v_p.solicitado_em,
             'solicitado_documento_sei', v_p.solicitado_documento_sei, 'autorizado_em', v_p.autorizado_em,
             'autorizado_documento_sei', v_p.autorizado_documento_sei, 'cgofi_em', v_p.cgofi_em,
             'cgofi_documento_sei', v_p.cgofi_documento_sei, 'empenhado_em', v_p.empenhado_em,
             'empenhado_documentos_sei', v_p.empenhado_documentos_sei, 'contratacao_em', v_p.contratacao_em,
             'contratacao_documentos_sei', v_p.contratacao_documentos_sei,
             'documentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object('etapa', d.etapa, 'documento_sei', d.documento_sei,
                                     'processo_sei', d.processo_sei, 'data', d.data_documento, 'ata_key', d.ata_key,
                                     'nota_empenho', d.nota_empenho) ORDER BY d.data_documento, d.documento_sei), '[]'::jsonb)
                              FROM public.emenda_pedido_documentos_sei d WHERE d.pedido_id = p_id))
      INTO v_antes;
    FOR v_l IN SELECT * FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada ORDER BY ordem LOOP
      v_registro := v_registro || jsonb_build_object('linha_id', v_l.id, 'nova_linha_id', v_l.id, 'tipo', v_l.tipo,
        'item_key', v_l.item_key, 'kit_nome', v_l.kit_nome, 'quantidade', v_l.quantidade,
        'empenho_documento_sei', v_l.empenho_documento_sei, 'despacho_documento_sei', v_l.despacho_documento_sei,
        'contrato_numero', v_l.contrato_numero);
    END LOOP;
    -- Documentos SEI das etapas (as solicitações levam junto as linhas cobertas e os envios à CGOFI).
    DELETE FROM public.emenda_pedido_documentos_sei WHERE pedido_id = p_id;
    DELETE FROM public.emenda_linha_notas WHERE linha_id = ANY (v_linhas);
    UPDATE public.emenda_pedido_linhas SET empenho_documento_sei = NULL, despacho_documento_sei = NULL, contrato_numero = NULL
     WHERE id = ANY (v_linhas);
    -- O aviso "sem ofício" conta da volta (devolvido_em), não da reserva antiga.
    UPDATE public.emenda_pedidos SET
      etapa = 'RESERVADO', minuta_em = NULL, minuta_documento_sei = NULL, oficio_numero = NULL, oficio_documento_sei = NULL,
      oficio_processo_sei = NULL, oficio_em = NULL, divergencia = NULL, siop_emenda = NULL, siop_emenda_ano = NULL,
      siop_valor = NULL, siop_gnd = NULL, siop_conferencia = NULL, conferido_em = NULL, solicitado_em = NULL,
      solicitado_documento_sei = NULL, autorizado_em = NULL, autorizado_documento_sei = NULL, cgofi_em = NULL,
      cgofi_documento_sei = NULL, empenhado_em = NULL, empenhado_documentos_sei = NULL, contratacao_em = NULL,
      contratacao_documentos_sei = NULL, devolvido_em = v_data
     WHERE id = p_id;
  ELSE
    -- Pedido novo com as linhas anuladas, ligado a este.
    INSERT INTO public.emenda_pedidos (autor_id, observacao, contato_nome, contato_telefone, contato_email, pedido_origem_id,
                                       criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_p.autor_id,
            format('Itens do pedido %s cujo empenho foi anulado em %s%s.', v_p.numero, to_char(v_data, 'DD/MM/YYYY'),
                   CASE WHEN cardinality(v_notas) > 0 THEN ' (' || array_to_string(v_notas, ', ') || ')' ELSE '' END),
            v_p.contato_nome, v_p.contato_telefone, v_p.contato_email, p_id, auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, numero INTO v_novo, v_numero;
    FOR v_l IN SELECT * FROM public.emenda_pedido_linhas WHERE id = ANY (v_linhas) ORDER BY ordem LOOP
      v_ordem := v_ordem + 1;
      INSERT INTO public.emenda_pedido_linhas (pedido_id, ordem, tipo, item_key, kit_id, kit_nome, kit_versao, kit_composicao,
                                               quantidade, beneficiario_id, beneficiario_nome)
      VALUES (v_novo, v_ordem, v_l.tipo, v_l.item_key, v_l.kit_id, v_l.kit_nome, v_l.kit_versao, v_l.kit_composicao,
              v_l.quantidade, v_l.beneficiario_id, v_l.beneficiario_nome)
      RETURNING id INTO v_nova;
      UPDATE public.emenda_pedido_linhas
         SET cancelada = TRUE,
             cancelada_motivo = format('Empenho anulado em %s: voltou à interlocução no pedido %s.', to_char(v_data, 'DD/MM/YYYY'), v_numero)
       WHERE id = v_l.id;
      v_registro := v_registro || jsonb_build_object('linha_id', v_l.id, 'nova_linha_id', v_nova, 'tipo', v_l.tipo,
        'item_key', v_l.item_key, 'kit_nome', v_l.kit_nome, 'quantidade', v_l.quantidade,
        'empenho_documento_sei', v_l.empenho_documento_sei, 'despacho_documento_sei', v_l.despacho_documento_sei,
        'contrato_numero', v_l.contrato_numero);
    END LOOP;
  END IF;

  INSERT INTO public.emenda_pedido_anulacoes (pedido_id, novo_pedido_id, total, notas, linhas, documento_sei, anulado_em, motivo,
                                              etapas_anteriores, criado_por, criado_por_nome)
  VALUES (p_id, v_novo, v_total, v_notas, v_registro, v_sei, v_data, left(v_motivo, 1000), v_antes, auth.uid(), v_nome)
  RETURNING id INTO v_anulacao;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  PERFORM set_config('emendas.volta_da_anulacao', 'off', TRUE);
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao, 'anulacao_id', v_anulacao, 'total', v_total,
                            'novo_pedido_id', v_novo, 'novo_numero', v_numero);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_anulacao_empenho(UUID, INTEGER, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_anulacao_empenho(UUID, INTEGER, JSONB) TO authenticated;
