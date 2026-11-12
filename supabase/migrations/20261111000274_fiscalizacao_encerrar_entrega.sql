-- ==============================================================================
-- Versão: 20261111000274_fiscalizacao_encerrar_entrega.sql
-- Entrega da Fiscalização × linha do pedido de emenda (achado 1.4 da auditoria de informação duplicada).
--
-- Depois do envio à CCGA o pedido não muda (salvar_pedido_emenda recusa EMPENHADO/CONTRATACAO; a CCGA só devolve
-- itens sem contrato). A linha de uma entrega ainda pode mudar por dois caminhos:
--   - anulação do empenho (registrar_anulacao_empenho): o item, ou o pedido inteiro, é cancelado;
--   - a nota da linha passa a outro contrato (emendas_ligar_notas, de hora em hora, depois de corrigido o vínculo).
-- Decisão do usuário (12/11/2026): a entrega mostra o aviso e o Gestor de Fiscalização do contrato (ou o
-- coordenador) encerra a entrega. Nada muda sozinho.
--
-- 1) fisc_entregas: encerrada_em, motivo, SEI, observação e quem; movimento ENCERRADA (e REABERTA).
-- 2) fisc_aviso_da_entrega(linha, contrato): ITEM_CANCELADO (com a data e o SEI da anulação, se houver) ou
--    OUTRO_CONTRATO (com o número do contrato novo).
-- 3) fisc_entregas_lista: devolve o aviso e, por padrão, só as entregas não encerradas (p_encerradas = true traz todas).
--    Régua do Pedido 360, contagem dos programas e avanço automático ignoram as encerradas.
-- 4) fisc_conferir_entregas recusa entrega encerrada (nenhuma ação nela); encerrar_entregas e reabrir_entrega.
-- Base: as definições em produção depois da migration 273.
-- ==============================================================================

-- 1) Colunas e movimento ---------------------------------------------------------------------------------------
ALTER TABLE public.fisc_entregas ADD COLUMN IF NOT EXISTS encerrada_em DATE;
ALTER TABLE public.fisc_entregas ADD COLUMN IF NOT EXISTS encerrada_motivo VARCHAR(20);
ALTER TABLE public.fisc_entregas ADD COLUMN IF NOT EXISTS encerrada_documento_sei VARCHAR(10);
ALTER TABLE public.fisc_entregas ADD COLUMN IF NOT EXISTS encerrada_observacao TEXT;
ALTER TABLE public.fisc_entregas ADD COLUMN IF NOT EXISTS encerrada_por UUID;
ALTER TABLE public.fisc_entregas ADD COLUMN IF NOT EXISTS encerrada_por_nome VARCHAR(200);
ALTER TABLE public.fisc_entregas DROP CONSTRAINT IF EXISTS fisc_entregas_encerrada;
ALTER TABLE public.fisc_entregas ADD CONSTRAINT fisc_entregas_encerrada CHECK (
  (encerrada_em IS NULL AND encerrada_motivo IS NULL AND encerrada_documento_sei IS NULL)
  OR (encerrada_em IS NOT NULL AND encerrada_motivo IN ('ITEM_CANCELADO', 'OUTRO_CONTRATO', 'OUTRO')
      AND (encerrada_documento_sei IS NULL OR encerrada_documento_sei ~ '^[0-9]{7,10}$'))
);
COMMENT ON COLUMN public.fisc_entregas.encerrada_em IS
  'Entrega encerrada pelo Gestor de Fiscalização ou pelo coordenador (item cancelado no pedido, nota em outro contrato): sai das listas de trabalho (migration 274).';

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.fisc_entrega_movimentos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo CHECK (tipo IN (
  'CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA', 'PROGRAMA', 'ITEM',
  'BENEFICIARIO', 'VOLTA', 'DESFEITO', 'CORRECAO', 'ENCERRADA', 'REABERTA'));

