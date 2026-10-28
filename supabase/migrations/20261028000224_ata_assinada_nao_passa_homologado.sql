-- ==============================================================================
-- Versão: 20261028000224_ata_assinada_nao_passa_homologado.sql
-- A quantidade da ata assinada distribui, entre a SENASP e os participantes, o que a licitação homologou: a soma
-- não pode passar do homologado. Em 27/10/2026 havia 4 itens com a soma diferente (3 acima, 1 abaixo); acima do
-- homologado, a SENASP inflada escondia o excedente dela no aviso "registrado acima" e a cota ficava alta. Os 4
-- foram corrigidos pela homologação do PNCP. Daqui em diante, informar_quantidades_ata_assinada recusa soma acima
-- do homologado; abaixo continua gravando, com o aviso "soma não fecha".
-- Definição gerada a partir da produção (pg_get_functiondef); só a trava muda. Mesma assinatura: permissões mantidas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.informar_quantidades_ata_assinada(p_item_key character varying, p_quantidades jsonb, p_documento_sei text, p_justificativa text DEFAULT NULL::text, p_versao_vista text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key       VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_doc       TEXT := btrim(COALESCE(p_documento_sei, ''));
  v_just      TEXT := NULLIF(btrim(COALESCE(p_justificativa, '')), '');
  v_homologado NUMERIC;
  v_copia     JSONB;
  v_elem      JSONB;
  v_uasg      TEXT;
  v_nome      TEXT;
  v_qtd       NUMERIC;
  v_lista     JSONB := '[]'::JSONB;
  v_total     NUMERIC := 0;
  v_ja_tem    BOOLEAN;
  v_doc_ant   TEXT;
  v_lista_ant JSONB;
  v_papel     TEXT;
BEGIN
  PERFORM public.exigir_alcance_do_gestor(NULL, (public.ata_key_from_item_key(p_item_key))::text);  -- alcance do gestor (migration 126)
  -- conflito de edição (migration 129)
  IF p_versao_vista IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('ata_assinada:' || btrim(COALESCE(p_item_key, ''))));
    IF public.versao_ata_assinada(btrim(COALESCE(p_item_key, ''))) IS DISTINCT FROM p_versao_vista THEN
      RAISE EXCEPTION 'CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.' USING ERRCODE = '40001';
    END IF;
  END IF;
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa as quantidades da ata assinada.'
      USING ERRCODE = '42501';
  END IF;

  -- Ata da SENASP: todos os órgãos. Ata de outro órgão em que a SENASP é participante (migration 114): só a SENASP.
  SELECT COALESCE(i.quantidade_homologada, 0),
         CASE WHEN a.codigo_uasg IN ('200330', '200331') THEN 'GERENCIADORA' ELSE COALESCE(a.papel_senasp, 'PARTICIPANTE') END
    INTO v_homologado, v_papel
    FROM public.itens_ata i
    JOIN public.atas_registro_preco a ON a.id = i.ata_id
   WHERE (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::TEXT, 5, '0')) = v_key
     AND (a.codigo_uasg IN ('200330', '200331') OR a.uasg_carteira IN ('200330', '200331'));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO: O item % não está numa ata da carteira da SENASP.', v_key
      USING ERRCODE = 'P0002';
  END IF;
  IF v_papel = 'ADESAO' THEN
    RAISE EXCEPTION 'ADESAO_SEM_ATA_ASSINADA: Na adesão não há ata assinada: a quantidade da SENASP é a aprovada pela gerenciadora no Compras.gov.br.'
      USING ERRCODE = '22023';
  END IF;

  IF v_doc !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT: O número do documento SEI tem 8 dígitos (ex.: 12345678).'
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidades IS NULL OR jsonb_typeof(p_quantidades) <> 'array' OR jsonb_array_length(p_quantidades) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a quantidade de ao menos um órgão.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_quantidades) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 órgãos por item.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ata_assinada:' || v_key));

  SELECT c.unidades INTO v_copia FROM public.itens_ata_unidades_copia c WHERE c.item_key = v_key;

  FOR v_elem IN SELECT e FROM jsonb_array_elements(p_quantidades) AS e LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: cada órgão deve ser um objeto com uasg e quantidade.' USING ERRCODE = '22023';
    END IF;
    v_uasg := regexp_replace(COALESCE(v_elem->>'uasg', ''), '\D', '', 'g');
    IF v_uasg !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION 'INVALID_UASG: A UASG tem 6 dígitos (recebido: "%").', v_elem->>'uasg' USING ERRCODE = '22023';
    END IF;
    IF v_papel <> 'GERENCIADORA' AND v_uasg NOT IN ('200330', '200331') THEN
      RAISE EXCEPTION 'SO_SENASP: Na ata de outro órgão, informe só a quantidade da SENASP (UASG 200330 ou 200331), não a da UASG %.', v_uasg
        USING ERRCODE = '22023';
    END IF;
    IF v_lista @> jsonb_build_array(jsonb_build_object('uasg', v_uasg)) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A UASG % aparece mais de uma vez.', v_uasg USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_qtd := (v_elem->>'quantidade')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: Quantidade inválida para a UASG %.', v_uasg USING ERRCODE = '22023';
    END;
    IF v_qtd IS NULL OR v_qtd < 0 OR v_qtd <> trunc(v_qtd) THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade da UASG % precisa ser um número inteiro, zero ou mais.', v_uasg USING ERRCODE = '22023';
    END IF;
    v_nome := NULLIF(left(btrim(COALESCE(v_elem->>'nome', '')), 200), '');
    IF v_nome IS NULL AND NOT EXISTS (SELECT 1 FROM public.registrado_por_uasg(v_copia) r WHERE r.uasg = v_uasg) THEN
      RAISE EXCEPTION 'NOME_OBRIGATORIO: A UASG % não está na lista do Compras.gov.br: informe o nome do órgão.', v_uasg USING ERRCODE = '22023';
    END IF;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object('uasg', v_uasg, 'quantidade', v_qtd, 'nome', v_nome));
    v_total := v_total + v_qtd;
  END LOOP;

  -- Migration 224: a ata assinada distribui o que a licitação homologou; a soma não pode passar do homologado
  -- (em 27/10/2026, 00081/2024 e 00084/2024 tinham a SENASP com o homologado inteiro, e os participantes por cima).
  IF v_homologado > 0 AND v_total > v_homologado THEN
    RAISE EXCEPTION 'SOMA_ACIMA_DO_HOMOLOGADO: A soma (%) passa do homologado (%) em %. Confira a ata: algum órgão está com mais do que a licitação homologou.',
      trim_scale(v_total), trim_scale(v_homologado), trim_scale(v_total - v_homologado) USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.ata_item_assinada_registros r WHERE r.item_key = v_key) INTO v_ja_tem;
  IF v_ja_tem THEN
    IF v_just IS NULL OR length(v_just) NOT BETWEEN 15 AND 500 THEN
      RAISE EXCEPTION 'INVALID_JUSTIFICATION: Para corrigir as quantidades, escreva a justificativa (15 a 500 caracteres).'
        USING ERRCODE = '22023';
    END IF;
    SELECT r.documento_sei INTO v_doc_ant FROM public.ata_item_assinada_registros r
     WHERE r.item_key = v_key ORDER BY r.informado_em DESC LIMIT 1;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('uasg', q.uasg, 'quantidade', q.quantidade) ORDER BY q.uasg), '[]'::JSONB)
      INTO v_lista_ant FROM public.ata_item_quantidade_assinada q WHERE q.item_key = v_key;
    IF v_doc_ant = v_doc AND v_lista_ant = (
         SELECT COALESCE(jsonb_agg(jsonb_build_object('uasg', x->>'uasg', 'quantidade', (x->>'quantidade')::NUMERIC) ORDER BY x->>'uasg'), '[]'::JSONB)
           FROM jsonb_array_elements(v_lista) x) THEN
      RAISE EXCEPTION 'NO_CHANGE: As quantidades e o documento são os mesmos já informados.' USING ERRCODE = '22023';
    END IF;
  ELSIF v_just IS NOT NULL AND length(v_just) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: A justificativa precisa ter de 15 a 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.ata_item_quantidade_assinada WHERE item_key = v_key;
  INSERT INTO public.ata_item_quantidade_assinada (item_key, uasg, nome_orgao, quantidade)
  SELECT v_key, x->>'uasg', x->>'nome', (x->>'quantidade')::NUMERIC FROM jsonb_array_elements(v_lista) x;

  INSERT INTO public.ata_item_assinada_registros
    (item_key, documento_sei, justificativa, quantidades, total, informado_por_user_id, informado_por_nome)
  VALUES (v_key, v_doc, v_just, v_lista, v_total, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'));

  RETURN jsonb_build_object('item_key', v_key, 'total', v_total, 'homologado', v_homologado, 'diferenca', v_total - v_homologado);
END;
$function$;
