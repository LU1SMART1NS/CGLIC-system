-- Fiscalização sem substituto (decisão de 11/11/2026): o substituto deixa de existir no módulo.
-- Quem age no contrato é o fiscal titular (e o coordenador); a ausência é coberta pela transferência temporária.
-- Recria as 8 funções que usavam o substituto e apaga as colunas. Para sozinha se houver substituto gravado.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fisc_contratos WHERE substituto_user_id IS NOT NULL OR substituto_nome IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.fisc_transferencias_temporarias_itens WHERE substituto_antes_id IS NOT NULL OR substituto_antes_nome IS NOT NULL) THEN
    RAISE EXCEPTION 'Há substituto gravado na fiscalização; conferir antes de apagar as colunas.';
  END IF;
END $$;

-- Registrar entregas: só o fiscal ou o coordenador.
CREATE OR REPLACE FUNCTION public.fisc_conferir_entregas(p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_n INTEGER;
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha ao menos uma entrega.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_n FROM public.fisc_entregas WHERE id = ANY (p_ids);
  IF v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_ids))) THEN
    RAISE EXCEPTION 'NOT_FOUND: Entrega não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND EXISTS (
    SELECT 1 FROM public.fisc_entregas e JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
     WHERE e.id = ANY (p_ids) AND auth.uid() IS DISTINCT FROM f.fiscal_user_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal ou o coordenador registram as entregas deste contrato.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) FOR UPDATE;
END;
$function$;