-- 2) Aviso da entrega -------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_aviso_da_entrega(p_linha UUID, p_contrato TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN l.cancelada OR p.etapa = 'CANCELADO' THEN
      jsonb_build_object('tipo', 'ITEM_CANCELADO', 'data', an.anulado_em, 'sei', an.documento_sei)
    WHEN NOT EXISTS (SELECT 1 FROM public.emenda_linha_notas n WHERE n.linha_id = l.id AND n.contract_key = p_contrato)
     AND novo.contract_key IS NOT NULL THEN
      jsonb_build_object('tipo', 'OUTRO_CONTRATO', 'contrato', novo.numero)
    END
    FROM public.emenda_pedido_linhas l
    JOIN public.emenda_pedidos p ON p.id = l.pedido_id
    LEFT JOIN LATERAL (
      SELECT a.anulado_em, a.documento_sei FROM public.emenda_pedido_anulacoes a
       WHERE a.pedido_id = l.pedido_id
         AND (a.total OR EXISTS (SELECT 1 FROM jsonb_array_elements(a.linhas) x WHERE x->>'linha_id' = l.id::TEXT))
       ORDER BY a.anulado_em DESC, a.criado_em DESC LIMIT 1
    ) an ON TRUE
    LEFT JOIN LATERAL (
      SELECT n.contract_key, COALESCE(NULLIF(co.registro->>'numero', ''), co.numero, n.contract_key)::TEXT AS numero
        FROM public.emenda_linha_notas n
        LEFT JOIN public.contratos_oficiais co ON co.contract_key = n.contract_key
       WHERE n.linha_id = l.id AND n.contract_key IS NOT NULL AND n.contract_key <> p_contrato
       LIMIT 1
    ) novo ON TRUE
   WHERE l.id = p_linha;
$$;
REVOKE ALL ON FUNCTION public.fisc_aviso_da_entrega(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_aviso_da_entrega(UUID, TEXT) TO service_role;

-- 3) Leituras ---------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fisc_entregas_lista(TEXT);
CREATE OR REPLACE FUNCTION public.fisc_entregas_lista(p_contrato text DEFAULT NULL::text, p_encerradas boolean DEFAULT false)
 RETURNS TABLE(id uuid, contract_key text, contrato_numero text, fornecedor text, fiscal_user_id uuid, fiscal_nome text, fiscalizacao text, item_key text, item_nome text, item_descricao text, item_texto text, beneficiario_id uuid, beneficiario_nome text, beneficiario_sigla text, beneficiario_razao text, beneficiario_texto text, municipio text, uf text, quantidade integer, origem text, emenda text, pedido_id uuid, responsavel text, etapa text, etapa_em date, prevista date, entregue_em date, dividida_de uuid, programa_texto text, carga_linha integer, faturado_em date, pago_em date, atualizado_por_nome text, atualizado_em timestamp with time zone, programa_id uuid, programa_ativo boolean, parlamentar_nome text, entrega_logradouro text, entrega_numero text, entrega_complemento text, entrega_bairro text, entrega_cep text, aviso jsonb, encerrada_em date, encerrada_motivo text)
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
         b.entrega_logradouro::TEXT, b.entrega_numero::TEXT, b.entrega_complemento::TEXT, b.entrega_bairro::TEXT, b.entrega_cep::TEXT,
         CASE WHEN e.encerrada_em IS NULL AND e.emenda_linha_id IS NOT NULL THEN public.fisc_aviso_da_entrega(e.emenda_linha_id, e.contract_key::TEXT) END,
         e.encerrada_em, e.encerrada_motivo::TEXT
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
   WHERE (p_contrato IS NULL OR e.contract_key = p_contrato)
     AND (p_encerradas OR e.encerrada_em IS NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_entregas_lista(TEXT, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_lista(TEXT, BOOLEAN) TO authenticated;

-- Régua do Pedido 360, programas e avanço automático: sem as encerradas.
CREATE OR REPLACE FUNCTION public.fisc_entregas_do_pedido(p_pedido uuid)
 RETURNS TABLE(id uuid, linha_id uuid, contract_key text, quantidade integer, responsavel text, etapa text, etapa_em date, prevista date, entregue_em date, dividida_de uuid, fiscal_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT e.id, e.emenda_linha_id, e.contract_key::TEXT, e.quantidade, e.responsavel::TEXT, e.etapa::TEXT, e.etapa_em, e.prevista,
         e.entregue_em, e.dividida_de, f.fiscal_nome::TEXT
    FROM public.fisc_entregas e
    JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
    JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
   WHERE l.pedido_id = p_pedido
     AND e.encerrada_em IS NULL
     AND public.has_permission('fiscalizacao.view') IS TRUE;
$function$;

CREATE OR REPLACE FUNCTION public.fisc_programas_lista()
 RETURNS TABLE(id uuid, nome text, unidade_id text, unidade_sigla text, origem_recurso text, ativo boolean, itens integer, atualizado_por_nome text, atualizado_em timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.nome::TEXT, p.unidade_id::TEXT, d.sigla::TEXT, p.origem_recurso::TEXT, p.ativo,
         (SELECT count(*)::INTEGER FROM public.fisc_entregas e WHERE e.programa_id = p.id AND e.encerrada_em IS NULL),
         p.atualizado_por_nome, p.atualizado_em
    FROM public.fisc_programas p
    LEFT JOIN public.internal_departments d ON d.id = p.unidade_id
   ORDER BY p.ativo DESC, p.nome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fisc_criar_entregas_do_contrato(p_contrato text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_f        public.fisc_contratos%ROWTYPE;
  v_criadas  INTEGER := 0;
  v_avancou  INTEGER := 0;
  r          RECORD;
  v_id       UUID;
BEGIN
  SELECT * INTO v_f FROM public.fisc_contratos WHERE contract_key = p_contrato;
  IF NOT FOUND OR v_f.fiscalizacao = 'AREA' THEN
    RETURN jsonb_build_object('criadas', 0, 'avancadas', 0);
  END IF;

  FOR r IN
    SELECT l.id AS linha_id, l.item_key, l.beneficiario_id, l.quantidade, n.entrega_prevista,
           o.informacao_em, o.informacao_documento_sei, o.ordem_em, o.ordem_documento_sei
      FROM public.emenda_linha_notas n
      JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id AND NOT l.cancelada
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
      LEFT JOIN public.emenda_pedido_ordens o ON o.pedido_id = p.id AND o.contract_key = n.contract_key
     WHERE n.contract_key = p_contrato
       AND NOT EXISTS (SELECT 1 FROM public.fisc_entregas e WHERE e.emenda_linha_id = l.id)
  LOOP
    INSERT INTO public.fisc_entregas (contract_key, emenda_linha_id, item_key, beneficiario_id, quantidade, origem, responsavel, etapa, etapa_em, prevista, atualizado_por_nome)
    VALUES (p_contrato, r.linha_id, r.item_key, r.beneficiario_id, r.quantidade, 'EMENDA',
            'SFC',
            CASE WHEN r.ordem_em IS NOT NULL THEN 'ORDEM' WHEN r.informacao_em IS NOT NULL THEN 'INFO_ENVIADA' ELSE 'INFO_PEDIDA' END,
            COALESCE(r.ordem_em, r.informacao_em), r.entrega_prevista, 'Sistema')
    RETURNING id INTO v_id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, etapa, data, documento_sei, observacao, criado_por_nome)
    VALUES (v_id, 'CRIADA',
            CASE WHEN r.ordem_em IS NOT NULL THEN 'ORDEM' WHEN r.informacao_em IS NOT NULL THEN 'INFO_ENVIADA' ELSE 'INFO_PEDIDA' END,
            COALESCE(r.ordem_em, r.informacao_em), COALESCE(r.ordem_documento_sei, r.informacao_documento_sei),
            'Entrega criada pela linha do pedido de emenda', 'Sistema');
    v_criadas := v_criadas + 1;
  END LOOP;

  -- Informação ou Ordem registrada depois (no módulo de Emendas): a entrega que ainda está antes dela avança.
  FOR r IN
    SELECT e.id, CASE WHEN o.ordem_em IS NOT NULL THEN 'ORDEM' ELSE 'INFO_ENVIADA' END AS etapa,
           COALESCE(o.ordem_em, o.informacao_em) AS data, COALESCE(o.ordem_documento_sei, o.informacao_documento_sei) AS sei
      FROM public.fisc_entregas e
      JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
      JOIN public.emenda_pedido_ordens o ON o.pedido_id = l.pedido_id AND o.contract_key = e.contract_key
     WHERE e.contract_key = p_contrato
       AND e.responsavel = 'SFC'
       AND e.encerrada_em IS NULL
       AND public.fisc_ordem_da_etapa(e.etapa) < public.fisc_ordem_da_etapa(CASE WHEN o.ordem_em IS NOT NULL THEN 'ORDEM' ELSE 'INFO_ENVIADA' END)
  LOOP
    UPDATE public.fisc_entregas SET etapa = r.etapa, etapa_em = r.data, atualizado_por_nome = 'Sistema', atualizado_em = NOW() WHERE id = r.id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, etapa, data, documento_sei, observacao, criado_por_nome)
    VALUES (r.id, 'AUTOMATICA', r.etapa, r.data, r.sei, 'Registrado no pedido de emenda', 'Sistema');
    v_avancou := v_avancou + 1;
  END LOOP;

  RETURN jsonb_build_object('criadas', v_criadas, 'avancadas', v_avancou);
END;
$function$;

-- Nenhuma ação em entrega encerrada.
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
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND encerrada_em IS NOT NULL) THEN
    RAISE EXCEPTION 'ENCERRADA: Há entrega encerrada na escolha. Recarregue a tela.' USING ERRCODE = '22023';
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

-- 4) Encerrar e reabrir --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encerrar_entregas(p_ids UUID[], p_motivo TEXT, p_documento_sei TEXT, p_observacao TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_sei  TEXT := NULLIF(regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g'), '');
  v_obs  TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_n    INTEGER;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF p_motivo IS NULL OR p_motivo NOT IN ('ITEM_CANCELADO', 'OUTRO_CONTRATO', 'OUTRO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha o motivo do encerramento.' USING ERRCODE = '22023';
  END IF;
  IF p_motivo = 'OUTRO' AND v_obs IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Explique por que a entrega foi encerrada.' USING ERRCODE = '22023';
  END IF;
  IF v_sei IS NOT NULL AND v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número SEI tem de 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fisc_entregas
     SET encerrada_em = (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, encerrada_motivo = p_motivo,
         encerrada_documento_sei = v_sei, encerrada_observacao = v_obs, encerrada_por = auth.uid(), encerrada_por_nome = v_nome,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, documento_sei, observacao, criado_por, criado_por_nome)
  SELECT x, 'ENCERRADA', (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, v_sei,
         concat_ws(': ', CASE p_motivo WHEN 'ITEM_CANCELADO' THEN 'Item cancelado no pedido (empenho anulado)'
                                            WHEN 'OUTRO_CONTRATO' THEN 'A nota do item passou a outro contrato' ELSE 'Encerrada' END, v_obs),
         auth.uid(), v_nome
    FROM unnest(ARRAY(SELECT DISTINCT unnest(p_ids))) x;
  RETURN jsonb_build_object('encerradas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.encerrar_entregas(UUID[], TEXT, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.encerrar_entregas(UUID[], TEXT, TEXT, TEXT) TO authenticated;

-- Reabrir (engano no encerramento): as mesmas pessoas, com o motivo no histórico.
CREATE OR REPLACE FUNCTION public.reabrir_entrega(p_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_obs  TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  IF v_obs IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que a entrega volta.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.fisc_entregas WHERE id = p_id AND encerrada_em IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Entrega encerrada não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND EXISTS (
    SELECT 1 FROM public.fisc_entregas e JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
     WHERE e.id = p_id AND auth.uid() IS DISTINCT FROM f.fiscal_user_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal ou o coordenador registram as entregas deste contrato.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.fisc_entregas
     SET encerrada_em = NULL, encerrada_motivo = NULL, encerrada_documento_sei = NULL, encerrada_observacao = NULL,
         encerrada_por = NULL, encerrada_por_nome = NULL, atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome)
  VALUES (p_id, 'REABERTA', v_obs, auth.uid(), v_nome);
END;
$$;
REVOKE ALL ON FUNCTION public.reabrir_entrega(UUID, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reabrir_entrega(UUID, TEXT) TO authenticated;
