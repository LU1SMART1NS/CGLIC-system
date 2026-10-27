-- ==============================================================================
-- Anulação de empenho: opção "Só cancelar os itens" (26/10/2026)
--
-- Na migration 203 a anulação sempre devolvia os itens à interlocução (pedido novo, ou o próprio pedido de volta a
-- "Itens reservados"). Caso real de 26/10/2026: no pedido 528 a NE 250 (smartphones da cota reservada) foi anulada e a
-- compra já tinha sido refeita no mesmo pedido pela NE 422 (cota ampla); a volta à interlocução abriu o pedido 607 com
-- uma compra que já existe. Agora o gestor escolhe:
--   - INTERLOCUCAO (padrão): igual à migration 203.
--   - CANCELAR: as linhas marcadas são canceladas, com o motivo, sem pedido novo; a quantidade volta ao saldo da CAEP.
--     Se são todas as linhas ativas, o pedido inteiro é cancelado (as etapas e os documentos SEI ficam nele).
-- ==============================================================================

ALTER TABLE public.emenda_pedido_anulacoes ADD COLUMN IF NOT EXISTS destino VARCHAR(12) NOT NULL DEFAULT 'INTERLOCUCAO';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_pedido_anulacoes_destino') THEN
    ALTER TABLE public.emenda_pedido_anulacoes
      ADD CONSTRAINT emenda_pedido_anulacoes_destino CHECK (destino IN ('INTERLOCUCAO', 'CANCELAR'));
  END IF;
END $$;
COMMENT ON COLUMN public.emenda_pedido_anulacoes.destino IS
  'O que aconteceu com os itens: INTERLOCUCAO (voltaram a "Itens reservados") ou CANCELAR (só cancelados, migration 208).';

-- Registra a anulação. p_dados: { linhas: [uuid das linhas anuladas], documento_sei, data, motivo, destino }.
-- destino: 'INTERLOCUCAO' (padrão, igual à migration 203) ou 'CANCELAR' (os itens saem sem voltar à interlocução).
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
  v_destino  TEXT := COALESCE(NULLIF(btrim(v_d->>'destino'), ''), 'INTERLOCUCAO');
  v_texto    TEXT;
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

  IF v_destino NOT IN ('INTERLOCUCAO', 'CANCELAR') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha se os itens voltam à interlocução ou só são cancelados.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);
  SELECT count(*) INTO v_ativas FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada;
  v_total := cardinality(v_linhas) = v_ativas;
  SELECT COALESCE(array_agg(DISTINCT n.nota ORDER BY n.nota), '{}') INTO v_notas
    FROM public.emenda_linha_notas n WHERE n.linha_id = ANY (v_linhas) AND n.nota IS NOT NULL;

  PERFORM set_config('emendas.volta_da_anulacao', 'on', TRUE);
  v_texto := format('Empenho anulado em %s%s', to_char(v_data, 'DD/MM/YYYY'),
                    CASE WHEN cardinality(v_notas) > 0 THEN ' (' || array_to_string(v_notas, ', ') || ')' ELSE '' END);

  IF v_destino = 'CANCELAR' THEN
    -- Só cancelar: a compra foi refeita em outra nota ou não vai acontecer. Nada volta à interlocução e a quantidade
    -- volta ao saldo da CAEP. Todas as linhas: o pedido inteiro é cancelado (as etapas e os documentos ficam nele).
    FOR v_l IN SELECT * FROM public.emenda_pedido_linhas WHERE id = ANY (v_linhas) ORDER BY ordem LOOP
      v_registro := v_registro || jsonb_build_object('linha_id', v_l.id, 'nova_linha_id', NULL, 'tipo', v_l.tipo,
        'item_key', v_l.item_key, 'kit_nome', v_l.kit_nome, 'quantidade', v_l.quantidade,
        'empenho_documento_sei', v_l.empenho_documento_sei, 'despacho_documento_sei', v_l.despacho_documento_sei,
        'contrato_numero', v_l.contrato_numero);
    END LOOP;
    IF v_total THEN
      UPDATE public.emenda_pedidos
         SET etapa = 'CANCELADO', cancelado_em = (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE,
             cancelado_motivo = left(v_texto || ': ' || v_motivo, 500)
       WHERE id = p_id;
    ELSE
      UPDATE public.emenda_pedido_linhas
         SET cancelada = TRUE, cancelada_motivo = left(v_texto || ': item cancelado, sem volta à interlocução.', 500)
       WHERE id = ANY (v_linhas);
    END IF;
  ELSIF v_total THEN
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
                                              etapas_anteriores, destino, criado_por, criado_por_nome)
  VALUES (p_id, v_novo, v_total, v_notas, v_registro, v_sei, v_data, left(v_motivo, 1000), v_antes, v_destino, auth.uid(), v_nome)
  RETURNING id INTO v_anulacao;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  PERFORM set_config('emendas.volta_da_anulacao', 'off', TRUE);
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao, 'anulacao_id', v_anulacao, 'total', v_total, 'destino', v_destino,
                            'novo_pedido_id', v_novo, 'novo_numero', v_numero);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_anulacao_empenho(UUID, INTEGER, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_anulacao_empenho(UUID, INTEGER, JSONB) TO authenticated;
