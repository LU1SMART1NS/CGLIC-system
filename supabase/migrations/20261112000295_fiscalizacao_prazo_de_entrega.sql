-- ==============================================================================
-- Versão: 20261112000295_fiscalizacao_prazo_de_entrega.sql
-- Prazo de entrega da Fiscalização pela regra do contrato (protótipo aprovado em 12/11/2026).
--
-- A data prevista do item deixa de ser digitada: sai da regra do contrato (dias, corridos ou úteis, a partir de
-- quando: recebimento da Ordem, emissão da Ordem, assinatura do contrato ou autorização do Exército) e só muda por
-- prorrogação registrada (motivo + SEI). Enquanto o item aguarda o Exército, o prazo do fornecedor fica suspenso: na
-- autorização, os dias de espera voltam ao fornecedor (ou o prazo começa, quando a regra conta da autorização).
--
-- 1) fisc_contratos: regra do prazo (prazo_*). Nesta entrega a regra é informada no contrato (origem CONTRATO); a
--    leitura do Termo de Referência da ata (origem TR) vem na próxima.
-- 2) fisc_entregas: de onde veio a data (prevista_origem), recebimento da Ordem, prazo em dias, data anterior à última
--    prorrogação, data pela regra, dias devolvidos pelo Exército. Datas de hoje: PLANILHA (carga) ou MANUAL.
-- 3) Movimentos novos: RECEBIMENTO, PRORROGACAO, SUSPENSAO, PRAZO.
-- 4) fisc_dia_util e fisc_prevista_pela_regra (Lei 14.133, art. 183: o dia do começo não conta; vencimento em dia sem
--    expediente passa ao dia útil seguinte; feriados nacionais fixos).
-- 5) Gatilho fisc_prazo_na_etapa (BEFORE UPDATE OF etapa): saída do Exército, volta ao Exército, Ordem com prazo da
--    emissão ou da assinatura. Gatilho fisc_prazo_na_divisao (BEFORE INSERT): a parte dividida leva o prazo.
-- 6) RPCs definir_prazo_entrega_contrato, registrar_recebimento_ordem, prorrogar_prazo_entregas.
-- 7) definir_prevista_entregas marca a data como MANUAL (as telas deixam de usar).
-- 8) fisc_entregas_lista e fisc_contratos_para_distribuicao devolvem os campos novos.
-- ==============================================================================

-- 1) Regra do prazo no contrato ------------------------------------------------------------------------------
ALTER TABLE public.fisc_contratos
  ADD COLUMN IF NOT EXISTS prazo_dias              INTEGER,
  ADD COLUMN IF NOT EXISTS prazo_contagem          VARCHAR(8),
  ADD COLUMN IF NOT EXISTS prazo_inicio            VARCHAR(15),
  ADD COLUMN IF NOT EXISTS prazo_origem            VARCHAR(8),
  ADD COLUMN IF NOT EXISTS prazo_ata               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS prazo_trecho            TEXT,
  ADD COLUMN IF NOT EXISTS prazo_documento         TEXT,
  ADD COLUMN IF NOT EXISTS prazo_motivo            TEXT,
  ADD COLUMN IF NOT EXISTS prazo_definido_por_nome VARCHAR(200),
  ADD COLUMN IF NOT EXISTS prazo_definido_em       TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fisc_contratos_prazo_regra') THEN
    ALTER TABLE public.fisc_contratos ADD CONSTRAINT fisc_contratos_prazo_regra CHECK (
      (prazo_dias IS NULL AND prazo_contagem IS NULL AND prazo_inicio IS NULL)
      OR (prazo_dias BETWEEN 1 AND 730
          AND prazo_contagem IN ('CORRIDOS', 'UTEIS')
          AND prazo_inicio IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO')
          AND prazo_origem IN ('TR', 'CONTRATO')));
  END IF;
END $$;