-- SEI do contrato: só o fiscal ou o coordenador.
CREATE OR REPLACE FUNCTION public.registrar_processo_fiscalizacao(p_contract_key text, p_processo_sei text, p_autuado_em date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_f    public.fisc_contratos%ROWTYPE;
  v_sei  TEXT := public.fisc_sei(p_processo_sei, 'SEI do contrato');
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_f FROM public.fisc_contratos WHERE contract_key = p_contract_key FOR UPDATE;
  IF NOT FOUND OR v_f.fiscalizacao = 'AREA' THEN
    RAISE EXCEPTION 'NOT_FOUND: Este contrato não está com a SFC/CGLIC.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND auth.uid() IS DISTINCT FROM v_f.fiscal_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal ou o coordenador registram o SEI deste contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número SEI do contrato (ex.: 25410220).' USING ERRCODE = '22023';
  END IF;
  IF p_autuado_em IS NULL OR p_autuado_em > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data do contrato (até hoje).' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fisc_contratos
     SET processo_sei = v_sei, autuado_em = p_autuado_em, atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE contract_key = p_contract_key;
  RETURN jsonb_build_object('contract_key', p_contract_key, 'processo_sei', v_sei, 'autuado_em', p_autuado_em);
END;
$function$;

-- Transferir: o destino passa a ser o fiscal dos contratos.
CREATE OR REPLACE FUNCTION public.transferir_contratos_fiscal(p_origem_user_id uuid, p_destino_user_id uuid, p_contract_keys text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_destino TEXT;
  v_nome    TEXT := left(public.nome_do_usuario_logado(), 200);
  v_titular INTEGER := 0;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador transfere os contratos do fiscal.' USING ERRCODE = '42501';
  END IF;
  IF p_origem_user_id IS NULL OR p_destino_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe de quem e para quem.' USING ERRCODE = '22023';
  END IF;
  IF p_origem_user_id = p_destino_user_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha outra pessoa para receber os contratos.' USING ERRCODE = '22023';
  END IF;
  IF p_contract_keys IS NOT NULL AND cardinality(p_contract_keys) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Marque ao menos um contrato.' USING ERRCODE = '22023';
  END IF;
  v_destino := public.fisc_nome_do_fiscal(p_destino_user_id);
  PERFORM public.fisc_destino_presente(p_destino_user_id);
  PERFORM pg_advisory_xact_lock(hashtext('fisc_transferencia:' || p_origem_user_id::text));
  IF EXISTS (SELECT 1 FROM public.fisc_transferencias_temporarias WHERE ausente_user_id = p_origem_user_id AND desfeita_em IS NULL) THEN
    RAISE EXCEPTION 'JA_AUSENTE: Este fiscal tem uma ausência em curso. Desfaça antes de transferir.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fisc_contratos f
     SET fiscal_user_id = p_destino_user_id, fiscal_nome = v_destino,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE f.fiscal_user_id = p_origem_user_id
     AND (p_contract_keys IS NULL OR f.contract_key = ANY (p_contract_keys));
  GET DIAGNOSTICS v_titular = ROW_COUNT;

  IF v_titular = 0 THEN
    IF p_contract_keys IS NULL THEN
      RAISE EXCEPTION 'NADA_A_TRANSFERIR: Este fiscal não tem contratos.' USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'NADA_A_TRANSFERIR: Nenhum dos contratos marcados é deste fiscal.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('fiscal', v_titular, 'destino', v_destino);
END;
$function$;

-- Temporária: quem assume vira o fiscal; o Desfazer devolve.
CREATE OR REPLACE FUNCTION public.transferir_contratos_fiscal_temporaria(p_ausente_user_id uuid, p_destino_user_id uuid, p_motivo text, p_inicio date, p_retorno_previsto date, p_sei_numero text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_motivo  TEXT := upper(btrim(COALESCE(p_motivo, '')));
  v_destino TEXT;
  v_ausente TEXT;
  v_nome    TEXT := left(public.nome_do_usuario_logado(), 200);
  v_id      UUID;
  v_qtd     INTEGER := 0;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador transfere os contratos do fiscal.' USING ERRCODE = '42501';
  END IF;
  IF p_ausente_user_id IS NULL OR p_destino_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe quem sai e quem assume.' USING ERRCODE = '22023';
  END IF;
  IF p_ausente_user_id = p_destino_user_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Os contratos não podem ir para quem está saindo.' USING ERRCODE = '22023';
  END IF;
  IF v_motivo NOT IN ('FERIAS', 'LICENCA', 'AFASTAMENTO', 'OUTRO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Motivo deve ser FERIAS, LICENCA, AFASTAMENTO ou OUTRO.' USING ERRCODE = '22023';
  END IF;
  IF p_inicio IS NULL OR p_retorno_previsto IS NULL OR p_retorno_previsto < p_inicio THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O retorno previsto deve ser igual ou depois da saída.' USING ERRCODE = '22023';
  END IF;
  v_destino := public.fisc_nome_do_fiscal(p_destino_user_id);
  PERFORM public.fisc_destino_presente(p_destino_user_id);
  PERFORM pg_advisory_xact_lock(hashtext('fisc_transferencia:' || p_ausente_user_id::text));
  IF EXISTS (SELECT 1 FROM public.fisc_transferencias_temporarias WHERE ausente_user_id = p_ausente_user_id AND desfeita_em IS NULL) THEN
    RAISE EXCEPTION 'JA_AUSENTE: Este fiscal já tem uma ausência em curso. Desfaça antes.' USING ERRCODE = '22023';
  END IF;

  SELECT f.fiscal_nome INTO v_ausente FROM public.fisc_contratos f WHERE f.fiscal_user_id = p_ausente_user_id LIMIT 1;
  IF v_ausente IS NULL THEN
    RAISE EXCEPTION 'NADA_A_TRANSFERIR: Este fiscal não é o fiscal de nenhum contrato.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fisc_transferencias_temporarias
    (ausente_user_id, ausente_nome, destino_user_id, destino_nome, motivo, inicio, retorno_previsto, sei_numero, criado_por_user_id, criado_por_nome)
  VALUES (p_ausente_user_id, v_ausente, p_destino_user_id, v_destino, v_motivo, p_inicio, p_retorno_previsto,
          NULLIF(btrim(COALESCE(p_sei_numero, '')), ''), auth.uid(), v_nome)
  RETURNING id INTO v_id;

  INSERT INTO public.fisc_transferencias_temporarias_itens (transferencia_id, contract_key)
  SELECT v_id, f.contract_key
    FROM public.fisc_contratos f
   WHERE f.fiscal_user_id = p_ausente_user_id;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  -- Quem assume vira o fiscal no período.
  UPDATE public.fisc_contratos f
     SET fiscal_user_id = p_destino_user_id, fiscal_nome = v_destino,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE f.fiscal_user_id = p_ausente_user_id;

  RETURN jsonb_build_object('id', v_id, 'contratos', v_qtd, 'destino', v_destino);
END;
$function$;

-- Desfazer: devolve o fiscal de antes.
CREATE OR REPLACE FUNCTION public.desfazer_transferencia_fiscal(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_t          RECORD;
  v_item       RECORD;
  v_f          RECORD;
  v_nome       TEXT := left(public.nome_do_usuario_logado(), 200);
  v_devolvidos INTEGER := 0;
  v_ficaram    INTEGER := 0;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador desfaz a transferência.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM public.fisc_transferencias_temporarias WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Transferência não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF v_t.desfeita_em IS NOT NULL THEN
    RAISE EXCEPTION 'JA_DESFEITA: Esta transferência já foi desfeita.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM public.fisc_transferencias_temporarias_itens WHERE transferencia_id = p_id ORDER BY contract_key LOOP
    SELECT * INTO v_f FROM public.fisc_contratos WHERE contract_key = v_item.contract_key FOR UPDATE;
    IF FOUND AND v_f.fiscal_user_id = v_t.destino_user_id THEN
      UPDATE public.fisc_contratos f
         SET fiscal_user_id = v_t.ausente_user_id, fiscal_nome = v_t.ausente_nome,
             atualizado_por_nome = v_nome, atualizado_em = NOW()
       WHERE f.contract_key = v_item.contract_key;
      UPDATE public.fisc_transferencias_temporarias_itens SET devolvido = true WHERE id = v_item.id;
      v_devolvidos := v_devolvidos + 1;
    ELSE
      UPDATE public.fisc_transferencias_temporarias_itens SET devolvido = false WHERE id = v_item.id;
      v_ficaram := v_ficaram + 1;
    END IF;
  END LOOP;

  UPDATE public.fisc_transferencias_temporarias
     SET desfeita_em = NOW(), desfeita_por_user_id = auth.uid(), desfeita_por_nome = v_nome
   WHERE id = p_id;
  RETURN jsonb_build_object('devolvidos', v_devolvidos, 'ficaram', v_ficaram);
END;
$function$;

-- Definir: sem o parâmetro do substituto (assinatura nova; permissões como antes: só authenticated).
DROP FUNCTION public.definir_fiscalizacao_contrato(text, text, uuid, uuid, text, text);
CREATE FUNCTION public.definir_fiscalizacao_contrato(p_contract_key text, p_fiscalizacao text, p_fiscal_user_id uuid, p_portaria_sei text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uasg      TEXT;
  v_emenda    BOOLEAN;
  v_fiscal    TEXT;
  v_portaria  TEXT := public.fisc_sei(p_portaria_sei, 'Portaria');
  v_motivo    TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_nome      TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador decide quem fiscaliza o contrato.' USING ERRCODE = '42501';
  END IF;
  IF p_fiscalizacao IS NULL OR p_fiscalizacao NOT IN ('SFC', 'MISTA', 'AREA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Fiscalização deve ser SFC, MISTA ou AREA.' USING ERRCODE = '22023';
  END IF;
  SELECT c.uasg INTO v_uasg FROM public.contratos_oficiais c WHERE c.contract_key = p_contract_key ORDER BY c.sincronizado_em DESC LIMIT 1;
  IF v_uasg IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Contrato não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  v_emenda := cardinality(public.fisc_emendas_do_contrato(p_contract_key)) > 0;
  -- Fugir do padrão (emenda com a área requisitante, ou contrato sem emenda com a SFC/CGLIC) pede motivo.
  IF (v_emenda AND p_fiscalizacao = 'AREA') OR (NOT v_emenda AND p_fiscalizacao <> 'AREA') THEN
    IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo (ao menos 10 letras).' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_fiscalizacao = 'AREA' THEN
    IF p_fiscal_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Contrato com a área requisitante não tem fiscal da SFC/CGLIC.' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_fiscal_user_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha o fiscal.' USING ERRCODE = '22023';
    END IF;
    v_fiscal := public.fisc_nome_do_fiscal(p_fiscal_user_id);
  END IF;

  INSERT INTO public.fisc_contratos AS f (contract_key, uasg, fiscalizacao, motivo, fiscal_user_id, fiscal_nome,
                                          portaria_sei, definido_por, definido_por_nome, atualizado_por_nome)
  VALUES (p_contract_key, v_uasg, p_fiscalizacao, v_motivo,
          CASE WHEN p_fiscalizacao = 'AREA' THEN NULL ELSE p_fiscal_user_id END, v_fiscal,
          CASE WHEN p_fiscalizacao = 'AREA' THEN NULL ELSE v_portaria END,
          auth.uid(), v_nome, v_nome)
  ON CONFLICT (contract_key) DO UPDATE
    SET fiscalizacao = EXCLUDED.fiscalizacao, motivo = EXCLUDED.motivo,
        fiscal_user_id = EXCLUDED.fiscal_user_id, fiscal_nome = EXCLUDED.fiscal_nome,
        portaria_sei = COALESCE(EXCLUDED.portaria_sei, CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.portaria_sei END),
        processo_sei = CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.processo_sei END,
        autuado_em = CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.autuado_em END,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();

  RETURN jsonb_build_object('contract_key', p_contract_key, 'fiscalizacao', p_fiscalizacao, 'fiscal', v_fiscal);
END;
$function$;
REVOKE ALL ON FUNCTION public.definir_fiscalizacao_contrato(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_fiscalizacao_contrato(text, text, uuid, text, text) TO authenticated;

-- Listas: sem as colunas do substituto (tipo de retorno novo; permissões como antes: só authenticated).
DROP FUNCTION public.fisc_contratos_para_distribuicao();
CREATE FUNCTION public.fisc_contratos_para_distribuicao()
 RETURNS TABLE(contract_key text, uasg text, numero text, fornecedor text, objeto text, assinatura date, vigencia_fim date, emendas text[], situacao text, motivo text, fiscal_user_id uuid, fiscal_nome text, portaria_sei text, processo_sei text, autuado_em date, definido_por_nome text, definido_em timestamp with time zone, atas text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH emendas AS (
    SELECT n.contract_key AS chave, array_agg(DISTINCT p.siop_emenda::TEXT ORDER BY p.siop_emenda::TEXT) FILTER (WHERE p.siop_emenda IS NOT NULL) AS lista, TRUE AS de_emenda
      FROM public.emenda_linha_notas n
      JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id AND NOT l.cancelada
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
     WHERE n.contract_key IS NOT NULL
     GROUP BY n.contract_key
  ),
  atas AS (
    -- A chave do item da ata é "ata-UASG-item" (00031/2025-200331-00002).
    SELECT k.contract_key AS chave, array_agg(DISTINCT split_part(k.item_key, '-', 1) ORDER BY split_part(k.item_key, '-', 1)) AS lista
      FROM public.arp_item_contract_links k
     GROUP BY k.contract_key
  ),
  contratos AS (
    SELECT DISTINCT ON (c.contract_key) c.*
      FROM public.contratos_oficiais c
     ORDER BY c.contract_key, c.sincronizado_em DESC
  )
  SELECT c.contract_key::TEXT,
         c.uasg::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         (c.registro->>'objeto')::TEXT,
         NULLIF(c.registro->>'dataAssinatura', '')::DATE,
         c.data_vigencia_fim,
         COALESCE(e.lista, ARRAY[]::TEXT[]),
         CASE WHEN f.contract_key IS NOT NULL THEN f.fiscalizacao::TEXT
              WHEN e.de_emenda THEN 'A_DEFINIR'
              ELSE 'AREA_PADRAO' END,
         f.motivo, f.fiscal_user_id, f.fiscal_nome::TEXT,
         f.portaria_sei::TEXT, f.processo_sei::TEXT, f.autuado_em, f.definido_por_nome::TEXT, f.definido_em,
         COALESCE(at.lista, ARRAY[]::TEXT[])
    FROM contratos c
    LEFT JOIN emendas e ON e.chave = c.contract_key
    LEFT JOIN atas at ON at.chave = c.contract_key
    LEFT JOIN public.fisc_contratos f ON f.contract_key = c.contract_key
   WHERE f.contract_key IS NOT NULL
      OR c.data_vigencia_fim IS NULL
      OR c.data_vigencia_fim >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_contratos_para_distribuicao() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_contratos_para_distribuicao() TO authenticated;

DROP FUNCTION public.fisc_entregas_lista(text);
CREATE FUNCTION public.fisc_entregas_lista(p_contrato text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, contract_key text, contrato_numero text, fornecedor text, fiscal_user_id uuid, fiscal_nome text, fiscalizacao text, item_key text, item_nome text, item_descricao text, item_texto text, beneficiario_id uuid, beneficiario_nome text, beneficiario_sigla text, beneficiario_razao text, beneficiario_texto text, municipio text, uf text, quantidade integer, origem text, emenda text, pedido_id uuid, responsavel text, etapa text, etapa_em date, prevista date, entregue_em date, dividida_de uuid, programa_texto text, carga_linha integer, faturado_em date, pago_em date, atualizado_por_nome text, atualizado_em timestamp with time zone, programa_id uuid, programa_ativo boolean, parlamentar_nome text, entrega_logradouro text, entrega_numero text, entrega_complemento text, entrega_bairro text, entrega_cep text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.contract_key::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero, e.contract_key)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         f.fiscal_user_id, f.fiscal_nome::TEXT, f.fiscalizacao::TEXT,
         e.item_key::TEXT, i.nome_curto::TEXT, i.descricao_item::TEXT, e.item_texto,
         e.beneficiario_id, COALESCE(b.nome, b.nome_curto)::TEXT, b.sigla::TEXT, b.razao_social::TEXT, e.beneficiario_texto, COALESCE(b.entrega_municipio, e.municipio_texto)::TEXT, COALESCE(b.entrega_uf, e.uf_texto)::TEXT,
         e.quantidade, e.origem::TEXT, COALESCE(p.siop_emenda::TEXT, e.emenda_texto), p.id,
         e.responsavel::TEXT, e.etapa::TEXT, e.etapa_em, e.prevista, e.entregue_em, e.dividida_de,
         COALESCE(pr.nome, e.programa_texto)::TEXT, e.carga_linha,
         n.faturado_em::DATE, n.pago_em::DATE, e.atualizado_por_nome::TEXT, e.atualizado_em,
         e.programa_id, pr.ativo, a.nome::TEXT,
         b.entrega_logradouro::TEXT, b.entrega_numero::TEXT, b.entrega_complemento::TEXT, b.entrega_bairro::TEXT, b.entrega_cep::TEXT
    FROM public.fisc_entregas e
    JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
    LEFT JOIN LATERAL (SELECT co.* FROM public.contratos_oficiais co WHERE co.contract_key = e.contract_key ORDER BY co.sincronizado_em DESC LIMIT 1) c ON TRUE
    LEFT JOIN public.v_emendas_itens_caep i ON i.item_key = e.item_key
    LEFT JOIN public.emenda_beneficiarios b ON b.id = e.beneficiario_id
    LEFT JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
    LEFT JOIN public.emenda_pedidos p ON p.id = l.pedido_id
    LEFT JOIN public.emenda_autores a ON a.id = p.autor_id
    LEFT JOIN public.emenda_linha_notas n ON n.linha_id = e.emenda_linha_id
    LEFT JOIN public.fisc_programas pr ON pr.id = e.programa_id
   WHERE p_contrato IS NULL OR e.contract_key = p_contrato;
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_entregas_lista(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_lista(text) TO authenticated;

-- Colunas do substituto.
DROP INDEX IF EXISTS public.ix_fisc_contratos_substituto;
DROP INDEX IF EXISTS public.ix_fisc_transferencias_itens_subst;
ALTER TABLE public.fisc_contratos DROP COLUMN substituto_user_id, DROP COLUMN substituto_nome;
ALTER TABLE public.fisc_transferencias_temporarias_itens DROP COLUMN substituto_antes_id, DROP COLUMN substituto_antes_nome;
