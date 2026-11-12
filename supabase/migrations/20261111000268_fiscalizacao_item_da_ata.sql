-- Fiscalização, entrega 3: os itens da planilha da SFC/CGLIC (origem CARGA, sem item_key) ganham o item da ata.
-- 1) fisc_normalizar(texto): minúsculas, sem acento, só letras e números (para comparar o nome escrito na planilha).
-- 2) fisc_item_da_ata(item_key): número, nome curto da CAEP e descrição do item (qualquer item, não só os das emendas).
--    A lista de itens (fisc_entregas_lista) passa a ler o nome por ela: itens fora da unidade das emendas tinham nome vazio.
-- 3) fisc_itens_da_ata_do_contrato(contrato): os itens da ata ligados ao contrato (arp_item_contract_links), com o contratado.
-- 4) ligar_entregas_ao_item_da_ata(ids, item): o fiscal ou o coordenador escolhe o item; histórico tipo ITEM com quem conferiu.
-- 5) fisc_ligar_itens_automaticos(): liga sozinho quando é seguro (medição de 11/11/2026: 1.513 de 1.959 itens):
--    UNICO = o contrato tem um só item da ata; NOME = um único item do contrato tem o nome curto igual ao texto da planilha.
--    Trava: só contratos cuja ligação à ata não muda há 24 horas (a Vinculação pode estar ligando o 2º item).
--    Roda agora e de hora em hora (pg_cron), para os contratos que a Vinculação ligar à ata depois.

ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT IF EXISTS fisc_entrega_movimentos_tipo;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo
  CHECK (tipo IN ('CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA', 'PROGRAMA', 'ITEM'));