-- 2) De onde veio a data prevista do item ----------------------------------------------------------------------
ALTER TABLE public.fisc_entregas
  ADD COLUMN IF NOT EXISTS prevista_origem   VARCHAR(12),
  ADD COLUMN IF NOT EXISTS ordem_recebida_em DATE,
  ADD COLUMN IF NOT EXISTS prazo_dias        INTEGER,
  ADD COLUMN IF NOT EXISTS prevista_anterior DATE,
  ADD COLUMN IF NOT EXISTS prevista_original DATE,
  ADD COLUMN IF NOT EXISTS dias_suspensos    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_suspensao  INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fisc_entregas_prevista_origem') THEN
    ALTER TABLE public.fisc_entregas ADD CONSTRAINT fisc_entregas_prevista_origem CHECK (
      prevista_origem IS NULL OR prevista_origem IN ('ORDEM', 'ASSINATURA', 'EXERCITO', 'PRORROGACAO', 'PLANILHA', 'MANUAL'));
  END IF;
END $$;

COMMENT ON COLUMN public.fisc_entregas.prevista_origem IS
  'De onde veio a data prevista (migration 294): ORDEM, ASSINATURA, EXERCITO (regra do contrato), PRORROGACAO, PLANILHA (carga da SFC/CGLIC), MANUAL (antes da regra).';
COMMENT ON COLUMN public.fisc_entregas.dias_suspensos IS 'Dias devolvidos ao fornecedor pela espera no Exército (migration 294).';
COMMENT ON COLUMN public.fisc_entregas.ultima_suspensao IS 'Dias da última suspensão, desfeitos se o item voltar ao Exército (migration 294).';

-- Datas de hoje: a carga da planilha trouxe quase todas; as informadas pelo botão "Data prevista" ficam MANUAL.
UPDATE public.fisc_entregas e
   SET prevista_origem = CASE WHEN EXISTS (SELECT 1 FROM public.fisc_entrega_movimentos m WHERE m.entrega_id = e.id AND m.tipo = 'PREVISTA')
                              THEN 'MANUAL' ELSE 'PLANILHA' END
 WHERE e.prevista IS NOT NULL AND e.prevista_origem IS NULL;

-- 3) Movimentos novos ----------------------------------------------------------------------------------------
ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT IF EXISTS fisc_entrega_movimentos_tipo;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo CHECK (tipo IN (
  'CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA', 'PROGRAMA', 'ITEM', 'BENEFICIARIO',
  'VOLTA', 'DESFEITO', 'CORRECAO', 'ENCERRADA', 'REABERTA', 'RECEBIMENTO', 'PRORROGACAO', 'SUSPENSAO', 'PRAZO'));

