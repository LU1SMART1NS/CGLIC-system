-- Fiscalização: repartir um item entre beneficiários (como o "Repartir" da Reserva nas Emendas).
--
-- Um item da planilha da SFC (ou incluído à mão) pode ser de vários órgãos: ex.: 21 vagas de curso, cada órgão com
-- algumas. O fiscal do contrato ou o coordenador informa a quantidade de cada beneficiário; a soma tem que fechar com a
-- quantidade do item. A 1ª parte fica no item de hoje (troca o beneficiário se for outro); as outras viram itens novos
-- com a mesma etapa, data prevista, programa e textos da planilha (dividida_de = item de hoje, como na Entrega parcial).
-- Motivo e SEI uma vez só, no histórico de cada parte (tipo DIVISAO). Tudo numa transação: ou reparte tudo, ou nada.
-- Item de emenda não reparte aqui: o beneficiário vem das linhas do pedido.

CREATE OR REPLACE FUNCTION public.dividir_entrega_entre_beneficiarios(p_id uuid, p_partes jsonb, p_motivo text, p_documento_sei text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_sei    TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI');
  v_nome   TEXT := left(public.nome_do_usuario_logado(), 200);
  e        public.fisc_entregas%ROWTYPE;
  v_antes  TEXT;
  v_n      INTEGER;
  v_soma   INTEGER;
  v_lista  TEXT;
  p        RECORD;
  v_novo   UUID;
  v_primeira BOOLEAN := TRUE;
BEGIN
  -- Permissão (fiscal do contrato ou coordenador), item existe e não está encerrado; trava a linha.
  PERFORM public.fisc_conferir_entregas(ARRAY[p_id]);
  SELECT * INTO e FROM public.fisc_entregas WHERE id = p_id;

  IF e.emenda_linha_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este item veio de emenda: o beneficiário é o da linha do pedido, e a repartição é no Pedido 360.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo da repartição (10 letras ou mais).' USING ERRCODE = '22023';
  END IF;
  IF v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número SEI do documento que indica a repartição.' USING ERRCODE = '22023';
  END IF;
  IF p_partes IS NULL OR jsonb_typeof(p_partes) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe as partes (beneficiário e quantidade).' USING ERRCODE = '22023';
  END IF;

  -- As partes, na ordem enviada (a 1ª fica no item de hoje).
  CREATE TEMP TABLE IF NOT EXISTS fisc_repartir (ordem int, beneficiario_id uuid, quantidade int) ON COMMIT DROP;
  TRUNCATE fisc_repartir;
  BEGIN
    INSERT INTO fisc_repartir
    SELECT x.ordem::int, (x.parte->>'beneficiario_id')::uuid, (x.parte->>'quantidade')::int
      FROM jsonb_array_elements(p_partes) WITH ORDINALITY AS x(parte, ordem);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Parte com beneficiário ou quantidade inválidos.' USING ERRCODE = '22023';
  END;

  SELECT count(*), COALESCE(sum(quantidade), 0) INTO v_n, v_soma FROM fisc_repartir;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Reparta entre ao menos 2 beneficiários. Para passar tudo a outro, use Trocar beneficiário.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM fisc_repartir WHERE beneficiario_id IS NULL OR quantidade IS NULL OR quantidade < 1) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Cada parte precisa de um beneficiário do cadastro e de 1 unidade ou mais.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT beneficiario_id) FROM fisc_repartir) <> v_n THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O mesmo beneficiário aparece em mais de uma parte.' USING ERRCODE = '22023';
  END IF;
  IF v_soma <> e.quantidade THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A soma das partes (%) tem que ser igual à quantidade do item (%).', v_soma, e.quantidade USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM fisc_repartir r LEFT JOIN public.emenda_beneficiarios b ON b.id = r.beneficiario_id WHERE b.id IS NULL OR NOT b.ativo) THEN
    RAISE EXCEPTION 'NOT_FOUND: Beneficiário não encontrado no cadastro (ou desativado).' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(b.nome, b.nome_curto) || COALESCE(' · ' || NULLIF(b.sigla, ''), '') INTO v_antes
    FROM public.emenda_beneficiarios b WHERE b.id = e.beneficiario_id;
  v_antes := COALESCE(v_antes, NULLIF(btrim(COALESCE(e.beneficiario_texto, '')), '') || ' (sem cadastro)', 'sem beneficiário');
  SELECT string_agg(r.quantidade || ' para ' || COALESCE(NULLIF(b.sigla, ''), COALESCE(b.nome, b.nome_curto)), ', ' ORDER BY r.ordem) INTO v_lista
    FROM fisc_repartir r JOIN public.emenda_beneficiarios b ON b.id = r.beneficiario_id;

  FOR p IN SELECT r.*, COALESCE(b.nome, b.nome_curto) || COALESCE(' · ' || NULLIF(b.sigla, ''), '') AS rotulo
             FROM fisc_repartir r JOIN public.emenda_beneficiarios b ON b.id = r.beneficiario_id ORDER BY r.ordem LOOP
    IF v_primeira THEN
      UPDATE public.fisc_entregas
         SET quantidade = p.quantidade, beneficiario_id = p.beneficiario_id, atualizado_por_nome = v_nome, atualizado_em = NOW()
       WHERE id = p_id;
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, documento_sei, observacao, criado_por, criado_por_nome)
      VALUES (p_id, 'DIVISAO', v_sei,
              left(format('Repartido entre %s beneficiários (%s unidades de %s): %s. Ficaram %s com %s. Motivo: %s',
                          v_n, e.quantidade, v_antes, v_lista, p.quantidade, p.rotulo, v_motivo), 1000),
              auth.uid(), v_nome);
      v_primeira := FALSE;
    ELSE
      INSERT INTO public.fisc_entregas (contract_key, emenda_linha_id, item_key, beneficiario_id, quantidade, origem, responsavel, etapa, etapa_em, prevista, entregue_em, dividida_de, atualizado_por_nome,
                                        item_texto, beneficiario_texto, municipio_texto, uf_texto, emenda_texto, programa_texto, carga_linha, programa_id)
      VALUES (e.contract_key, NULL, e.item_key, p.beneficiario_id, p.quantidade, e.origem, e.responsavel, e.etapa, e.etapa_em, e.prevista, e.entregue_em, p_id, v_nome,
              e.item_texto, e.beneficiario_texto, e.municipio_texto, e.uf_texto, e.emenda_texto, e.programa_texto, e.carga_linha, e.programa_id)
      RETURNING id INTO v_novo;
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, documento_sei, observacao, criado_por, criado_por_nome)
      VALUES (v_novo, 'DIVISAO', v_sei,
              left(format('%s de %s unidades para %s, repartidas do item de %s. Motivo: %s', p.quantidade, e.quantidade, p.rotulo, v_antes, v_motivo), 1000),
              auth.uid(), v_nome);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', p_id, 'itens', v_n);
END;
$function$;
REVOKE ALL ON FUNCTION public.dividir_entrega_entre_beneficiarios(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dividir_entrega_entre_beneficiarios(uuid, jsonb, text, text) TO authenticated;
