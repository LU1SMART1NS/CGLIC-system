-- ==============================================================================
-- MIGRATION 204: SOBRA DAS EMENDAS (protótipo aprovado em 26/10/2026)
--
-- A emenda passa a ser a unidade da conta da sobra: valor no SIOP (informado na conferência), empenhado pelo Portal
-- da Transparência (todas as notas da emenda, de qualquer UG), em andamento (pedidos antes do empenho, pelo preço
-- previsto, calculado na tela) e a sobra. Regras aprovadas: só emendas do ano corrente; uma emenda por pedido; aviso
-- quando a sobra compra o item mais barato da CAEP.
--   1) emenda_execucao_portal: o que o Portal diz de cada emenda dos pedidos (empenhado, liquidado, pago), gravado
--      só pelo servidor (recurso 'execucao_emendas' da Edge Function sincronizar-fontes, uma vez por dia).
--   2) emendas_a_ler_no_portal / gravar_execucao_emendas_portal: a fila e a gravação do servidor.
--   3) salvar_pedido_emenda: o pedido novo com a sobra já nasce com o número e o ano da emenda (igual à da migration
--      157 e seguintes, mais o campo emenda_da_sobra).
--   4) Agendamento diário às 10h50 de Brasília, depois das notas das emendas (10h35).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.emenda_execucao_portal (
  codigo          VARCHAR(12)  PRIMARY KEY CHECK (codigo ~ '^20[0-9]{10}$'),
  ano             SMALLINT     NOT NULL,
  emenda          VARCHAR(8)   NOT NULL,
  -- O Portal só lista a emenda depois que ela tem execução: sem ela, encontrada = FALSE e os valores ficam vazios.
  encontrada      BOOLEAN      NOT NULL,
  valor_empenhado NUMERIC(18,2),
  valor_liquidado NUMERIC(18,2),
  valor_pago      NUMERIC(18,2),
  autor           VARCHAR(200),
  lido_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.emenda_execucao_portal IS
  'Execução de cada emenda dos pedidos pelo Portal da Transparência (/emendas?codigoEmenda). Grava só o servidor (migration 204).';

DO $$
DECLARE v_t TEXT := 'emenda_execucao_portal';
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
END $$;

-- Emendas com número e ano nos pedidos não cancelados, do ano corrente e do anterior (o anterior fecha a conta do ano).
CREATE OR REPLACE FUNCTION public.emendas_a_ler_no_portal()
RETURNS TABLE (codigo TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT p.siop_emenda_ano::TEXT || p.siop_emenda
    FROM public.emenda_pedidos p
   WHERE p.siop_emenda ~ '^[0-9]{8}$' AND p.siop_emenda_ano IS NOT NULL AND p.etapa <> 'CANCELADO'
     AND p.siop_emenda_ano >= EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER - 1
   ORDER BY 1;
$$;
REVOKE ALL ON FUNCTION public.emendas_a_ler_no_portal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_a_ler_no_portal() TO service_role;

-- p_emendas: [{codigo, encontrada, valor_empenhado, valor_liquidado, valor_pago, autor}]. Devolve quantas gravou.
CREATE OR REPLACE FUNCTION public.gravar_execucao_emendas_portal(p_emendas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n INTEGER;
BEGIN
  IF jsonb_typeof(p_emendas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a lista de emendas deve ser um array.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.emenda_execucao_portal AS d (codigo, ano, emenda, encontrada, valor_empenhado, valor_liquidado, valor_pago, autor, lido_em)
  SELECT x->>'codigo', left(x->>'codigo', 4)::SMALLINT, right(x->>'codigo', 8), COALESCE((x->>'encontrada')::BOOLEAN, FALSE),
         NULLIF(x->>'valor_empenhado', '')::NUMERIC, NULLIF(x->>'valor_liquidado', '')::NUMERIC, NULLIF(x->>'valor_pago', '')::NUMERIC,
         left(NULLIF(btrim(x->>'autor'), ''), 200), NOW()
    FROM jsonb_array_elements(p_emendas) x
   WHERE x->>'codigo' ~ '^20[0-9]{10}$'
  ON CONFLICT (codigo) DO UPDATE SET
    encontrada = EXCLUDED.encontrada, valor_empenhado = EXCLUDED.valor_empenhado, valor_liquidado = EXCLUDED.valor_liquidado,
    valor_pago = EXCLUDED.valor_pago, autor = EXCLUDED.autor, lido_em = EXCLUDED.lido_em;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_execucao_emendas_portal(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_execucao_emendas_portal(JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.salvar_pedido_emenda(p_pedido JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id     UUID;
  v_autor  TEXT;
  v_orgao  BOOLEAN;
  v_nome   TEXT;
  v_atual  RECORD;
  v_mudou  BOOLEAN;
  v_versao INTEGER;
  v_numero INTEGER;
  v_sobra  JSONB := p_pedido->'emenda_da_sobra';
  v_emenda TEXT;
  v_ano    INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram pedidos.' USING ERRCODE = '42501';
  END IF;
  IF p_pedido IS NULL OR jsonb_typeof(p_pedido) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(p_pedido->>'id', '')::UUID;
  v_autor := NULLIF(btrim(COALESCE(p_pedido->>'autor_id', '')), '');
  v_orgao := COALESCE((p_pedido->>'para_orgao')::BOOLEAN, FALSE);
  IF v_autor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emenda_autores WHERE id = v_autor) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: autor não encontrado.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF v_autor IS NULL AND NOT v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar ou a bancada, ou marque a reserva para um órgão.' USING ERRCODE = '22023';
    END IF;
    IF v_autor IS NOT NULL AND v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: reserva para um órgão não tem parlamentar.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedidos (autor_id, observacao, contato_nome, contato_telefone, contato_email, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_autor, NULLIF(btrim(p_pedido->>'observacao'), ''), NULLIF(btrim(p_pedido->>'contato_nome'), ''),
            NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''), NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao, numero INTO v_id, v_versao, v_numero;
    -- Pedido com a sobra de uma emenda (migration 204): já nasce com o número dela, que precisa ser de outro pedido
    -- do mesmo parlamentar. A conferência no SIOP confirma o número depois, como em qualquer pedido.
    IF v_sobra IS NOT NULL AND jsonb_typeof(v_sobra) = 'object' THEN
      v_emenda := regexp_replace(COALESCE(v_sobra->>'numero', ''), '\D', '', 'g');
      v_ano := CASE WHEN COALESCE(v_sobra->>'ano', '') ~ '^[0-9]{4}$' THEN (v_sobra->>'ano')::INTEGER END;
      IF v_emenda !~ '^[0-9]{8}$' OR v_ano IS NULL OR v_autor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.emenda_pedidos o
         WHERE o.id <> v_id AND o.autor_id = v_autor AND o.etapa <> 'CANCELADO' AND o.siop_emenda = v_emenda AND o.siop_emenda_ano = v_ano
      ) THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda da sobra não está em outro pedido deste parlamentar.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.emenda_pedidos SET siop_emenda = v_emenda, siop_emenda_ano = v_ano WHERE id = v_id;
    END IF;
    PERFORM public.emendas_gravar_linhas(v_id, p_pedido->'linhas', NULL);
    IF v_autor IS NULL AND EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = v_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: na reserva para um órgão, todas as linhas precisam do beneficiário.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
  END IF;

  SELECT * INTO v_atual FROM public.emenda_pedidos WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (p_pedido->>'versao')::INTEGER IS DISTINCT FROM v_atual.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_atual.etapa IN ('EMPENHADO', 'CONTRATACAO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Pedido % não pode ser alterado.', CASE v_atual.etapa WHEN 'CANCELADO' THEN 'cancelado' ELSE 'empenhado' END USING ERRCODE = '22023';
  END IF;
  IF v_autor IS NOT NULL AND v_atual.autor_id IS NOT NULL AND v_autor <> v_atual.autor_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o autor do pedido não muda. Cancele e faça uma nova reserva.' USING ERRCODE = '22023';
  END IF;

  v_mudou := public.emendas_gravar_linhas(v_id, p_pedido->'linhas', p_pedido->>'motivo');
  IF COALESCE(v_autor, v_atual.autor_id) IS NULL
     AND EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = v_id AND NOT cancelada AND beneficiario_id IS NULL AND beneficiario_nome IS NULL) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: na reserva para um órgão, todas as linhas precisam do beneficiário.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET
    autor_id = COALESCE(autor_id, v_autor),
    observacao = NULLIF(btrim(p_pedido->>'observacao'), ''),
    contato_nome = NULLIF(btrim(p_pedido->>'contato_nome'), ''),
    contato_telefone = NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''),
    contato_email = NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
    etapa = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN 'OFICIO' ELSE etapa END,
    siop_conferencia = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE siop_conferencia END,
    conferido_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE conferido_em END,
    solicitado_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE solicitado_em END,
    solicitado_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE solicitado_documento_sei END,
    autorizado_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE autorizado_em END,
    autorizado_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE autorizado_documento_sei END,
    cgofi_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE cgofi_em END,
    cgofi_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE cgofi_documento_sei END,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao, numero INTO v_versao, v_numero;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
END;
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-execucao-emendas';
    PERFORM cron.schedule('sincronizar-execucao-emendas', '50 13 * * *', $c$SELECT public.disparar_sincronizacao('execucao_emendas')$c$);
  END IF;
END;
$$;
