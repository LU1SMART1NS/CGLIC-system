-- ==============================================================================
-- MIGRATION 261: TRANSFERIR OS CONTRATOS DE UM FISCAL (definitiva e temporária)
-- Versão: 20261111000261_fiscalizacao_transferir_fiscal.sql
--
-- Pedido de 11/11/2026: na Distribuição da Fiscalização, a Equipe tem os botões
-- Transferir e Temporariamente, como a Equipe de Atas e Contratos (migration 254).
--
-- - Transferir (definitiva): os contratos em que o servidor é fiscal passam ao
--   destino; se o destino era o substituto do contrato, o contrato fica sem
--   substituto. Onde o servidor é substituto, o destino passa a ser o substituto
--   (se o destino já for o fiscal do contrato, fica sem substituto). Portaria e
--   processo ficam como estão: nova portaria é registrada no contrato.
-- - Temporariamente (férias, licença…): só os contratos em que o servidor é o
--   fiscal vão para quem assume, até o retorno; o substituto do contrato fica
--   (se quem assume era o substituto, quem sai vira o substituto no período).
--   O que havia antes fica guardado para o Desfazer.
-- - Desfazer: devolve só os contratos que ainda estão com quem assumiu; o que o
--   coordenador mudou no período fica onde está (devolvido = false).
-- - Uma ausência em curso por fiscal; quem está ausente não recebe contratos.
-- - Escrita só pelas RPCs, só o coordenador (admin). Leitura de quem lê a
--   fiscalização (fiscalizacao.view).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.fisc_transferencias_temporarias (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ausente_user_id       UUID NOT NULL REFERENCES auth.users(id),
  ausente_nome          VARCHAR(150) NOT NULL,
  destino_user_id       UUID NOT NULL REFERENCES auth.users(id),
  destino_nome          VARCHAR(150) NOT NULL,
  motivo                VARCHAR(15) NOT NULL CHECK (motivo IN ('FERIAS', 'LICENCA', 'AFASTAMENTO', 'OUTRO')),
  inicio                DATE NOT NULL,
  retorno_previsto      DATE NOT NULL,
  sei_numero            VARCHAR(40),
  criado_por_user_id    UUID REFERENCES auth.users(id),
  criado_por_nome       VARCHAR(200),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  desfeita_em           TIMESTAMPTZ,
  desfeita_por_user_id  UUID REFERENCES auth.users(id),
  desfeita_por_nome     VARCHAR(200),
  CHECK (retorno_previsto >= inicio),
  CHECK (destino_user_id <> ausente_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fisc_transferencia_em_curso
  ON public.fisc_transferencias_temporarias (ausente_user_id) WHERE desfeita_em IS NULL;
CREATE INDEX IF NOT EXISTS ix_fisc_transferencias_destino ON public.fisc_transferencias_temporarias (destino_user_id);
CREATE INDEX IF NOT EXISTS ix_fisc_transferencias_criado_por ON public.fisc_transferencias_temporarias (criado_por_user_id);
CREATE INDEX IF NOT EXISTS ix_fisc_transferencias_desfeita_por ON public.fisc_transferencias_temporarias (desfeita_por_user_id);

CREATE TABLE IF NOT EXISTS public.fisc_transferencias_temporarias_itens (
  id                    BIGSERIAL PRIMARY KEY,
  transferencia_id      UUID NOT NULL REFERENCES public.fisc_transferencias_temporarias(id) ON DELETE CASCADE,
  contract_key          VARCHAR(100) NOT NULL,
  substituto_antes_id   UUID REFERENCES auth.users(id),
  substituto_antes_nome VARCHAR(150),
  -- NULL até o Desfazer; true = voltou; false = mudou de mãos no período e ficou.
  devolvido             BOOLEAN,
  UNIQUE (transferencia_id, contract_key)
);
CREATE INDEX IF NOT EXISTS ix_fisc_transferencias_itens_subst ON public.fisc_transferencias_temporarias_itens (substituto_antes_id);

COMMENT ON TABLE public.fisc_transferencias_temporarias IS
  'Ausência de fiscal da SFC/CGLIC (férias, licença…): contratos passados a quem assume até o retorno (migration 261). Grava só pelas RPCs.';

ALTER TABLE public.fisc_transferencias_temporarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisc_transferencias_temporarias_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura da fiscalizacao: fisc_transferencias_temporarias" ON public.fisc_transferencias_temporarias;
CREATE POLICY "Leitura da fiscalizacao: fisc_transferencias_temporarias" ON public.fisc_transferencias_temporarias
  FOR SELECT TO authenticated USING ((SELECT public.has_permission('fiscalizacao.view')));
DROP POLICY IF EXISTS "Leitura da fiscalizacao: fisc_transferencias_temporarias_itens" ON public.fisc_transferencias_temporarias_itens;
CREATE POLICY "Leitura da fiscalizacao: fisc_transferencias_temporarias_itens" ON public.fisc_transferencias_temporarias_itens
  FOR SELECT TO authenticated USING ((SELECT public.has_permission('fiscalizacao.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.fisc_transferencias_temporarias;
CREATE POLICY "Somente usuario ativo" ON public.fisc_transferencias_temporarias AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.fisc_transferencias_temporarias_itens;
CREATE POLICY "Somente usuario ativo" ON public.fisc_transferencias_temporarias_itens AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));

REVOKE ALL ON public.fisc_transferencias_temporarias, public.fisc_transferencias_temporarias_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fisc_transferencias_temporarias, public.fisc_transferencias_temporarias_itens TO authenticated;
GRANT ALL ON public.fisc_transferencias_temporarias, public.fisc_transferencias_temporarias_itens TO service_role;
REVOKE ALL ON SEQUENCE public.fisc_transferencias_temporarias_itens_id_seq FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_fisc_transferencias ON public.fisc_transferencias_temporarias;
    CREATE TRIGGER trg_audit_fisc_transferencias AFTER INSERT OR UPDATE OR DELETE ON public.fisc_transferencias_temporarias
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- Quem assume não pode estar ausente.
CREATE OR REPLACE FUNCTION public.fisc_destino_presente(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fisc_transferencias_temporarias WHERE ausente_user_id = p_user AND desfeita_em IS NULL) THEN
    RAISE EXCEPTION 'DESTINO_AUSENTE: Quem vai assumir também está ausente.' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_destino_presente(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_destino_presente(UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- transferir_contratos_fiscal: transferência definitiva de toda a carteira.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transferir_contratos_fiscal(p_origem_user_id UUID, p_destino_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_destino TEXT;
  v_nome    TEXT := left(public.nome_do_usuario_logado(), 200);
  v_titular INTEGER := 0;
  v_subst   INTEGER := 0;
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
  v_destino := public.fisc_nome_do_fiscal(p_destino_user_id);
  PERFORM public.fisc_destino_presente(p_destino_user_id);
  PERFORM pg_advisory_xact_lock(hashtext('fisc_transferencia:' || p_origem_user_id::text));
  IF EXISTS (SELECT 1 FROM public.fisc_transferencias_temporarias WHERE ausente_user_id = p_origem_user_id AND desfeita_em IS NULL) THEN
    RAISE EXCEPTION 'JA_AUSENTE: Este fiscal tem uma ausência em curso. Desfaça antes de transferir.' USING ERRCODE = '22023';
  END IF;

  -- Fiscal titular: o destino assume; se era o substituto, o contrato fica sem substituto.
  UPDATE public.fisc_contratos f
     SET fiscal_user_id = p_destino_user_id, fiscal_nome = v_destino,
         substituto_user_id = CASE WHEN f.substituto_user_id = p_destino_user_id THEN NULL ELSE f.substituto_user_id END,
         substituto_nome = CASE WHEN f.substituto_user_id = p_destino_user_id THEN NULL ELSE f.substituto_nome END,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE f.fiscal_user_id = p_origem_user_id;
  GET DIAGNOSTICS v_titular = ROW_COUNT;

  -- Substituto: o destino passa a substituto, salvo onde ele já é o fiscal.
  UPDATE public.fisc_contratos f
     SET substituto_user_id = CASE WHEN f.fiscal_user_id = p_destino_user_id THEN NULL ELSE p_destino_user_id END,
         substituto_nome = CASE WHEN f.fiscal_user_id = p_destino_user_id THEN NULL ELSE v_destino END,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE f.substituto_user_id = p_origem_user_id;
  GET DIAGNOSTICS v_subst = ROW_COUNT;

  IF v_titular + v_subst = 0 THEN
    RAISE EXCEPTION 'NADA_A_TRANSFERIR: Este fiscal não tem contratos.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('fiscal', v_titular, 'substituto', v_subst, 'destino', v_destino);
END;
$$;
REVOKE ALL ON FUNCTION public.transferir_contratos_fiscal(UUID, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transferir_contratos_fiscal(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- transferir_contratos_fiscal_temporaria: ausência com retorno previsto.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transferir_contratos_fiscal_temporaria(
  p_ausente_user_id UUID,
  p_destino_user_id UUID,
  p_motivo TEXT,
  p_inicio DATE,
  p_retorno_previsto DATE,
  p_sei_numero TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  INSERT INTO public.fisc_transferencias_temporarias_itens (transferencia_id, contract_key, substituto_antes_id, substituto_antes_nome)
  SELECT v_id, f.contract_key, f.substituto_user_id, f.substituto_nome
    FROM public.fisc_contratos f
   WHERE f.fiscal_user_id = p_ausente_user_id;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  -- Quem assume vira o fiscal; se era o substituto, quem sai fica de substituto no período.
  UPDATE public.fisc_contratos f
     SET fiscal_user_id = p_destino_user_id, fiscal_nome = v_destino,
         substituto_user_id = CASE WHEN f.substituto_user_id = p_destino_user_id THEN p_ausente_user_id ELSE f.substituto_user_id END,
         substituto_nome = CASE WHEN f.substituto_user_id = p_destino_user_id THEN v_ausente ELSE f.substituto_nome END,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE f.fiscal_user_id = p_ausente_user_id;

  RETURN jsonb_build_object('id', v_id, 'contratos', v_qtd, 'destino', v_destino);
END;
$$;
REVOKE ALL ON FUNCTION public.transferir_contratos_fiscal_temporaria(UUID, UUID, TEXT, DATE, DATE, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transferir_contratos_fiscal_temporaria(UUID, UUID, TEXT, DATE, DATE, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- desfazer_transferencia_fiscal: devolve o que ainda está com quem assumiu.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desfazer_transferencia_fiscal(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
             -- O substituto de antes volta, salvo se no período o contrato ganhou outro (que não seja quem saiu).
             substituto_user_id = CASE
               WHEN f.substituto_user_id IS NOT DISTINCT FROM v_t.ausente_user_id OR f.substituto_user_id IS NOT DISTINCT FROM v_item.substituto_antes_id
                 THEN v_item.substituto_antes_id
               ELSE f.substituto_user_id END,
             substituto_nome = CASE
               WHEN f.substituto_user_id IS NOT DISTINCT FROM v_t.ausente_user_id OR f.substituto_user_id IS NOT DISTINCT FROM v_item.substituto_antes_id
                 THEN v_item.substituto_antes_nome
               ELSE f.substituto_nome END,
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
$$;
REVOKE ALL ON FUNCTION public.desfazer_transferencia_fiscal(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.desfazer_transferencia_fiscal(UUID) TO authenticated;