CREATE OR REPLACE FUNCTION public.fisc_normalizar(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT btrim(regexp_replace(translate(lower(COALESCE(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g'));
$function$;

-- A chave do item da ata é "ata-UASG-item" (00031/2025-200331-00002).
CREATE OR REPLACE FUNCTION public.fisc_item_da_ata(p_item_key text)
 RETURNS TABLE(nome_curto text, descricao_item text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT d.nome_curto::TEXT, i.descricao_item::TEXT
    FROM public.atas_registro_preco r
    JOIN public.itens_ata i ON i.ata_id = r.id AND lpad(i.numero_item::TEXT, 5, '0') = split_part(p_item_key, '-', 3)
    LEFT JOIN public.emenda_itens_dados d ON d.item_key = p_item_key
   WHERE p_item_key IS NOT NULL
     AND r.numero_ata = split_part(p_item_key, '-', 1) AND r.codigo_uasg = split_part(p_item_key, '-', 2)
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.fisc_item_da_ata(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fisc_rotulo_do_item(p_item_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 'item ' || split_part(p_item_key, '-', 3) || ' da Ata ' || split_part(p_item_key, '-', 1);
$function$;

CREATE OR REPLACE FUNCTION public.fisc_itens_da_ata_do_contrato(p_contract_key text)
 RETURNS TABLE(item_key text, nome_curto text, descricao_item text, contratado numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT k.item_key::TEXT, i.nome_curto, i.descricao_item, COALESCE(k.quantidade_ajustada, k.quantidade_contratada_api)
    FROM public.arp_item_contract_links k
    LEFT JOIN LATERAL public.fisc_item_da_ata(k.item_key) i ON TRUE
   WHERE k.contract_key = p_contract_key
   ORDER BY split_part(k.item_key, '-', 1), split_part(k.item_key, '-', 3);
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_itens_da_ata_do_contrato(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_itens_da_ata_do_contrato(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ligar_entregas_ao_item_da_ata(p_ids uuid[], p_item_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contratos TEXT[];
  v_n         INTEGER;
  v_nome      TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR NULLIF(btrim(COALESCE(p_item_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha os itens e o item da ata.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) FOR UPDATE;
  SELECT count(*), array_agg(DISTINCT contract_key::TEXT) INTO v_n, v_contratos FROM public.fisc_entregas WHERE id = ANY (p_ids);
  IF v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_ids))) THEN
    RAISE EXCEPTION 'NOT_FOUND: Item não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF cardinality(v_contratos) <> 1 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Ligue os itens de um contrato por vez.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_role('admin') AND EXISTS (
    SELECT 1 FROM public.fisc_contratos f WHERE f.contract_key = v_contratos[1] AND auth.uid() IS DISTINCT FROM f.fiscal_user_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal ou o coordenador ligam os itens deste contrato.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND item_key IS NOT NULL) THEN
    RAISE EXCEPTION 'JA_LIGADO: Algum dos itens já está ligado a um item da ata. Atualize a tela.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links k WHERE k.contract_key = v_contratos[1] AND k.item_key = p_item_key) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este item da ata não está ligado ao contrato.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fisc_entregas SET item_key = p_item_key, atualizado_por_nome = v_nome, atualizado_em = NOW() WHERE id = ANY (p_ids);
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome)
  SELECT id, 'ITEM', 'Ligado ao ' || public.fisc_rotulo_do_item(p_item_key) || ' (conferido)', auth.uid(), v_nome
    FROM public.fisc_entregas WHERE id = ANY (p_ids);
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.ligar_entregas_ao_item_da_ata(uuid[], text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ligar_entregas_ao_item_da_ata(uuid[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fisc_ligar_itens_automaticos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_unico INTEGER := 0;
  v_nome  INTEGER := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS fisc_ligacao_auto (id uuid, item_key text, regra text) ON COMMIT DROP;
  TRUNCATE fisc_ligacao_auto;

  WITH contratos AS (
    -- Ligação do contrato à ata parada há 24 horas.
    SELECT k.contract_key, count(*) AS n
      FROM public.arp_item_contract_links k
     GROUP BY k.contract_key
    HAVING max(GREATEST(k.created_at, k.updated_at)) < NOW() - INTERVAL '24 hours'
  ),
  candidatos AS (
    SELECT e.id, e.contract_key, k.item_key::TEXT AS item_key, c.n,
           public.fisc_normalizar(e.item_texto) AS texto,
           public.fisc_normalizar(i.nome_curto) AS nome
      FROM public.fisc_entregas e
      JOIN contratos c ON c.contract_key = e.contract_key
      JOIN public.arp_item_contract_links k ON k.contract_key = e.contract_key
      LEFT JOIN LATERAL public.fisc_item_da_ata(k.item_key) i ON TRUE
     WHERE e.item_key IS NULL
  ),
  escolha AS (
    SELECT id,
           CASE WHEN max(n) = 1 THEN min(item_key)
                WHEN count(*) FILTER (WHERE nome <> '' AND nome = texto) = 1 THEN min(item_key) FILTER (WHERE nome <> '' AND nome = texto)
           END AS item_key,
           CASE WHEN max(n) = 1 THEN 'UNICO' ELSE 'NOME' END AS regra
      FROM candidatos
     GROUP BY id
  )
  INSERT INTO fisc_ligacao_auto SELECT id, item_key, regra FROM escolha WHERE item_key IS NOT NULL;

  UPDATE public.fisc_entregas e
     SET item_key = a.item_key, atualizado_por_nome = 'Ligação automática', atualizado_em = NOW()
    FROM fisc_ligacao_auto a
   WHERE e.id = a.id AND e.item_key IS NULL;

  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por_nome)
  SELECT a.id, 'ITEM',
         'Ligado sozinho ao ' || public.fisc_rotulo_do_item(a.item_key) ||
         CASE a.regra WHEN 'UNICO' THEN ': único item da ata do contrato' ELSE ': nome igual ao do item' END,
         'Ligação automática'
    FROM fisc_ligacao_auto a;

  SELECT count(*) FILTER (WHERE regra = 'UNICO'), count(*) FILTER (WHERE regra = 'NOME') INTO v_unico, v_nome FROM fisc_ligacao_auto;
  RETURN jsonb_build_object('unico', v_unico, 'nome', v_nome);
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_ligar_itens_automaticos() FROM PUBLIC, anon, authenticated, service_role;

-- Lista dos itens: nome e descrição de qualquer item da ata (antes, só dos itens das emendas).
CREATE OR REPLACE FUNCTION public.fisc_entregas_lista(p_contrato text DEFAULT NULL::text)
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
    LEFT JOIN LATERAL public.fisc_item_da_ata(e.item_key) i ON TRUE
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


SELECT public.fisc_ligar_itens_automaticos();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiscalizacao-ligar-itens-da-ata') THEN
      PERFORM cron.unschedule('fiscalizacao-ligar-itens-da-ata');
    END IF;
    PERFORM cron.schedule('fiscalizacao-ligar-itens-da-ata', '9 * * * *', 'SELECT public.fisc_ligar_itens_automaticos()');
  END IF;
END $$;
