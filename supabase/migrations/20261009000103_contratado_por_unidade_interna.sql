-- ==============================================================================
-- MIGRATION 103: CONTRATADO POR UNIDADE INTERNA E QUANTIDADE CONTRATADA AJUSTADA
-- Versão: 20261009000103_contratado_por_unidade_interna.sql
--
-- Problema (09/10/2026): o consumo do item da ata é a quantidade contratada dos contratos vinculados
-- (migration 54), mas a unidade interna só tinha alocado e empenhado (notas ligadas pela empenho_links).
-- A soma das unidades nunca fechava com o consumido da SENASP. Protótipo aprovado em 09/10/2026:
-- https://claude.ai/artifact/XDjPN1qvTQM3uhhSzPcKcH
--
-- O que entra
-- 1) Quantidade contratada ajustada no vínculo contrato ↔ item (arp_item_contract_links):
--    o gestor ou o coordenador informa a quantidade a usar no saldo, com justificativa obrigatória.
--    A cópia da fonte (quantidade_contratada_api) continua sendo gravada pela sincronização e nunca é
--    apagada; a sincronização nunca toca a ajustada. Quantidade usada = ajustada, senão a da fonte.
--    O histórico de ajustes e desfazimentos fica em contrato_item_quantidade_ajustes.
-- 2) Divisão do contratado entre as unidades internas (contrato_item_divisoes + _unidades):
--    quanto do contrato, neste item, é de cada unidade. AUTO = o item tem uma unidade alocada só e o
--    contrato vai inteiro para ela (gatilho); USUARIO = repartida pelo gestor, nunca tocada pela automação.
-- 3) RPCs: ajustar_quantidade_contratada, desfazer_ajuste_quantidade_contratada (contracts.manage),
--    dividir_contrato_nas_unidades e desfazer_divisao_contrato_unidades (allocations.link_empenho).
-- 4) Leitura:
--    v_arp_item_contrato_quantidade  uma linha por vínculo: fonte, ajuste, divisão e situação;
--    v_arp_item_unidade_contratado   uma linha por item × unidade: alocado, contratado e livre;
--    v_arp_item_saldo_detalhado      consumo passa a usar a quantidade ajustada; colunas novas ao final.
--
-- O que não muda: empenho_links (a nota herdar a unidade do contrato é feito na tela, a partir da divisão),
-- save_allocations_atomic (a trava "alocado ≥ contratado" fica na tela, como a do empenhado; a view marca
-- a unidade acima do alocado) e a sincronização dos vínculos.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Quantidade ajustada no vínculo contrato ↔ item
-- ------------------------------------------------------------------------------
ALTER TABLE public.arp_item_contract_links
  ADD COLUMN IF NOT EXISTS quantidade_ajustada      NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS ajuste_justificativa     TEXT,
  ADD COLUMN IF NOT EXISTS ajuste_quantidade_fonte  NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS ajustado_por_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ajustado_por_nome        VARCHAR(150),
  ADD COLUMN IF NOT EXISTS ajustado_em              TIMESTAMPTZ;

