-- ==============================================================================
-- MIGRATION 193: ENVIO À CGOFI POR RODADA (M6 da revisão de 25/10/2026, protótipo aprovado)
-- Versão: 20261025000193_emendas_envio_cgofi_por_rodada.sql
--
-- O pedido guardava um envio à CGOFI só (cgofi_documento_sei, cgofi_em) e a etapa só saía de "Autorizado". No SEI, a
-- emenda anda em rodadas: cada despacho à CGOFI cita as autorizações (solicitações assinadas) que leva, e uma nova
-- rodada pode chegar com o pedido já na CCGA. Medição de 25/10/2026: 29 de 46 pedidos com envio tiveram 2 ou mais;
-- o pedido 418 teve 3 rodadas (17/04, 31/07, 23/09).
--
-- 1) emenda_cgofi_solicitacoes: cada envio à CGOFI (documento da etapa CGOFI) e as solicitações (etapa AUTORIZACAO) que
--    ele leva, do mesmo pedido. Uma solicitação pode ter sido enviada mais de uma vez (3 reenvios no SEI).
-- 2) registrar_envio_cgofi(pedido, documento SEI, data, solicitações): grava o envio e as solicitações que ele leva.
--    Com o pedido em "Autorizado", é o primeiro envio e o pedido vai para "Processo enviado à CGOFI" (como o
--    avancar_pedido_emenda fazia). Depois disso, a etapa não muda: o envio entra como mais um documento.
-- A carga dos envios já gravados (o que cada despacho cita, lido no SEI) é feita à parte, com autorização: os números
-- SEI não ficam no repositório.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Tabela
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_cgofi_solicitacoes (
  cgofi_id        UUID        NOT NULL REFERENCES public.emenda_pedido_documentos_sei(id) ON DELETE CASCADE,
  solicitacao_id  UUID        NOT NULL REFERENCES public.emenda_pedido_documentos_sei(id) ON DELETE CASCADE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por      UUID,
  PRIMARY KEY (cgofi_id, solicitacao_id)
);
COMMENT ON TABLE public.emenda_cgofi_solicitacoes IS
  'Envio à CGOFI (documento SEI da etapa CGOFI) e as solicitações de autorização de empenho (etapa AUTORIZACAO) que ele leva, do mesmo pedido (migration 193). Grava só o servidor (registrar_envio_cgofi e cargas).';
CREATE INDEX IF NOT EXISTS ix_emenda_cgofi_solicitacoes_solicitacao ON public.emenda_cgofi_solicitacoes (solicitacao_id);