-- 4) A conta dos dias ------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_dia_util(p_dia DATE)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXTRACT(ISODOW FROM p_dia) < 6
     AND to_char(p_dia, 'MM-DD') <> ALL (ARRAY['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);
$$;

CREATE OR REPLACE FUNCTION public.fisc_prevista_pela_regra(p_inicio DATE, p_dias INTEGER, p_contagem TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE d DATE := p_inicio; n INTEGER := 0;
BEGIN
  IF p_inicio IS NULL OR p_dias IS NULL THEN RETURN NULL; END IF;
  IF p_contagem = 'UTEIS' THEN
    WHILE n < p_dias LOOP
      d := d + 1;
      IF public.fisc_dia_util(d) THEN n := n + 1; END IF;
    END LOOP;
    RETURN d;
  END IF;
  d := p_inicio + p_dias;
  WHILE NOT public.fisc_dia_util(d) LOOP d := d + 1; END LOOP;
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_dia_util(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fisc_prevista_pela_regra(DATE, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_dia_util(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_prevista_pela_regra(DATE, INTEGER, TEXT) TO authenticated, service_role;

-- Data de assinatura do contrato (a mesma que a Distribuição mostra).
CREATE OR REPLACE FUNCTION public.fisc_assinatura_do_contrato(p_contrato TEXT)
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(c.registro->>'dataAssinatura', '')::DATE
    FROM public.contratos_oficiais c WHERE c.contract_key = p_contrato
   ORDER BY c.sincronizado_em DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fisc_assinatura_do_contrato(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_assinatura_do_contrato(TEXT) TO service_role;

-- 5) Gatilhos ----------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_prazo_na_etapa()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  f        public.fisc_contratos%ROWTYPE;
  v_ex     INTEGER := public.fisc_ordem_da_etapa('CONTROLADO');
  v_ordem  INTEGER := public.fisc_ordem_da_etapa('ORDEM');
  v_de     INTEGER := public.fisc_ordem_da_etapa(OLD.etapa);
  v_para   INTEGER := public.fisc_ordem_da_etapa(NEW.etapa);
  v_d      INTEGER;
  v_inicio DATE;
BEGIN
  IF NEW.etapa IS NOT DISTINCT FROM OLD.etapa OR NEW.responsavel = 'AREA' THEN RETURN NEW; END IF;
  SELECT * INTO f FROM public.fisc_contratos WHERE contract_key = NEW.contract_key;

  -- Saída do Exército para a frente: o prazo que conta da autorização começa; o que já corria anda os dias da espera.
  IF OLD.etapa = 'CONTROLADO' AND v_para > v_ex THEN
    IF f.prazo_inicio = 'EXERCITO' AND NEW.prevista IS NULL THEN
      NEW.prevista := public.fisc_prevista_pela_regra(NEW.etapa_em, f.prazo_dias, f.prazo_contagem);
      NEW.prevista_original := NEW.prevista;
      NEW.prevista_origem := 'EXERCITO';
      NEW.prazo_dias := f.prazo_dias;
      NEW.ultima_suspensao := 0;
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
      VALUES (NEW.id, 'PRAZO', NEW.prevista,
              format('Autorização do Exército em %s: %s %s, entrega até %s', to_char(NEW.etapa_em, 'DD/MM/YYYY'), f.prazo_dias,
                     CASE WHEN f.prazo_contagem = 'UTEIS' THEN 'dias úteis' ELSE 'dias corridos' END, to_char(NEW.prevista, 'DD/MM/YYYY')),
              auth.uid(), NEW.atualizado_por_nome);
    ELSIF NEW.prevista IS NOT NULL AND OLD.etapa_em IS NOT NULL AND NEW.etapa_em IS NOT NULL THEN
      v_d := GREATEST(0, NEW.etapa_em - OLD.etapa_em);
      IF v_d > 0 THEN
        INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
        VALUES (NEW.id, 'SUSPENSAO', NEW.etapa_em,
                format('Aguardando o Exército de %s a %s: %s dias voltam ao fornecedor; entrega prevista de %s para %s',
                       to_char(OLD.etapa_em, 'DD/MM/YYYY'), to_char(NEW.etapa_em, 'DD/MM/YYYY'), v_d,
                       to_char(NEW.prevista, 'DD/MM/YYYY'), to_char(NEW.prevista + v_d, 'DD/MM/YYYY')),
                auth.uid(), NEW.atualizado_por_nome);
        NEW.prevista := NEW.prevista + v_d;
        NEW.dias_suspensos := NEW.dias_suspensos + v_d;
        NEW.ultima_suspensao := v_d;
      END IF;
    END IF;
  END IF;

  -- Volta ao Exército (Voltar etapa ou correção): desfaz a última saída.
  IF NEW.etapa = 'CONTROLADO' AND v_de > v_ex THEN
    IF NEW.prevista_origem = 'EXERCITO' THEN
      NEW.prevista := NULL; NEW.prevista_original := NULL; NEW.prevista_origem := NULL; NEW.prazo_dias := NULL;
    ELSIF NEW.ultima_suspensao > 0 AND NEW.prevista IS NOT NULL THEN
      NEW.prevista := NEW.prevista - NEW.ultima_suspensao;
      NEW.dias_suspensos := GREATEST(0, NEW.dias_suspensos - NEW.ultima_suspensao);
    END IF;
    NEW.ultima_suspensao := 0;
  END IF;

  -- Ordem registrada: prazo da emissão ou da assinatura sai sozinho (o do recebimento espera o fiscal informar).
  IF NEW.etapa = 'ORDEM' AND v_de < v_ordem AND NEW.prevista IS NULL AND f.prazo_inicio IN ('OF_EMISSAO', 'ASSINATURA') THEN
    v_inicio := CASE WHEN f.prazo_inicio = 'OF_EMISSAO' THEN NEW.etapa_em ELSE public.fisc_assinatura_do_contrato(NEW.contract_key) END;
    IF v_inicio IS NOT NULL THEN
      NEW.prevista := public.fisc_prevista_pela_regra(v_inicio, f.prazo_dias, f.prazo_contagem);
      NEW.prevista_original := NEW.prevista;
      NEW.prevista_origem := CASE WHEN f.prazo_inicio = 'OF_EMISSAO' THEN 'ORDEM' ELSE 'ASSINATURA' END;
      NEW.prazo_dias := f.prazo_dias;
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
      VALUES (NEW.id, 'PRAZO', NEW.prevista,
              format('%s %s %s (%s): entrega até %s', f.prazo_dias, CASE WHEN f.prazo_contagem = 'UTEIS' THEN 'dias úteis' ELSE 'dias corridos' END,
                     CASE WHEN f.prazo_inicio = 'OF_EMISSAO' THEN 'da emissão da Ordem' ELSE 'da assinatura do contrato' END,
                     to_char(v_inicio, 'DD/MM/YYYY'), to_char(NEW.prevista, 'DD/MM/YYYY')),
              auth.uid(), NEW.atualizado_por_nome);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_prazo_na_etapa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fisc_prazo_na_etapa ON public.fisc_entregas;
CREATE TRIGGER trg_fisc_prazo_na_etapa BEFORE UPDATE OF etapa ON public.fisc_entregas
  FOR EACH ROW EXECUTE FUNCTION public.fisc_prazo_na_etapa();

-- A parte de uma entrega dividida (entrega parcial, repartir) leva o prazo da original.
CREATE OR REPLACE FUNCTION public.fisc_prazo_na_divisao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE o public.fisc_entregas%ROWTYPE;
BEGIN
  IF NEW.dividida_de IS NULL OR NEW.prevista_origem IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO o FROM public.fisc_entregas WHERE id = NEW.dividida_de;
  IF FOUND THEN
    NEW.prevista_origem := o.prevista_origem; NEW.ordem_recebida_em := o.ordem_recebida_em; NEW.prazo_dias := o.prazo_dias;
    NEW.prevista_anterior := o.prevista_anterior; NEW.prevista_original := o.prevista_original;
    NEW.dias_suspensos := o.dias_suspensos; NEW.ultima_suspensao := o.ultima_suspensao;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_prazo_na_divisao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fisc_prazo_na_divisao ON public.fisc_entregas;
CREATE TRIGGER trg_fisc_prazo_na_divisao BEFORE INSERT ON public.fisc_entregas
  FOR EACH ROW EXECUTE FUNCTION public.fisc_prazo_na_divisao();

-- 6) RPCs ------------------------------------------------------------------------------------------------
-- Regra do prazo do contrato: fiscal do contrato ou coordenador. Mudar uma regra que já existe pede motivo.
CREATE OR REPLACE FUNCTION public.definir_prazo_entrega_contrato(p_contract_key TEXT, p_dias INTEGER, p_contagem TEXT, p_inicio TEXT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f       public.fisc_contratos%ROWTYPE;
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_mot   TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_assin DATE;
  v_n     INTEGER := 0;
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.fisc_contratos WHERE contract_key = p_contract_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Contrato sem fiscalização definida.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND auth.uid() IS DISTINCT FROM f.fiscal_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal ou o coordenador definem o prazo deste contrato.' USING ERRCODE = '42501';
  END IF;
  IF p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 730 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de 1 a 730 dias.' USING ERRCODE = '22023';
  END IF;
  IF p_contagem NOT IN ('CORRIDOS', 'UTEIS') OR p_inicio NOT IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Contagem ou início do prazo inválido.' USING ERRCODE = '22023';
  END IF;
  IF f.prazo_dias IS NOT NULL AND (f.prazo_dias, f.prazo_contagem, f.prazo_inicio) IS DISTINCT FROM (p_dias, p_contagem::VARCHAR, p_inicio::VARCHAR)
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fisc_contratos
     SET prazo_dias = p_dias, prazo_contagem = p_contagem, prazo_inicio = p_inicio, prazo_origem = 'CONTRATO',
         prazo_motivo = COALESCE(v_mot, prazo_motivo), prazo_definido_por_nome = v_nome, prazo_definido_em = NOW(),
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE contract_key = p_contract_key;

  -- Prazo da assinatura: a data sai já para os itens a entregar que estão sem data.
  IF p_inicio = 'ASSINATURA' THEN
    v_assin := public.fisc_assinatura_do_contrato(p_contract_key);
    IF v_assin IS NOT NULL THEN
      WITH alvo AS (
        UPDATE public.fisc_entregas e
           SET prevista = public.fisc_prevista_pela_regra(v_assin, p_dias, p_contagem), prevista_original = public.fisc_prevista_pela_regra(v_assin, p_dias, p_contagem),
               prevista_origem = 'ASSINATURA', prazo_dias = p_dias, atualizado_por_nome = v_nome, atualizado_em = NOW()
         WHERE e.contract_key = p_contract_key AND e.prevista IS NULL AND e.entregue_em IS NULL AND e.encerrada_em IS NULL
           AND e.responsavel = 'SFC' AND e.etapa <> 'CONTROLADO'
        RETURNING e.id, e.prevista)
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
      SELECT a.id, 'PRAZO', a.prevista, format('%s %s da assinatura do contrato (%s): entrega até %s', p_dias,
             CASE WHEN p_contagem = 'UTEIS' THEN 'dias úteis' ELSE 'dias corridos' END, to_char(v_assin, 'DD/MM/YYYY'), to_char(a.prevista, 'DD/MM/YYYY')),
             auth.uid(), v_nome
        FROM alvo a;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
  END IF;
  RETURN jsonb_build_object('contrato', p_contract_key, 'itens_com_data', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_prazo_entrega_contrato(TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_prazo_entrega_contrato(TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- Recebimento da Ordem pelo fornecedor: data prevista = recebimento + prazo (+ dias já devolvidos pelo Exército).
CREATE OR REPLACE FUNCTION public.registrar_recebimento_ordem(p_ids UUID[], p_recebida_em DATE, p_prazo_dias INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_hoje  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  f       public.fisc_contratos%ROWTYPE;
  v_cont  TEXT;
  e       RECORD;
  v_pela  DATE;
  v_n     INTEGER := 0;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF p_recebida_em IS NULL OR p_recebida_em > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Data do recebimento até hoje.' USING ERRCODE = '22023';
  END IF;
  IF p_prazo_dias IS NULL OR p_prazo_dias NOT BETWEEN 1 AND 730 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de 1 a 730 dias.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT contract_key) FROM public.fisc_entregas WHERE id = ANY (p_ids)) > 1 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Registre o recebimento de um contrato por vez.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids)
              AND (responsavel <> 'SFC' OR entregue_em IS NOT NULL OR public.fisc_ordem_da_etapa(etapa) < public.fisc_ordem_da_etapa('ORDEM'))) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Só itens com a Ordem registrada e ainda não entregues.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND etapa = 'ORDEM' AND etapa_em > p_recebida_em) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O recebimento não pode ser antes da emissão da Ordem.' USING ERRCODE = '22023';
  END IF;

  SELECT fc.* INTO f FROM public.fisc_contratos fc JOIN public.fisc_entregas x ON x.contract_key = fc.contract_key WHERE x.id = p_ids[1] FOR UPDATE OF fc;
  -- Contrato sem regra: o prazo informado aqui vira a regra (dias corridos do recebimento da Ordem).
  IF f.prazo_dias IS NULL THEN
    UPDATE public.fisc_contratos
       SET prazo_dias = p_prazo_dias, prazo_contagem = 'CORRIDOS', prazo_inicio = 'OF_RECEBIMENTO', prazo_origem = 'CONTRATO',
           prazo_definido_por_nome = v_nome, prazo_definido_em = NOW()
     WHERE contract_key = f.contract_key;
    v_cont := 'CORRIDOS';
  ELSE
    v_cont := f.prazo_contagem;
  END IF;

  FOR e IN SELECT * FROM public.fisc_entregas WHERE id = ANY (p_ids) LOOP
    v_pela := public.fisc_prevista_pela_regra(p_recebida_em, p_prazo_dias, v_cont);
    UPDATE public.fisc_entregas
       SET ordem_recebida_em = p_recebida_em, prazo_dias = p_prazo_dias, prevista_original = v_pela,
           prevista = v_pela + e.dias_suspensos, prevista_origem = 'ORDEM', prevista_anterior = NULL,
           atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = e.id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
    VALUES (e.id, 'RECEBIMENTO', p_recebida_em,
            format('%s %s: entrega até %s%s', p_prazo_dias, CASE WHEN v_cont = 'UTEIS' THEN 'dias úteis' ELSE 'dias corridos' END,
                   to_char(v_pela + e.dias_suspensos, 'DD/MM/YYYY'),
                   CASE WHEN e.prevista IS NOT NULL AND e.prevista <> v_pela + e.dias_suspensos THEN format(' (antes %s)', to_char(e.prevista, 'DD/MM/YYYY')) ELSE '' END),
            auth.uid(), v_nome);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_recebimento_ordem(UUID[], DATE, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_recebimento_ordem(UUID[], DATE, INTEGER) TO authenticated;

-- Prorrogação: nova data depois da de hoje, motivo e SEI da decisão; a data anterior fica guardada.
CREATE OR REPLACE FUNCTION public.prorrogar_prazo_entregas(p_ids UUID[], p_nova_data DATE, p_motivo TEXT, p_documento_sei TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_sei  TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI da decisão');
  v_mot  TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_n    INTEGER;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o documento SEI da decisão.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga o motivo da prorrogação (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;
  IF p_nova_data IS NULL OR EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND prevista IS NOT NULL AND p_nova_data <= prevista) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A nova data tem que ser depois do prazo de hoje.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND (entregue_em IS NOT NULL OR responsavel <> 'SFC')) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Só itens ainda não entregues e acompanhados pela SFC/CGLIC.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, documento_sei, observacao, criado_por, criado_por_nome)
  SELECT id, 'PRORROGACAO', p_nova_data, v_sei,
         v_mot || CASE WHEN prevista IS NOT NULL THEN format(' Era %s.', to_char(prevista, 'DD/MM/YYYY')) ELSE '' END,
         auth.uid(), v_nome
    FROM public.fisc_entregas WHERE id = ANY (p_ids);
  UPDATE public.fisc_entregas
     SET prevista_anterior = prevista, prevista_original = COALESCE(prevista_original, prevista), prevista = p_nova_data,
         prevista_origem = 'PRORROGACAO', ultima_suspensao = 0, atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.prorrogar_prazo_entregas(UUID[], DATE, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.prorrogar_prazo_entregas(UUID[], DATE, TEXT, TEXT) TO authenticated;

-- 7) "Data prevista" livre (versão anterior das telas): a data fica MANUAL ----------------------------------
CREATE OR REPLACE FUNCTION public.definir_prevista_entregas(p_ids uuid[], p_prevista date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_nome TEXT := left(public.nome_do_usuario_logado(), 200); v_n INTEGER;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  UPDATE public.fisc_entregas SET prevista = p_prevista, prevista_origem = CASE WHEN p_prevista IS NULL THEN NULL ELSE 'MANUAL' END,
         atualizado_por_nome = v_nome, atualizado_em = NOW() WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, criado_por, criado_por_nome)
  SELECT id, 'PREVISTA', p_prevista, auth.uid(), v_nome FROM public.fisc_entregas WHERE id = ANY (p_ids);
  RETURN jsonb_build_object('entregas', v_n);
END;
$function$;

-- 8) Leituras com os campos novos ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fisc_entregas_lista(TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.fisc_entregas_lista(p_contrato text DEFAULT NULL::text, p_encerradas boolean DEFAULT false)
 RETURNS TABLE(id uuid, contract_key text, contrato_numero text, fornecedor text, fiscal_user_id uuid, fiscal_nome text, fiscalizacao text, item_key text, item_nome text, item_descricao text, item_texto text, beneficiario_id uuid, beneficiario_nome text, beneficiario_sigla text, beneficiario_razao text, beneficiario_texto text, municipio text, uf text, quantidade integer, origem text, emenda text, pedido_id uuid, responsavel text, etapa text, etapa_em date, prevista date, entregue_em date, dividida_de uuid, programa_texto text, carga_linha integer, faturado_em date, pago_em date, atualizado_por_nome text, atualizado_em timestamp with time zone, programa_id uuid, programa_ativo boolean, parlamentar_nome text, entrega_logradouro text, entrega_numero text, entrega_complemento text, entrega_bairro text, entrega_cep text, aviso jsonb, encerrada_em date, encerrada_motivo text, prevista_origem text, ordem_recebida_em date, prazo_dias integer, prevista_anterior date, prevista_original date, dias_suspensos integer, prazo_inicio text, prazo_contagem text)
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
         e.encerrada_em, e.encerrada_motivo::TEXT,
         e.prevista_origem::TEXT, e.ordem_recebida_em, e.prazo_dias, e.prevista_anterior, e.prevista_original, e.dias_suspensos, f.prazo_inicio::TEXT, f.prazo_contagem::TEXT
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
$function$
;
REVOKE ALL ON FUNCTION public.fisc_entregas_lista(TEXT, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_lista(TEXT, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.fisc_contratos_para_distribuicao();
CREATE OR REPLACE FUNCTION public.fisc_contratos_para_distribuicao()
 RETURNS TABLE(contract_key text, uasg text, numero text, fornecedor text, objeto text, assinatura date, vigencia_fim date, emendas text[], situacao text, motivo text, fiscal_user_id uuid, fiscal_nome text, portaria_sei text, processo_sei text, autuado_em date, definido_por_nome text, definido_em timestamp with time zone, atas text[], unidade_area text, unidades_do_contrato text[], processo_nup text, processo_autuado_em date, prazo_entrega jsonb)
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
  -- Unidades internas do contrato: pela divisão do contratado (migration 103) ou, sem divisão, pela alocação dos
  -- itens da ata ligados ao contrato. Sugestão para a área requisitante.
  divisao AS (
    SELECT u.contract_key AS chave, array_agg(DISTINCT u.unit_name::TEXT ORDER BY u.unit_name::TEXT) AS lista
      FROM public.contrato_item_divisao_unidades u
     GROUP BY u.contract_key
  ),
  alocacao AS (
    SELECT k.contract_key AS chave, array_agg(DISTINCT a.unit_name::TEXT ORDER BY a.unit_name::TEXT) AS lista
      FROM public.arp_item_contract_links k
      JOIN public.arp_allocations a ON a.item_key = k.item_key AND a.allocated_qty > 0
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
         COALESCE(at.lista, ARRAY[]::TEXT[]),
         f.unidade_area::TEXT,
         COALESCE(dv.lista, al.lista, ARRAY[]::TEXT[]),
         f.processo_nup::TEXT, f.processo_autuado_em,
         CASE WHEN f.prazo_dias IS NOT NULL THEN jsonb_build_object(
           'dias', f.prazo_dias, 'contagem', f.prazo_contagem, 'inicio', f.prazo_inicio, 'origem', f.prazo_origem, 'ata', f.prazo_ata,
           'trecho', f.prazo_trecho, 'documento', f.prazo_documento, 'motivo', f.prazo_motivo,
           'definidoPor', f.prazo_definido_por_nome, 'definidoEm', f.prazo_definido_em) END
    FROM contratos c
    LEFT JOIN emendas e ON e.chave = c.contract_key
    LEFT JOIN atas at ON at.chave = c.contract_key
    LEFT JOIN divisao dv ON dv.chave = c.contract_key
    LEFT JOIN alocacao al ON al.chave = c.contract_key
    LEFT JOIN public.fisc_contratos f ON f.contract_key = c.contract_key
   WHERE f.contract_key IS NOT NULL
      OR c.data_vigencia_fim IS NULL
      OR c.data_vigencia_fim >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_contratos_para_distribuicao() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_contratos_para_distribuicao() TO authenticated;