ALTER TABLE public.arp_item_contract_links DROP CONSTRAINT IF EXISTS arp_item_contract_links_ajuste_check;
ALTER TABLE public.arp_item_contract_links ADD CONSTRAINT arp_item_contract_links_ajuste_check CHECK (
  quantidade_ajustada IS NULL
  OR (
    quantidade_ajustada >= 0
    AND quantidade_ajustada = trunc(quantidade_ajustada)
    AND length(btrim(ajuste_justificativa)) BETWEEN 15 AND 500
    AND ajustado_por_nome IS NOT NULL
    AND ajustado_em IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS arp_item_contract_links_ajustado_por_idx
  ON public.arp_item_contract_links (ajustado_por_user_id) WHERE ajustado_por_user_id IS NOT NULL;

COMMENT ON COLUMN public.arp_item_contract_links.quantidade_ajustada IS
  'Quantidade do item no contrato informada pelo gestor (inteira). NULL = usa a da fonte (quantidade_contratada_api). A sincronização nunca altera.';
COMMENT ON COLUMN public.arp_item_contract_links.ajuste_quantidade_fonte IS
  'Quantidade da fonte no momento do ajuste. Diferente da atual = a fonte mudou depois do ajuste ("confira").';

CREATE TABLE IF NOT EXISTS public.contrato_item_quantidade_ajustes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key             VARCHAR(100) NOT NULL,
  contract_key         VARCHAR(150) NOT NULL,
  acao                 VARCHAR(10) NOT NULL,
  quantidade_anterior  NUMERIC(18, 4),   -- quantidade usada antes (ajustada ou da fonte)
  quantidade_ajustada  NUMERIC(18, 4),   -- nova ajustada; NULL ao desfazer
  quantidade_fonte     NUMERIC(18, 4),   -- da fonte no momento
  justificativa        TEXT NOT NULL,
  feito_por_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feito_por_nome       VARCHAR(150) NOT NULL,
  feito_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contrato_item_quantidade_ajustes_acao CHECK (acao IN ('AJUSTE', 'DESFAZER')),
  CONSTRAINT contrato_item_quantidade_ajustes_just CHECK (length(btrim(justificativa)) BETWEEN 15 AND 500)
);

CREATE INDEX IF NOT EXISTS contrato_item_quantidade_ajustes_vinculo_idx
  ON public.contrato_item_quantidade_ajustes (item_key, contract_key, feito_em DESC);
CREATE INDEX IF NOT EXISTS contrato_item_quantidade_ajustes_contrato_idx
  ON public.contrato_item_quantidade_ajustes (contract_key);
CREATE INDEX IF NOT EXISTS contrato_item_quantidade_ajustes_autor_idx
  ON public.contrato_item_quantidade_ajustes (feito_por_user_id) WHERE feito_por_user_id IS NOT NULL;

COMMENT ON TABLE public.contrato_item_quantidade_ajustes IS
  'Histórico dos ajustes da quantidade contratada (ajustar e desfazer), com justificativa. Não depende do vínculo: fica mesmo se o vínculo sair.';

-- ------------------------------------------------------------------------------
-- 2) Divisão do contratado entre as unidades internas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_item_divisoes (
  item_key                 VARCHAR(100) NOT NULL,
  contract_key             VARCHAR(100) NOT NULL,
  origem                   VARCHAR(10) NOT NULL,
  quantidade_contrato      NUMERIC(18, 4) NOT NULL,   -- quantidade usada do contrato quando foi dividido
  dividido_por_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dividido_por_nome        VARCHAR(150),
  dividido_em              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observacao               TEXT,
  PRIMARY KEY (item_key, contract_key),
  CONSTRAINT contrato_item_divisoes_vinculo FOREIGN KEY (item_key, contract_key)
    REFERENCES public.arp_item_contract_links (item_key, contract_key) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT contrato_item_divisoes_origem CHECK (origem IN ('AUTO', 'USUARIO')),
  CONSTRAINT contrato_item_divisoes_qtd CHECK (quantidade_contrato >= 0),
  CONSTRAINT contrato_item_divisoes_obs CHECK (observacao IS NULL OR length(observacao) <= 500),
  CONSTRAINT contrato_item_divisoes_autor CHECK (origem = 'AUTO' OR dividido_por_nome IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS contrato_item_divisoes_contract_idx ON public.contrato_item_divisoes (contract_key);
CREATE INDEX IF NOT EXISTS contrato_item_divisoes_autor_idx
  ON public.contrato_item_divisoes (dividido_por_user_id) WHERE dividido_por_user_id IS NOT NULL;

COMMENT ON TABLE public.contrato_item_divisoes IS
  'Divisão do contratado de um contrato, num item da ata, entre as unidades internas. AUTO = item com uma unidade alocada (servidor); USUARIO = repartida pelo gestor.';

CREATE TABLE IF NOT EXISTS public.contrato_item_divisao_unidades (
  item_key      VARCHAR(100) NOT NULL,
  contract_key  VARCHAR(100) NOT NULL,
  unit_name     VARCHAR(50) NOT NULL REFERENCES public.internal_departments(sigla) ON UPDATE CASCADE,
  quantidade    NUMERIC(18, 4) NOT NULL,
  PRIMARY KEY (item_key, contract_key, unit_name),
  CONSTRAINT contrato_item_divisao_unidades_divisao FOREIGN KEY (item_key, contract_key)
    REFERENCES public.contrato_item_divisoes (item_key, contract_key) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT contrato_item_divisao_unidades_qtd CHECK (quantidade > 0)
);

CREATE INDEX IF NOT EXISTS contrato_item_divisao_unidades_unit_idx ON public.contrato_item_divisao_unidades (unit_name);
CREATE INDEX IF NOT EXISTS contrato_item_divisao_unidades_item_unit_idx ON public.contrato_item_divisao_unidades (item_key, unit_name);

COMMENT ON TABLE public.contrato_item_divisao_unidades IS
  'Parcelas da divisão: quanto do contrato, neste item, é de cada unidade interna (pela sigla).';

-- Segurança: leitura para logados; escrita só pelas RPCs e gatilhos.
ALTER TABLE public.contrato_item_quantidade_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_item_divisoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_item_divisao_unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contrato_item_quantidade_ajustes" ON public.contrato_item_quantidade_ajustes;
CREATE POLICY "Authenticated Read: contrato_item_quantidade_ajustes"
  ON public.contrato_item_quantidade_ajustes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: contrato_item_divisoes" ON public.contrato_item_divisoes;
CREATE POLICY "Authenticated Read: contrato_item_divisoes"
  ON public.contrato_item_divisoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: contrato_item_divisao_unidades" ON public.contrato_item_divisao_unidades;
CREATE POLICY "Authenticated Read: contrato_item_divisao_unidades"
  ON public.contrato_item_divisao_unidades FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.contrato_item_quantidade_ajustes, public.contrato_item_divisoes, public.contrato_item_divisao_unidades FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_item_quantidade_ajustes, public.contrato_item_divisoes, public.contrato_item_divisao_unidades FROM authenticated;
GRANT SELECT ON public.contrato_item_quantidade_ajustes, public.contrato_item_divisoes, public.contrato_item_divisao_unidades TO authenticated;
GRANT ALL ON public.contrato_item_quantidade_ajustes, public.contrato_item_divisoes, public.contrato_item_divisao_unidades TO service_role;

-- Auditoria: a divisão anterior fica em audit_logs quando o gestor refaz ou desfaz.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_contrato_item_divisoes ON public.contrato_item_divisoes;
    CREATE TRIGGER trg_audit_contrato_item_divisoes
      AFTER INSERT OR UPDATE OR DELETE ON public.contrato_item_divisoes
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
    DROP TRIGGER IF EXISTS trg_audit_contrato_item_divisao_unidades ON public.contrato_item_divisao_unidades;
    CREATE TRIGGER trg_audit_contrato_item_divisao_unidades
      AFTER INSERT OR UPDATE OR DELETE ON public.contrato_item_divisao_unidades
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Divisão automática: item com uma unidade alocada recebe o contrato inteiro nela
-- ------------------------------------------------------------------------------
-- Regras (divisão USUARIO nunca é tocada):
--  - quantidade usada nula ou zero: a divisão AUTO sai;
--  - uma unidade alocada no item: AUTO com o contrato inteiro nessa unidade;
--  - nenhuma unidade alocada: a divisão AUTO sai;
--  - várias unidades: a AUTO que já existe acompanha a quantidade se a unidade dela continua alocada,
--    e sai se não continua. Sem AUTO, nada é criado (o gestor reparte).
CREATE OR REPLACE FUNCTION public.aplicar_divisao_automatica_contrato_item(p_item_key VARCHAR, p_contract_key VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qtd        NUMERIC(18, 4);
  v_existe     BOOLEAN;
  v_origem     VARCHAR(10);
  v_unidades   VARCHAR(50)[];
  v_unidade    VARCHAR(50);
  v_auto_unid  VARCHAR(50);
BEGIN
  SELECT COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api), TRUE
    INTO v_qtd, v_existe
    FROM public.arp_item_contract_links l
   WHERE l.item_key = p_item_key AND l.contract_key = p_contract_key;
  IF v_existe IS NULL THEN
    RETURN; -- vínculo não existe (ou saiu): a divisão já foi junto por cascata
  END IF;

  SELECT d.origem INTO v_origem
    FROM public.contrato_item_divisoes d
   WHERE d.item_key = p_item_key AND d.contract_key = p_contract_key;
  IF v_origem = 'USUARIO' THEN
    RETURN;
  END IF;

  IF v_qtd IS NULL OR v_qtd <= 0 THEN
    DELETE FROM public.contrato_item_divisoes
     WHERE item_key = p_item_key AND contract_key = p_contract_key AND origem = 'AUTO';
    RETURN;
  END IF;

  SELECT array_agg(a.unit_name ORDER BY a.unit_name) INTO v_unidades
    FROM public.arp_allocations a
   WHERE a.item_key = p_item_key
     AND EXISTS (SELECT 1 FROM public.internal_departments d WHERE d.sigla = a.unit_name);

  IF COALESCE(array_length(v_unidades, 1), 0) = 1 THEN
    v_unidade := v_unidades[1];
  ELSIF v_origem = 'AUTO' AND array_length(v_unidades, 1) > 1 THEN
    SELECT u.unit_name INTO v_auto_unid
      FROM public.contrato_item_divisao_unidades u
     WHERE u.item_key = p_item_key AND u.contract_key = p_contract_key
     LIMIT 1;
    IF v_auto_unid = ANY (v_unidades) THEN
      v_unidade := v_auto_unid;
    END IF;
  END IF;

  IF v_unidade IS NULL THEN
    DELETE FROM public.contrato_item_divisoes
     WHERE item_key = p_item_key AND contract_key = p_contract_key AND origem = 'AUTO';
    RETURN;
  END IF;

  -- Já está certa? Não regrava (evita ruído na auditoria).
  IF v_origem = 'AUTO'
     AND (SELECT quantidade_contrato FROM public.contrato_item_divisoes
           WHERE item_key = p_item_key AND contract_key = p_contract_key) = v_qtd
     AND (SELECT count(*) FROM public.contrato_item_divisao_unidades
           WHERE item_key = p_item_key AND contract_key = p_contract_key) = 1
     AND EXISTS (SELECT 1 FROM public.contrato_item_divisao_unidades
                  WHERE item_key = p_item_key AND contract_key = p_contract_key
                    AND unit_name = v_unidade AND quantidade = v_qtd) THEN
    RETURN;
  END IF;

  INSERT INTO public.contrato_item_divisoes (item_key, contract_key, origem, quantidade_contrato, dividido_em)
  VALUES (p_item_key, p_contract_key, 'AUTO', v_qtd, NOW())
  ON CONFLICT (item_key, contract_key) DO UPDATE
    SET quantidade_contrato = EXCLUDED.quantidade_contrato,
        dividido_em = NOW()
  WHERE public.contrato_item_divisoes.origem = 'AUTO';

  DELETE FROM public.contrato_item_divisao_unidades
   WHERE item_key = p_item_key AND contract_key = p_contract_key AND unit_name <> v_unidade;
  INSERT INTO public.contrato_item_divisao_unidades (item_key, contract_key, unit_name, quantidade)
  VALUES (p_item_key, p_contract_key, v_unidade, v_qtd)
  ON CONFLICT (item_key, contract_key, unit_name) DO UPDATE SET quantidade = EXCLUDED.quantidade;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_divisao_automatica_contrato_item(VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_divisao_automatica_contrato_item(VARCHAR, VARCHAR) TO service_role;

-- Gatilho no vínculo: vínculo novo ou quantidade mudou (fonte ou ajuste).
CREATE OR REPLACE FUNCTION public.trg_divisao_auto_do_vinculo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.aplicar_divisao_automatica_contrato_item(NEW.item_key, NEW.contract_key);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_divisao_auto_do_vinculo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_divisao_auto_do_vinculo ON public.arp_item_contract_links;
CREATE TRIGGER trg_divisao_auto_do_vinculo
  AFTER INSERT OR UPDATE OF quantidade_contratada_api, quantidade_ajustada ON public.arp_item_contract_links
  FOR EACH ROW EXECUTE FUNCTION public.trg_divisao_auto_do_vinculo();

-- Gatilho nas alocações: unidade entrou, saiu ou mudou de nome no item.
CREATE OR REPLACE FUNCTION public.trg_divisao_auto_das_alocacoes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item  VARCHAR(100);
  v_link  RECORD;
BEGIN
  FOR v_item IN
    SELECT DISTINCT k FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.item_key END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.item_key END
    ]) AS k WHERE k IS NOT NULL
  LOOP
    FOR v_link IN SELECT l.contract_key FROM public.arp_item_contract_links l WHERE l.item_key = v_item LOOP
      PERFORM public.aplicar_divisao_automatica_contrato_item(v_item, v_link.contract_key);
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_divisao_auto_das_alocacoes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_divisao_auto_das_alocacoes ON public.arp_allocations;
CREATE TRIGGER trg_divisao_auto_das_alocacoes
  AFTER INSERT OR DELETE OR UPDATE OF item_key, unit_name ON public.arp_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_divisao_auto_das_alocacoes();

-- ------------------------------------------------------------------------------
-- 4) Ajustar e desfazer a quantidade contratada (gestor e coordenador)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_quantidade_contratada(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_quantidade NUMERIC,
  p_justificativa TEXT,
  p_quantidade_vista NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(150) := btrim(COALESCE(p_contract_key, ''));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_link RECORD;
  v_atual NUMERIC(18, 4);
  v_nome VARCHAR(150);
BEGIN
  IF NOT public.has_permission('contracts.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor e o coordenador ajustam a quantidade contratada.'
      USING ERRCODE = '42501';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade < 0 OR p_quantidade <> trunc(p_quantidade) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: Informe a quantidade como número inteiro, zero ou maior.'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_just) < 15 OR length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: A justificativa é obrigatória, com 15 a 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_link
    FROM public.arp_item_contract_links
   WHERE item_key = v_item_key AND contract_key = v_contract_key
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: O contrato não está vinculado a este item.'
      USING ERRCODE = 'P0002';
  END IF;

  v_atual := COALESCE(v_link.quantidade_ajustada, v_link.quantidade_contratada_api);
  IF p_quantidade_vista IS NOT NULL AND v_atual IS DISTINCT FROM p_quantidade_vista THEN
    RAISE EXCEPTION 'STALE: A quantidade deste contrato mudou desde que a tela foi aberta (agora %). Feche e abra de novo.', v_atual
      USING ERRCODE = '40001';
  END IF;

  IF v_link.quantidade_ajustada IS NOT NULL AND v_link.quantidade_ajustada = p_quantidade THEN
    RAISE EXCEPTION 'NO_CHANGE: A quantidade ajustada já é %.', p_quantidade
      USING ERRCODE = '22023';
  END IF;

  v_nome := COALESCE(public.nome_do_usuario_logado(), 'Usuário');

  UPDATE public.arp_item_contract_links
     SET quantidade_ajustada = p_quantidade,
         ajuste_justificativa = v_just,
         ajuste_quantidade_fonte = quantidade_contratada_api,
         ajustado_por_user_id = auth.uid(),
         ajustado_por_nome = v_nome,
         ajustado_em = NOW(),
         updated_at = NOW()
   WHERE id = v_link.id;

  INSERT INTO public.contrato_item_quantidade_ajustes (
    item_key, contract_key, acao, quantidade_anterior, quantidade_ajustada, quantidade_fonte,
    justificativa, feito_por_user_id, feito_por_nome
  ) VALUES (
    v_item_key, v_contract_key, 'AJUSTE', v_atual, p_quantidade, v_link.quantidade_contratada_api,
    v_just, auth.uid(), v_nome
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'quantidade_anterior', v_atual,
    'quantidade_ajustada', p_quantidade,
    'quantidade_fonte', v_link.quantidade_contratada_api
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ajustar_quantidade_contratada(VARCHAR, VARCHAR, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_quantidade_contratada(VARCHAR, VARCHAR, NUMERIC, TEXT, NUMERIC) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.desfazer_ajuste_quantidade_contratada(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(150) := btrim(COALESCE(p_contract_key, ''));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_link RECORD;
BEGIN
  IF NOT public.has_permission('contracts.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor e o coordenador ajustam a quantidade contratada.'
      USING ERRCODE = '42501';
  END IF;

  IF length(v_just) < 15 OR length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: A justificativa é obrigatória, com 15 a 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_link
    FROM public.arp_item_contract_links
   WHERE item_key = v_item_key AND contract_key = v_contract_key
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: O contrato não está vinculado a este item.'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_link.quantidade_ajustada IS NULL THEN
    RAISE EXCEPTION 'NO_CHANGE: A quantidade deste contrato não está ajustada.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.arp_item_contract_links
     SET quantidade_ajustada = NULL,
         ajuste_justificativa = NULL,
         ajuste_quantidade_fonte = NULL,
         ajustado_por_user_id = NULL,
         ajustado_por_nome = NULL,
         ajustado_em = NULL,
         updated_at = NOW()
   WHERE id = v_link.id;

  INSERT INTO public.contrato_item_quantidade_ajustes (
    item_key, contract_key, acao, quantidade_anterior, quantidade_ajustada, quantidade_fonte,
    justificativa, feito_por_user_id, feito_por_nome
  ) VALUES (
    v_item_key, v_contract_key, 'DESFAZER', v_link.quantidade_ajustada, NULL, v_link.quantidade_contratada_api,
    v_just, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário')
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'quantidade_anterior', v_link.quantidade_ajustada,
    'quantidade_fonte', v_link.quantidade_contratada_api
  );
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_ajuste_quantidade_contratada(VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_ajuste_quantidade_contratada(VARCHAR, VARCHAR, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5) Dividir e desfazer a divisão do contrato entre as unidades (gestor e coordenador)
-- ------------------------------------------------------------------------------
-- p_unidades: [{ "unidade": "DFNSP", "quantidade": 50 }, ...]. Só unidades alocadas no item, inteiros > 0,
-- sem repetir unidade. A soma não passa da quantidade usada do contrato; o que faltar fica "sem unidade".
-- Cada unidade só recebe até o livre dela no item (alocado − contratado nos outros contratos).
-- p_quantidade_vista: a quantidade do contrato que a tela mostrou (trava contra mudança no meio).
CREATE OR REPLACE FUNCTION public.dividir_contrato_nas_unidades(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_unidades JSONB,
  p_quantidade_vista NUMERIC,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(150) := btrim(COALESCE(p_contract_key, ''));
  v_obs TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_link RECORD;
  v_qtd NUMERIC(18, 4);
  v_elem JSONB;
  v_sigla_in TEXT;
  v_sigla VARCHAR(50);
  v_q NUMERIC;
  v_alocado NUMERIC(18, 4);
  v_outros NUMERIC(18, 4);
  v_soma NUMERIC(18, 4) := 0;
  v_vistas TEXT[] := ARRAY[]::TEXT[];
  v_parcelas JSONB := '[]'::JSONB;
BEGIN
  IF NOT public.has_permission('allocations.link_empenho') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor e o coordenador dividem o contrato entre as unidades internas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_unidades IS NULL OR jsonb_typeof(p_unidades) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a lista de unidades com a quantidade de cada uma.'
      USING ERRCODE = '22023';
  END IF;

  IF v_obs IS NOT NULL AND length(v_obs) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A observação tem no máximo 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_link
    FROM public.arp_item_contract_links
   WHERE item_key = v_item_key AND contract_key = v_contract_key
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: O contrato não está vinculado a este item.'
      USING ERRCODE = 'P0002';
  END IF;

  v_qtd := COALESCE(v_link.quantidade_ajustada, v_link.quantidade_contratada_api);
  IF v_qtd IS NULL OR v_qtd <= 0 THEN
    RAISE EXCEPTION 'SEM_QUANTIDADE: O contrato ainda não tem quantidade neste item. Ajuste a quantidade contratada primeiro.'
      USING ERRCODE = '22023';
  END IF;
  IF p_quantidade_vista IS DISTINCT FROM v_qtd THEN
    RAISE EXCEPTION 'STALE: A quantidade deste contrato mudou desde que a tela foi aberta (agora %). Feche e abra de novo.', v_qtd
      USING ERRCODE = '40001';
  END IF;

  -- Trava as alocações do item enquanto confere o livre de cada unidade (a mesma linha que
  -- save_allocations_atomic trava).
  PERFORM 1 FROM public.item_allocation_state WHERE item_key = v_item_key FOR UPDATE;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_unidades) LOOP
    v_sigla_in := upper(btrim(COALESCE(v_elem->>'unidade', '')));
    IF v_sigla_in = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Toda parcela precisa da unidade interna.'
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_q := (v_elem->>'quantidade')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_q := NULL;
    END;
    IF v_q IS NULL OR v_q < 0 OR v_q <> trunc(v_q) THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de % deve ser um número inteiro.', v_sigla_in
        USING ERRCODE = '22023';
    END IF;
    IF v_sigla_in = ANY (v_vistas) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A unidade % aparece mais de uma vez.', v_sigla_in
        USING ERRCODE = '22023';
    END IF;
    v_vistas := v_vistas || v_sigla_in;
    CONTINUE WHEN v_q = 0;

    SELECT a.unit_name, a.allocated_qty INTO v_sigla, v_alocado
      FROM public.arp_allocations a
     WHERE a.item_key = v_item_key AND upper(btrim(a.unit_name)) = v_sigla_in
     LIMIT 1;
    IF v_sigla IS NULL THEN
      RAISE EXCEPTION 'SEM_ALOCACAO: A unidade % não tem alocação neste item. Aloque primeiro.', v_sigla_in
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(u.quantidade), 0) INTO v_outros
      FROM public.contrato_item_divisao_unidades u
     WHERE u.item_key = v_item_key AND u.unit_name = v_sigla AND u.contract_key <> v_contract_key;
    IF v_outros + v_q > v_alocado THEN
      RAISE EXCEPTION 'NAO_CABE: A unidade % tem % alocados e % já contratados em outros contratos; cabem no máximo %.',
        v_sigla, v_alocado, v_outros, GREATEST(v_alocado - v_outros, 0)
        USING ERRCODE = '23514';
    END IF;

    v_soma := v_soma + v_q;
    v_parcelas := v_parcelas || jsonb_build_array(jsonb_build_object('unidade', v_sigla, 'quantidade', v_q));
    v_sigla := NULL;
  END LOOP;

  IF jsonb_array_length(v_parcelas) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a quantidade de ao menos uma unidade. Para tirar a divisão, use desfazer.'
      USING ERRCODE = '22023';
  END IF;
  IF v_soma > v_qtd THEN
    RAISE EXCEPTION 'ACIMA_DO_CONTRATO: A soma das unidades (%) passa da quantidade do contrato neste item (%).', v_soma, v_qtd
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.contrato_item_divisoes (
    item_key, contract_key, origem, quantidade_contrato, dividido_por_user_id, dividido_por_nome, dividido_em, observacao
  ) VALUES (
    v_item_key, v_contract_key, 'USUARIO', v_qtd, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'), NOW(), v_obs
  )
  ON CONFLICT (item_key, contract_key) DO UPDATE
    SET origem = 'USUARIO',
        quantidade_contrato = EXCLUDED.quantidade_contrato,
        dividido_por_user_id = EXCLUDED.dividido_por_user_id,
        dividido_por_nome = EXCLUDED.dividido_por_nome,
        dividido_em = EXCLUDED.dividido_em,
        observacao = EXCLUDED.observacao;

  DELETE FROM public.contrato_item_divisao_unidades
   WHERE item_key = v_item_key AND contract_key = v_contract_key;
  INSERT INTO public.contrato_item_divisao_unidades (item_key, contract_key, unit_name, quantidade)
  SELECT v_item_key, v_contract_key, p->>'unidade', (p->>'quantidade')::NUMERIC
    FROM jsonb_array_elements(v_parcelas) AS p;

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'quantidade_contrato', v_qtd,
    'dividido', v_soma,
    'sem_unidade', v_qtd - v_soma,
    'unidades', v_parcelas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dividir_contrato_nas_unidades(VARCHAR, VARCHAR, JSONB, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dividir_contrato_nas_unidades(VARCHAR, VARCHAR, JSONB, NUMERIC, TEXT) TO authenticated, service_role;

-- Desfazer volta o contrato para "sem unidade" e deixa a automação decidir de novo (item de uma unidade só).
CREATE OR REPLACE FUNCTION public.desfazer_divisao_contrato_unidades(p_item_key VARCHAR, p_contract_key VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(150) := btrim(COALESCE(p_contract_key, ''));
  v_n INTEGER;
BEGIN
  IF NOT public.has_permission('allocations.link_empenho') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor e o coordenador dividem o contrato entre as unidades internas.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.contrato_item_divisoes
   WHERE item_key = v_item_key AND contract_key = v_contract_key;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'NOT_FOUND: Este contrato não está dividido entre unidades neste item.'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.aplicar_divisao_automatica_contrato_item(v_item_key, v_contract_key);

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'automatica', EXISTS (SELECT 1 FROM public.contrato_item_divisoes
                           WHERE item_key = v_item_key AND contract_key = v_contract_key)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_divisao_contrato_unidades(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_divisao_contrato_unidades(VARCHAR, VARCHAR) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6) Leitura
-- ------------------------------------------------------------------------------
-- Uma linha por vínculo contrato ↔ item. fonte: de onde veio a leitura dos itens do contrato
-- (CONTRATOS_GOV, COMPRAS_GOV ou NULL = a leitura não trouxe itens). Situação da divisão:
--   SEM_QUANTIDADE  sem quantidade usada (nem fonte nem ajuste);
--   SEM_DIVISAO     nenhuma unidade recebeu parte do contrato;
--   PARCIAL         parte do contrato ainda sem unidade;
--   DIVIDIDA        o contrato inteiro está nas unidades (ou a quantidade é zero);
--   CONFERIR        soma acima da quantidade, unidade sem alocação no item, ou divisão do gestor feita
--                   sobre outra quantidade.
CREATE OR REPLACE VIEW public.v_arp_item_contrato_quantidade
WITH (security_invoker = true)
AS
WITH partes AS (
  SELECT
    u.item_key,
    u.contract_key,
    sum(u.quantidade) AS dividido,
    bool_or(a.unit_name IS NULL) AS unidade_sem_alocacao,
    jsonb_agg(jsonb_build_object('unidade', u.unit_name, 'quantidade', u.quantidade, 'alocada', a.unit_name IS NOT NULL)
              ORDER BY u.unit_name) AS unidades
  FROM public.contrato_item_divisao_unidades u
  LEFT JOIN public.arp_allocations a ON a.item_key = u.item_key AND a.unit_name = u.unit_name
  GROUP BY u.item_key, u.contract_key
),
base AS (
  SELECT
    l.id AS vinculo_id,
    l.item_key,
    l.contract_key,
    l.origem AS origem_vinculo,
    l.quantidade_contratada_api AS quantidade_fonte,
    l.quantidade_lida_em,
    r.fonte,
    r.lido_em AS fonte_lida_em,
    l.quantidade_ajustada,
    COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api) AS quantidade_contratada,
    (l.quantidade_ajustada IS NOT NULL) AS ajustada,
    l.ajuste_justificativa,
    l.ajuste_quantidade_fonte,
    l.ajustado_por_nome,
    l.ajustado_em,
    (l.quantidade_ajustada IS NOT NULL AND l.ajuste_quantidade_fonte IS DISTINCT FROM l.quantidade_contratada_api) AS fonte_mudou_apos_ajuste,
    d.origem AS divisao_origem,
    d.quantidade_contrato AS divisao_quantidade_base,
    d.dividido_por_nome,
    d.dividido_em,
    COALESCE(p.dividido, 0) AS quantidade_dividida,
    COALESCE(p.unidade_sem_alocacao, false) AS unidade_sem_alocacao,
    COALESCE(p.unidades, '[]'::JSONB) AS unidades
  FROM public.arp_item_contract_links l
  LEFT JOIN public.itens_contrato_leituras r ON r.contract_key = l.contract_key
  LEFT JOIN public.contrato_item_divisoes d ON d.item_key = l.item_key AND d.contract_key = l.contract_key
  LEFT JOIN partes p ON p.item_key = l.item_key AND p.contract_key = l.contract_key
)
SELECT
  b.*,
  GREATEST(COALESCE(b.quantidade_contratada, 0) - b.quantidade_dividida, 0) AS quantidade_sem_unidade,
  CASE
    WHEN b.quantidade_contratada IS NULL THEN 'SEM_QUANTIDADE'
    WHEN b.quantidade_dividida > b.quantidade_contratada
      OR b.unidade_sem_alocacao
      OR (b.divisao_origem = 'USUARIO' AND b.divisao_quantidade_base IS DISTINCT FROM b.quantidade_contratada) THEN 'CONFERIR'
    WHEN b.quantidade_dividida = 0 AND b.quantidade_contratada > 0 THEN 'SEM_DIVISAO'
    WHEN b.quantidade_dividida < b.quantidade_contratada THEN 'PARCIAL'
    ELSE 'DIVIDIDA'
  END AS situacao_divisao
FROM base b;

COMMENT ON VIEW public.v_arp_item_contrato_quantidade IS
  'Vínculo contrato ↔ item: quantidade da fonte (e de onde veio), ajuste do gestor, quantidade usada no saldo (quantidade_contratada) e a divisão entre as unidades internas com a situação.';

-- Uma linha por item × unidade (alocada ou presente numa divisão): alocado, contratado e livre.
CREATE OR REPLACE VIEW public.v_arp_item_unidade_contratado
WITH (security_invoker = true)
AS
WITH contratado AS (
  SELECT item_key, unit_name, sum(quantidade) AS quantidade_contratada, count(*) AS total_contratos
    FROM public.contrato_item_divisao_unidades
   GROUP BY item_key, unit_name
)
SELECT
  COALESCE(a.item_key, c.item_key) AS item_key,
  COALESCE(a.unit_name, c.unit_name) AS unit_name,
  a.id AS allocation_id,
  a.allocated_qty AS quantidade_alocada,
  COALESCE(c.quantidade_contratada, 0) AS quantidade_contratada,
  COALESCE(c.total_contratos, 0) AS total_contratos,
  CASE WHEN a.id IS NULL THEN NULL ELSE a.allocated_qty - COALESCE(c.quantidade_contratada, 0) END AS quantidade_livre,
  (a.id IS NULL OR COALESCE(c.quantidade_contratada, 0) > a.allocated_qty) AS acima_do_alocado
FROM public.arp_allocations a
FULL OUTER JOIN contratado c ON c.item_key = a.item_key AND c.unit_name = a.unit_name;

COMMENT ON VIEW public.v_arp_item_unidade_contratado IS
  'Por item e unidade interna: alocado, contratado (soma das divisões dos contratos) e livre para contratar. acima_do_alocado = contratado maior que o alocado ou unidade sem alocação.';

REVOKE ALL ON public.v_arp_item_contrato_quantidade, public.v_arp_item_unidade_contratado FROM PUBLIC, anon;
GRANT SELECT ON public.v_arp_item_contrato_quantidade, public.v_arp_item_unidade_contratado TO authenticated, service_role;

-- Saldo do item: consumo passa a usar a quantidade usada do contrato (ajustada ou da fonte).
-- Mesmas colunas da migration 99, na mesma ordem; novas ao final.
CREATE OR REPLACE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
WITH empenhado_agg AS (
  -- Notas com parte vinculada ao item, em cada contrato ligado a ele (migration 94).
  SELECT item_key, sum(notas)::bigint AS total_empenhos_vinculados
    FROM public.v_arp_item_contrato_empenhado
   GROUP BY item_key
),
contratos_agg AS (
  SELECT
    item_key,
    COALESCE(SUM(quantidade_contratada), 0) AS total_contratado,
    COUNT(*) AS total_contratos_vinculados,
    COUNT(*) FILTER (WHERE quantidade_contratada IS NULL) AS total_contratos_sem_quantidade,
    COUNT(*) FILTER (WHERE ajustada) AS total_contratos_ajustados,
    COALESCE(SUM(quantidade_sem_unidade), 0) AS quantidade_contratada_sem_unidade,
    COUNT(*) FILTER (WHERE situacao_divisao = 'CONFERIR' OR fonte_mudou_apos_ajuste) AS total_contratos_a_conferir
  FROM public.v_arp_item_contrato_quantidade
  GROUP BY item_key
),
itens_canonical AS (
  SELECT
    i.id AS item_ata_id,
    i.ata_id,
    a.numero_ata,
    a.codigo_uasg,
    i.numero_item,
    (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::text, 5, '0')) AS canonical_item_key,
    i.descricao_item,
    i.fornecedor_razao_social,
    i.fornecedor_cnpj_cpf,
    COALESCE(i.quantidade_homologada, 0) AS quantidade_homologada,
    i.quantidade_senasp,
    i.valor_unitario
  FROM public.itens_ata i
  JOIN public.atas_registro_preco a ON a.id = i.ata_id
),
base AS (
  SELECT
    COALESCE(ic.canonical_item_key, ca.item_key) AS item_key,
    ic.item_ata_id,
    ic.ata_id,
    COALESCE(ic.numero_ata, split_part(ca.item_key, '-', 1)) AS numero_ata,
    COALESCE(ic.codigo_uasg, split_part(ca.item_key, '-', 2)) AS codigo_uasg,
    COALESCE(ic.numero_item, split_part(ca.item_key, '-', 3)) AS numero_item,
    ic.descricao_item,
    ic.fornecedor_razao_social,
    ic.fornecedor_cnpj_cpf,
    ic.valor_unitario,
    COALESCE(ic.quantidade_homologada, 0) AS quantidade_homologada,
    ic.quantidade_senasp,
    COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0) AS quantidade_base_senasp,
    COALESCE(ca.total_contratado, 0) AS quantidade_consumida,
    COALESCE(ca.total_contratos_vinculados, 0) AS total_contratos_vinculados,
    COALESCE(ca.total_contratos_sem_quantidade, 0) AS total_contratos_sem_quantidade,
    COALESCE(ca.total_contratos_ajustados, 0) AS total_contratos_ajustados,
    COALESCE(ca.quantidade_contratada_sem_unidade, 0) AS quantidade_contratada_sem_unidade,
    COALESCE(ca.total_contratos_a_conferir, 0) AS total_contratos_a_conferir
  FROM itens_canonical ic
  FULL OUTER JOIN contratos_agg ca ON ca.item_key = ic.canonical_item_key
)
SELECT
  b.item_key,
  b.item_ata_id,
  b.ata_id,
  b.numero_ata,
  b.codigo_uasg,
  b.numero_item,
  b.descricao_item,
  b.fornecedor_razao_social,
  b.fornecedor_cnpj_cpf,
  b.valor_unitario,
  b.quantidade_homologada,
  b.quantidade_consumida,
  (b.quantidade_base_senasp - b.quantidade_consumida) AS saldo_disponivel,
  CASE
    WHEN b.quantidade_base_senasp > 0 THEN ROUND((b.quantidade_consumida / b.quantidade_base_senasp) * 100, 2)
    ELSE 0
  END AS percentual_consumido,
  COALESCE(e.total_empenhos_vinculados, 0) AS total_empenhos_vinculados,
  b.total_contratos_vinculados,
  b.total_contratos_sem_quantidade,
  b.quantidade_senasp,
  b.quantidade_base_senasp,
  b.total_contratos_ajustados,
  b.quantidade_contratada_sem_unidade,
  b.total_contratos_a_conferir
FROM base b
LEFT JOIN empenhado_agg e ON e.item_key = b.item_key;

COMMENT ON VIEW public.v_arp_item_saldo_detalhado IS
  'Read Model do saldo físico do item da Ata. Base = quantitativo SENASP (quantidade_senasp; homologado da ata enquanto não sincronizado); consumo = soma das quantidades contratadas dos contratos vinculados (ajustada pelo gestor ou, sem ajuste, a da fonte); saldo = base - consumo. quantidade_homologada é o total da ata (referência). total_empenhos_vinculados = notas com parte vinculada ao item nos contratos ligados (migration 94). Colunas da migration 103: contratos ajustados, contratado ainda sem unidade interna e contratos a conferir.';

-- ------------------------------------------------------------------------------
-- 7) Carga inicial: divisão automática dos vínculos existentes
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_l RECORD;
BEGIN
  FOR v_l IN SELECT item_key, contract_key FROM public.arp_item_contract_links LOOP
    PERFORM public.aplicar_divisao_automatica_contrato_item(v_l.item_key, v_l.contract_key);
  END LOOP;
END $$;