ALTER TABLE public.emenda_cgofi_solicitacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_cgofi_solicitacoes" ON public.emenda_cgofi_solicitacoes;
CREATE POLICY "Leitura das emendas: emenda_cgofi_solicitacoes" ON public.emenda_cgofi_solicitacoes FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_cgofi_solicitacoes;
CREATE POLICY "Somente usuario ativo" ON public.emenda_cgofi_solicitacoes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_cgofi_solicitacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_cgofi_solicitacoes TO authenticated;
GRANT ALL ON public.emenda_cgofi_solicitacoes TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_cgofi_solicitacoes ON public.emenda_cgofi_solicitacoes;
    CREATE TRIGGER trg_audit_emenda_cgofi_solicitacoes AFTER INSERT OR UPDATE OR DELETE ON public.emenda_cgofi_solicitacoes
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Registrar um envio à CGOFI
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_envio_cgofi(p_id UUID, p_documento_sei TEXT, p_enviado_em DATE, p_solicitacoes UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p        RECORD;
  v_sei      TEXT := regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g');
  v_hoje     DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_sol      RECORD;
  v_doc      UUID;
  v_ultima   DATE;
  v_nome     TEXT;
  v_versao   INTEGER;
  v_primeiro BOOLEAN;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram as etapas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.etapa NOT IN ('AUTORIZADO', 'CGOFI', 'EMPENHADO', 'CONTRATACAO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: O envio à CGOFI vem depois da autorização de empenho.' USING ERRCODE = '22023';
  END IF;
  IF v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Documento SEI do despacho: só números, 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF p_enviado_em IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data do envio.' USING ERRCODE = '22023';
  END IF;
  IF p_enviado_em > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data do envio não pode ser depois de hoje.' USING ERRCODE = '22023';
  END IF;
  IF p_solicitacoes IS NULL OR cardinality(p_solicitacoes) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Marque pelo menos uma solicitação que o despacho leva.' USING ERRCODE = '22023';
  END IF;

  FOR v_sol IN
    SELECT s.id, d.id AS doc_id, d.documento_sei, d.pedido_id, d.etapa, d.assinado_em,
           (SELECT c.documento_sei FROM public.emenda_cgofi_solicitacoes x JOIN public.emenda_pedido_documentos_sei c ON c.id = x.cgofi_id
             WHERE x.solicitacao_id = d.id ORDER BY c.data_documento NULLS LAST LIMIT 1) AS ja_enviada
      FROM unnest(p_solicitacoes) s(id)
      LEFT JOIN public.emenda_pedido_documentos_sei d ON d.id = s.id
  LOOP
    IF v_sol.doc_id IS NULL OR v_sol.pedido_id <> p_id OR v_sol.etapa <> 'AUTORIZACAO' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Solicitação não encontrada neste pedido.' USING ERRCODE = '22023';
    END IF;
    IF v_sol.assinado_em IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A solicitação % ainda não foi assinada: informe a assinatura antes do envio.', v_sol.documento_sei USING ERRCODE = '22023';
    END IF;
    IF v_sol.ja_enviada IS NOT NULL AND v_sol.ja_enviada <> v_sei THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A solicitação % já foi enviada à CGOFI no documento %.', v_sol.documento_sei, v_sol.ja_enviada USING ERRCODE = '22023';
    END IF;
    v_ultima := GREATEST(v_ultima, (v_sol.assinado_em AT TIME ZONE 'America/Sao_Paulo')::DATE);
  END LOOP;
  IF p_enviado_em < v_ultima THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O envio não pode ser antes da assinatura da solicitação (%).', to_char(v_ultima, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_primeiro := v_p.etapa = 'AUTORIZADO';
  IF v_primeiro THEN
    -- Primeiro envio: o pedido vai para "Processo enviado à CGOFI"; o gatilho da migration 177 copia o documento.
    UPDATE public.emenda_pedidos SET etapa = 'CGOFI', cgofi_em = p_enviado_em, cgofi_documento_sei = v_sei WHERE id = p_id;
  ELSE
    INSERT INTO public.emenda_pedido_documentos_sei (pedido_id, etapa, documento_sei, data_documento, origem)
    VALUES (p_id, 'CGOFI', v_sei, p_enviado_em, 'SISTEMA')
    ON CONFLICT (pedido_id, etapa, documento_sei) DO NOTHING;
  END IF;
  SELECT id INTO v_doc FROM public.emenda_pedido_documentos_sei WHERE pedido_id = p_id AND etapa = 'CGOFI' AND documento_sei = v_sei;
  UPDATE public.emenda_pedido_documentos_sei SET data_documento = COALESCE(data_documento, p_enviado_em) WHERE id = v_doc;

  INSERT INTO public.emenda_cgofi_solicitacoes (cgofi_id, solicitacao_id, criado_por)
  SELECT v_doc, s, auth.uid() FROM unnest(p_solicitacoes) s
  ON CONFLICT (cgofi_id, solicitacao_id) DO NOTHING;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao, 'documento_sei', v_sei, 'primeiro_envio', v_primeiro,
                            'solicitacoes', (SELECT count(*) FROM public.emenda_cgofi_solicitacoes WHERE cgofi_id = v_doc));
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_envio_cgofi(UUID, TEXT, DATE, UUID[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_envio_cgofi(UUID, TEXT, DATE, UUID[]) TO authenticated;
