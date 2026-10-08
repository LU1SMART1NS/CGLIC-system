-- ==============================================================================
-- MIGRATION 94: DISTRIBUIÇÃO DA NOTA DE EMPENHO ENTRE OS ITENS DO CONTRATO
-- Versão: 20261008000094_distribuicao_empenho_itens_contrato.sql
--
-- Contexto (análise e protótipo aprovados em 07-08/10/2026): o sistema só sabia que a NE é do contrato
-- (contrato_empenhos). O vínculo com o item vinha de arp_item_empenhos, uma cópia montada no navegador
-- que punha toda NE do contrato em todos os itens da ata ligados a ele. Nenhuma fonte aberta diz o item
-- da NE: a lista do Contratos.gov.br não traz item, e a minuta exige token. Medido em 07/10/2026:
-- 629 contratos com NE; 392 têm um item só (1.132 NEs), 177 têm dois ou mais (550 NEs) e 60 não têm
-- itens na fonte (408 NEs).
--
-- O que entra
-- 1) contrato_empenho_distribuicoes (uma por vínculo NE × contrato) e contrato_empenho_itens (as
--    parcelas: quanto da NE vai para cada item do contrato, pelo número do item da compra). A parcela
--    aponta para o número do item, nunca para a posição, porque os itens do contrato são regravados a
--    cada sincronização. Apagar o vínculo NE × contrato apaga a distribuição junto.
-- 2) Distribuição automática (origem AUTO): contrato com um único item numerado recebe 100% da NE
--    nesse item, sem clique. Roda por gatilho quando a NE entra no contrato ou muda de valor e quando os
--    itens do contrato são regravados. Distribuição feita pelo gestor (USUARIO) nunca é tocada pela
--    automação. Em contrato com vários itens a automação não decide nada.
-- 3) distribuir_empenho_nos_itens: o gestor reparte a NE por valor. Só grava se a soma das parcelas
--    for igual ao valor da NE e se o valor que a tela mostrou ainda é o atual.
--    desfazer_distribuicao_empenho: volta a NE para a fila.
-- 4) Leitura:
--    v_contrato_empenho_distribuicao  uma linha por NE do contrato, com a situação (A_DISTRIBUIR,
--                                     DISTRIBUIDA, REVISAR, SEM_ITENS, SEM_VALOR) e a sugestão;
--    v_contrato_itens_execucao        por item do contrato: contratado × empenhado;
--    v_arp_item_contrato_empenhado    por item da ata e contrato ligado: o empenhado do item.
--    Só conta como empenhado a parcela de NE com situação DISTRIBUIDA: assim, em cada contrato,
--    empenhado nos itens + valor ainda a distribuir = empenhado do contrato.
--
-- O que não muda: contrato_empenhos, arp_item_empenhos e v_arp_item_saldo_detalhado. A tela do Item
-- passa a ler v_arp_item_contrato_empenhado em uma entrega à parte, que também aposenta a cópia por item.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Tabelas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_empenho_distribuicoes (
  contrato_empenho_id      UUID PRIMARY KEY REFERENCES public.contrato_empenhos(id) ON DELETE CASCADE,
  contract_key             VARCHAR(150) NOT NULL,
  empenho_id               UUID NOT NULL REFERENCES public.empenhos(id) ON DELETE CASCADE,
  origem                   VARCHAR(10) NOT NULL,
  valor_nota               NUMERIC(18, 4) NOT NULL,   -- valor da NE quando foi distribuída
  distribuido_por_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  distribuido_por_nome     VARCHAR(150),
  distribuido_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observacao               TEXT,
  CONSTRAINT contrato_empenho_distribuicoes_origem CHECK (origem IN ('AUTO', 'USUARIO')),
  CONSTRAINT contrato_empenho_distribuicoes_valor CHECK (valor_nota > 0),
  CONSTRAINT contrato_empenho_distribuicoes_obs CHECK (observacao IS NULL OR length(observacao) <= 500),
  CONSTRAINT contrato_empenho_distribuicoes_autor CHECK (origem = 'AUTO' OR distribuido_por_nome IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS contrato_empenho_distribuicoes_contract_idx
  ON public.contrato_empenho_distribuicoes (contract_key);
CREATE INDEX IF NOT EXISTS contrato_empenho_distribuicoes_empenho_idx
  ON public.contrato_empenho_distribuicoes (empenho_id);
CREATE INDEX IF NOT EXISTS contrato_empenho_distribuicoes_autor_idx
  ON public.contrato_empenho_distribuicoes (distribuido_por_user_id) WHERE distribuido_por_user_id IS NOT NULL;

COMMENT ON TABLE public.contrato_empenho_distribuicoes IS
  'Distribuição de uma NE do contrato entre os itens dele. AUTO = contrato de um item só (servidor); USUARIO = repartida pelo gestor.';
COMMENT ON COLUMN public.contrato_empenho_distribuicoes.valor_nota IS
  'Valor da NE no momento da distribuição. Se a NE mudar de valor depois, a distribuição do gestor fica para revisar.';

CREATE TABLE IF NOT EXISTS public.contrato_empenho_itens (
  contrato_empenho_id  UUID NOT NULL REFERENCES public.contrato_empenho_distribuicoes(contrato_empenho_id) ON DELETE CASCADE,
  numero_item          INTEGER NOT NULL,               -- número do item da compra (itens_contrato.numero_item)
  valor                NUMERIC(18, 4) NOT NULL,
  PRIMARY KEY (contrato_empenho_id, numero_item),
  CONSTRAINT contrato_empenho_itens_valor CHECK (valor > 0)
);

COMMENT ON TABLE public.contrato_empenho_itens IS
  'Parcelas da distribuição: quanto da NE vai para cada item do contrato, pelo número do item da compra.';

ALTER TABLE public.contrato_empenho_distribuicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_empenho_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contrato_empenho_distribuicoes" ON public.contrato_empenho_distribuicoes;
CREATE POLICY "Authenticated Read: contrato_empenho_distribuicoes"
  ON public.contrato_empenho_distribuicoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: contrato_empenho_itens" ON public.contrato_empenho_itens;
CREATE POLICY "Authenticated Read: contrato_empenho_itens"
  ON public.contrato_empenho_itens FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_empenho_distribuicoes FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_empenho_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contrato_empenho_distribuicoes, public.contrato_empenho_itens TO authenticated;

-- Auditoria: a distribuição anterior fica em audit_logs quando o gestor refaz ou desfaz.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_contrato_empenho_distribuicoes ON public.contrato_empenho_distribuicoes;
    CREATE TRIGGER trg_audit_contrato_empenho_distribuicoes
      AFTER INSERT OR UPDATE OR DELETE ON public.contrato_empenho_distribuicoes
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
    DROP TRIGGER IF EXISTS trg_audit_contrato_empenho_itens ON public.contrato_empenho_itens;
    CREATE TRIGGER trg_audit_contrato_empenho_itens
      AFTER INSERT OR UPDATE OR DELETE ON public.contrato_empenho_itens
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Distribuição automática (contrato de um item só)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_distribuicao_automatica(p_contrato_empenho_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150);
  v_empenho_id   UUID;
  v_valor        NUMERIC(18, 4);
  v_itens        INTEGER[];
  v_item         INTEGER;
  v_dist         public.contrato_empenho_distribuicoes%ROWTYPE;
  v_tem_dist     BOOLEAN;
BEGIN
  SELECT ce.contract_key, ce.empenho_id, COALESCE(ce.valor_vinculado, e.valor_empenhado, 0)
    INTO v_contract_key, v_empenho_id, v_valor
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   WHERE ce.id = p_contrato_empenho_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT array_agg(DISTINCT numero_item ORDER BY numero_item) INTO v_itens
    FROM public.itens_contrato
   WHERE contract_key = v_contract_key AND numero_item IS NOT NULL;

  -- Contrato com vários itens (ou nenhum): a automação não decide nada.
  IF COALESCE(cardinality(v_itens), 0) <> 1 THEN RETURN; END IF;
  v_item := v_itens[1];

  SELECT * INTO v_dist FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
  v_tem_dist := FOUND;

  -- O que o gestor decidiu não é sobrescrito.
  IF v_tem_dist AND v_dist.origem = 'USUARIO' THEN RETURN; END IF;

  -- NE anulada (valor zero): não há o que distribuir.
  IF v_valor <= 0 THEN
    IF v_tem_dist THEN
      DELETE FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
    END IF;
    RETURN;
  END IF;

  -- Já está igual: não regrava (evita auditoria a cada sincronização).
  IF v_tem_dist
     AND v_dist.valor_nota = v_valor
     AND (SELECT count(*) FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id) = 1
     AND EXISTS (SELECT 1 FROM public.contrato_empenho_itens
                  WHERE contrato_empenho_id = p_contrato_empenho_id AND numero_item = v_item AND valor = v_valor) THEN
    RETURN;
  END IF;

  INSERT INTO public.contrato_empenho_distribuicoes (
    contrato_empenho_id, contract_key, empenho_id, origem, valor_nota, distribuido_em
  ) VALUES (
    p_contrato_empenho_id, v_contract_key, v_empenho_id, 'AUTO', v_valor, NOW()
  )
  ON CONFLICT (contrato_empenho_id) DO UPDATE
    SET valor_nota = EXCLUDED.valor_nota,
        distribuido_em = EXCLUDED.distribuido_em;

  DELETE FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id;
  INSERT INTO public.contrato_empenho_itens (contrato_empenho_id, numero_item, valor)
  VALUES (p_contrato_empenho_id, v_item, v_valor);
END;
$$;

COMMENT ON FUNCTION public.aplicar_distribuicao_automatica(UUID) IS
  'Contrato com um único item numerado: põe 100% da NE nesse item (origem AUTO). Não toca distribuição do gestor.';

CREATE OR REPLACE FUNCTION public.aplicar_distribuicao_automatica_do_contrato(p_contract_key VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_n  INTEGER := 0;
BEGIN
  FOR v_id IN SELECT id FROM public.contrato_empenhos WHERE contract_key = p_contract_key LOOP
    PERFORM public.aplicar_distribuicao_automatica(v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_distribuicao_automatica(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_distribuicao_automatica_do_contrato(VARCHAR) FROM PUBLIC, anon, authenticated;

-- Gatilho 1: NE entra no contrato ou muda de valor.
CREATE OR REPLACE FUNCTION public.trg_contrato_empenhos_distribuicao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.aplicar_distribuicao_automatica(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_contrato_empenhos_distribuicao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contrato_empenhos_distribuicao ON public.contrato_empenhos;
CREATE TRIGGER trg_contrato_empenhos_distribuicao
  AFTER INSERT OR UPDATE OF valor_vinculado ON public.contrato_empenhos
  FOR EACH ROW EXECUTE FUNCTION public.trg_contrato_empenhos_distribuicao();

-- Gatilho 2: itens do contrato regravados (gravar_itens_contratos apaga e insere os itens de cada contrato).
CREATE OR REPLACE FUNCTION public.trg_itens_contrato_distribuicao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(150);
BEGIN
  FOR v_key IN SELECT DISTINCT contract_key FROM novos LOOP
    PERFORM public.aplicar_distribuicao_automatica_do_contrato(v_key);
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_itens_contrato_distribuicao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_itens_contrato_distribuicao ON public.itens_contrato;
CREATE TRIGGER trg_itens_contrato_distribuicao
  AFTER INSERT ON public.itens_contrato
  REFERENCING NEW TABLE AS novos
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_itens_contrato_distribuicao();

-- ------------------------------------------------------------------------------
-- 3) Distribuição pelo gestor
-- ------------------------------------------------------------------------------
-- p_parcelas: [{ "numero_item": 43, "valor": 1197000.00 }, ...]
-- p_valor_nota: o valor da NE que a tela mostrou; se a NE mudou de valor nesse meio-tempo, recusa.
CREATE OR REPLACE FUNCTION public.distribuir_empenho_nos_itens(
  p_contrato_empenho_id UUID,
  p_parcelas JSONB,
  p_valor_nota NUMERIC,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150);
  v_empenho_id   UUID;
  v_numero       VARCHAR(50);
  v_valor        NUMERIC(18, 4);
  v_itens        INTEGER[];
  v_elem         JSONB;
  v_item         INTEGER;
  v_parcela      NUMERIC(18, 4);
  v_vistos       INTEGER[] := ARRAY[]::INTEGER[];
  v_soma         NUMERIC(18, 4) := 0;
  v_obs          TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador distribui empenhos entre os itens.'
      USING ERRCODE = '42501';
  END IF;

  IF p_contrato_empenho_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o vínculo do empenho com o contrato.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('distribuir_empenho:' || p_contrato_empenho_id::TEXT));

  SELECT ce.contract_key, ce.empenho_id, e.numero_oficial, COALESCE(ce.valor_vinculado, e.valor_empenhado, 0)
    INTO v_contract_key, v_empenho_id, v_numero, v_valor
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   WHERE ce.id = p_contrato_empenho_id
     FOR UPDATE OF ce;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VINCULO_NAO_ENCONTRADO: Este empenho não está mais vinculado ao contrato.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'SEM_VALOR: O empenho % está com valor zero e não tem o que distribuir.', v_numero
      USING ERRCODE = '22023';
  END IF;

  IF p_valor_nota IS NULL OR abs(p_valor_nota - v_valor) >= 0.005 THEN
    RAISE EXCEPTION 'VALOR_MUDOU: O valor do empenho % agora é %. Abra de novo e distribua o valor atual.', v_numero, v_valor
      USING ERRCODE = '40001';
  END IF;

  SELECT array_agg(DISTINCT numero_item) INTO v_itens
    FROM public.itens_contrato
   WHERE contract_key = v_contract_key AND numero_item IS NOT NULL;
  IF COALESCE(cardinality(v_itens), 0) = 0 THEN
    RAISE EXCEPTION 'SEM_ITENS: O contrato % não tem itens numerados na fonte; não há onde distribuir.', v_contract_key
      USING ERRCODE = '22023';
  END IF;

  IF p_parcelas IS NULL OR jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe ao menos um item com valor.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_parcelas) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 itens por distribuição.'
      USING ERRCODE = '22023';
  END IF;

  IF v_obs IS NOT NULL AND length(v_obs) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A observação passa de 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_elem IN SELECT valor FROM jsonb_array_elements(p_parcelas) AS t(valor) LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR jsonb_typeof(v_elem->'numero_item') <> 'number'
       OR jsonb_typeof(v_elem->'valor') <> 'number' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Cada parcela precisa de numero_item e valor numéricos.'
        USING ERRCODE = '22023';
    END IF;
    IF (v_elem->>'numero_item')::NUMERIC <> trunc((v_elem->>'numero_item')::NUMERIC) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Número de item inválido (%).', v_elem->>'numero_item'
        USING ERRCODE = '22023';
    END IF;
    v_item := (v_elem->>'numero_item')::NUMERIC::INTEGER;
    v_parcela := (v_elem->>'valor')::NUMERIC;
    IF NOT (v_item = ANY (v_itens)) THEN
      RAISE EXCEPTION 'ITEM_FORA_DO_CONTRATO: O item % não está no contrato %.', v_item, v_contract_key
        USING ERRCODE = '22023';
    END IF;
    IF v_item = ANY (v_vistos) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O item % aparece mais de uma vez.', v_item
        USING ERRCODE = '22023';
    END IF;
    IF v_parcela <= 0 THEN
      RAISE EXCEPTION 'INVALID_VALUE: O valor do item % precisa ser maior que zero.', v_item
        USING ERRCODE = '22023';
    END IF;
    v_vistos := array_append(v_vistos, v_item);
    v_soma := v_soma + v_parcela;
  END LOOP;

  IF abs(v_soma - v_valor) >= 0.005 THEN
    RAISE EXCEPTION 'SOMA_DIFERENTE: Os itens somam % e o empenho % vale %.', v_soma, v_numero, v_valor
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.contrato_empenho_distribuicoes (
    contrato_empenho_id, contract_key, empenho_id, origem, valor_nota,
    distribuido_por_user_id, distribuido_por_nome, distribuido_em, observacao
  ) VALUES (
    p_contrato_empenho_id, v_contract_key, v_empenho_id, 'USUARIO', v_valor,
    auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'), NOW(), v_obs
  )
  ON CONFLICT (contrato_empenho_id) DO UPDATE
    SET origem = 'USUARIO',
        valor_nota = EXCLUDED.valor_nota,
        distribuido_por_user_id = EXCLUDED.distribuido_por_user_id,
        distribuido_por_nome = EXCLUDED.distribuido_por_nome,
        distribuido_em = EXCLUDED.distribuido_em,
        observacao = EXCLUDED.observacao;

  DELETE FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id;
  INSERT INTO public.contrato_empenho_itens (contrato_empenho_id, numero_item, valor)
  SELECT p_contrato_empenho_id, (e.valor->>'numero_item')::NUMERIC::INTEGER, (e.valor->>'valor')::NUMERIC
    FROM jsonb_array_elements(p_parcelas) AS e(valor);

  RETURN jsonb_build_object(
    'success', true,
    'contrato_empenho_id', p_contrato_empenho_id,
    'numero_empenho', v_numero,
    'itens', cardinality(v_vistos),
    'valor', v_valor
  );
END;
$$;

COMMENT ON FUNCTION public.distribuir_empenho_nos_itens(UUID, JSONB, NUMERIC, TEXT) IS
  'O gestor reparte a NE entre os itens do contrato. A soma tem de ser igual ao valor da NE; substitui a distribuição anterior.';

CREATE OR REPLACE FUNCTION public.desfazer_distribuicao_empenho(p_contrato_empenho_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origem VARCHAR(10);
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador desfaz a distribuição de empenhos.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('distribuir_empenho:' || COALESCE(p_contrato_empenho_id::TEXT, '')));

  SELECT origem INTO v_origem FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_DISTRIBUIDO: Este empenho não tem distribuição para desfazer.'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_origem = 'AUTO' THEN
    RAISE EXCEPTION 'AUTOMATICA: Contrato de um item só: o empenho vai inteiro para o item, não há o que desfazer.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
  -- Contrato que hoje tem um item só volta a ter a distribuição automática.
  PERFORM public.aplicar_distribuicao_automatica(p_contrato_empenho_id);

  RETURN jsonb_build_object('success', true, 'contrato_empenho_id', p_contrato_empenho_id);
END;
$$;

REVOKE ALL ON FUNCTION public.distribuir_empenho_nos_itens(UUID, JSONB, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_empenho_nos_itens(UUID, JSONB, NUMERIC, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.desfazer_distribuicao_empenho(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_distribuicao_empenho(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4) Leitura
-- ------------------------------------------------------------------------------
-- Itens do contrato agrupados pelo número do item (um contrato pode repetir o número em duas linhas).
-- O preço unitário só vale quando todas as linhas do número têm o mesmo preço.
CREATE OR REPLACE VIEW public.v_contrato_itens_numerados
WITH (security_invoker = true)
AS
SELECT
  contract_key,
  numero_item,
  min(descricao) AS descricao,
  min(tipo) AS tipo,
  sum(quantidade) AS quantidade,
  CASE WHEN count(DISTINCT valor_unitario) = 1 AND count(valor_unitario) = count(*) THEN max(valor_unitario) END AS valor_unitario,
  sum(valor_total) AS valor_total
FROM public.itens_contrato
WHERE numero_item IS NOT NULL
GROUP BY contract_key, numero_item;

CREATE OR REPLACE VIEW public.v_contrato_empenho_distribuicao
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    ce.id AS contrato_empenho_id,
    ce.contract_key,
    ce.empenho_id,
    ce.origem AS origem_vinculo,
    e.numero_oficial,
    e.data_emissao,
    e.uasg_emitente,
    COALESCE(ce.valor_vinculado, e.valor_empenhado, 0) AS valor_nota
  FROM public.contrato_empenhos ce
  JOIN public.empenhos e ON e.id = ce.empenho_id
),
n_itens AS (
  SELECT contract_key, count(*) AS n FROM public.v_contrato_itens_numerados GROUP BY contract_key
),
parcelas AS (
  SELECT
    p.contrato_empenho_id,
    sum(p.valor) AS total,
    jsonb_agg(jsonb_build_object('numero_item', p.numero_item, 'valor', p.valor) ORDER BY p.numero_item) AS lista,
    bool_and(i.numero_item IS NOT NULL) AS itens_existem
  FROM public.contrato_empenho_itens p
  JOIN public.contrato_empenho_distribuicoes d ON d.contrato_empenho_id = p.contrato_empenho_id
  LEFT JOIN public.v_contrato_itens_numerados i ON i.contract_key = d.contract_key AND i.numero_item = p.numero_item
  GROUP BY p.contrato_empenho_id
),
sugestoes AS (
  SELECT
    b.contrato_empenho_id,
    (SELECT jsonb_agg(jsonb_build_object('numero_item', i.numero_item, 'quantidade', i.quantidade) ORDER BY i.numero_item)
       FROM public.v_contrato_itens_numerados i
      WHERE i.contract_key = b.contract_key AND i.valor_total IS NOT NULL AND abs(i.valor_total - b.valor_nota) < 0.005
    ) AS iguais,
    (SELECT jsonb_agg(jsonb_build_object('numero_item', i.numero_item, 'quantidade', round(b.valor_nota / i.valor_unitario)) ORDER BY i.numero_item)
       FROM public.v_contrato_itens_numerados i
      WHERE i.contract_key = b.contract_key
        AND i.valor_unitario > 0
        AND round(b.valor_nota / i.valor_unitario) >= 1
        AND abs(b.valor_nota - round(b.valor_nota / i.valor_unitario) * i.valor_unitario) < 0.005
    ) AS multiplos
  FROM base b
  WHERE b.valor_nota > 0
)
SELECT
  b.contrato_empenho_id,
  b.contract_key,
  b.empenho_id,
  b.origem_vinculo,
  b.numero_oficial,
  b.data_emissao,
  b.uasg_emitente,
  b.valor_nota,
  COALESCE(n.n, 0) AS itens_no_contrato,
  CASE
    WHEN COALESCE(n.n, 0) = 0 THEN 'SEM_ITENS'
    WHEN b.valor_nota <= 0 THEN 'SEM_VALOR'
    WHEN d.contrato_empenho_id IS NULL THEN 'A_DISTRIBUIR'
    WHEN abs(COALESCE(p.total, 0) - b.valor_nota) < 0.005 AND COALESCE(p.itens_existem, false) THEN 'DISTRIBUIDA'
    ELSE 'REVISAR'
  END AS situacao,
  CASE
    WHEN d.contrato_empenho_id IS NULL OR COALESCE(n.n, 0) = 0 OR b.valor_nota <= 0 THEN NULL
    WHEN NOT COALESCE(p.itens_existem, false) THEN 'ITEM_FORA_DO_CONTRATO'
    WHEN abs(COALESCE(p.total, 0) - b.valor_nota) >= 0.005 THEN 'VALOR_MUDOU'
  END AS motivo_revisao,
  d.origem,
  d.valor_nota AS valor_na_distribuicao,
  COALESCE(p.total, 0) AS valor_distribuido,
  COALESCE(p.lista, '[]'::jsonb) AS parcelas,
  d.distribuido_por_nome,
  d.distribuido_em,
  d.observacao,
  CASE
    WHEN COALESCE(n.n, 0) <= 1 OR b.valor_nota <= 0 THEN NULL
    WHEN jsonb_array_length(COALESCE(s.iguais, '[]'::jsonb)) = 1 THEN 'TOTAL_DO_ITEM'
    WHEN jsonb_array_length(COALESCE(s.multiplos, '[]'::jsonb)) = 1 THEN 'MULTIPLO_DO_PRECO'
    WHEN jsonb_array_length(COALESCE(s.multiplos, '[]'::jsonb)) > 1 THEN 'VARIAS_POSSIBILIDADES'
    ELSE 'SEM_SUGESTAO'
  END AS sugestao_tipo,
  CASE
    WHEN COALESCE(n.n, 0) <= 1 OR b.valor_nota <= 0 THEN '[]'::jsonb
    WHEN jsonb_array_length(COALESCE(s.iguais, '[]'::jsonb)) = 1 THEN s.iguais
    ELSE COALESCE(s.multiplos, '[]'::jsonb)
  END AS sugestao
FROM base b
LEFT JOIN n_itens n ON n.contract_key = b.contract_key
LEFT JOIN public.contrato_empenho_distribuicoes d ON d.contrato_empenho_id = b.contrato_empenho_id
LEFT JOIN parcelas p ON p.contrato_empenho_id = b.contrato_empenho_id
LEFT JOIN sugestoes s ON s.contrato_empenho_id = b.contrato_empenho_id;

COMMENT ON VIEW public.v_contrato_empenho_distribuicao IS
  'Uma linha por NE do contrato: situação da distribuição entre os itens (A_DISTRIBUIR, DISTRIBUIDA, REVISAR, SEM_ITENS, SEM_VALOR), parcelas e sugestão pelo valor da NE e os preços dos itens.';

CREATE OR REPLACE VIEW public.v_contrato_itens_execucao
WITH (security_invoker = true)
AS
WITH empenhado AS (
  SELECT d.contract_key, p.numero_item, sum(p.valor) AS valor, count(*) AS notas
    FROM public.contrato_empenho_itens p
    JOIN public.v_contrato_empenho_distribuicao d
      ON d.contrato_empenho_id = p.contrato_empenho_id AND d.situacao = 'DISTRIBUIDA'
   GROUP BY d.contract_key, p.numero_item
)
SELECT
  i.contract_key,
  i.numero_item,
  i.descricao,
  i.tipo,
  i.quantidade,
  i.valor_unitario,
  i.valor_total,
  COALESCE(x.valor, 0) AS valor_empenhado,
  CASE WHEN i.valor_unitario > 0 THEN COALESCE(x.valor, 0) / i.valor_unitario END AS quantidade_empenhada,
  COALESCE(x.notas, 0) AS notas
FROM public.v_contrato_itens_numerados i
LEFT JOIN empenhado x ON x.contract_key = i.contract_key AND x.numero_item = i.numero_item;

COMMENT ON VIEW public.v_contrato_itens_execucao IS
  'Por item do contrato: contratado (quantidade e valor) e empenhado (soma das parcelas de NEs com distribuição fechada).';

CREATE OR REPLACE VIEW public.v_arp_item_contrato_empenhado
WITH (security_invoker = true)
AS
SELECT
  l.item_key,
  l.contract_key,
  x.numero_item,
  x.quantidade AS quantidade_contratada,
  x.valor_unitario,
  x.valor_empenhado,
  x.quantidade_empenhada,
  x.notas
FROM public.arp_item_contract_links l
JOIN public.v_contrato_itens_execucao x
  ON x.contract_key = l.contract_key
 AND x.numero_item = (regexp_match(l.item_key, '-([0-9]{5})$'))[1]::INTEGER;

COMMENT ON VIEW public.v_arp_item_contrato_empenhado IS
  'Empenhado do item da ata em cada contrato ligado a ele: o item do contrato com o mesmo número do item da ata.';

REVOKE ALL ON public.v_contrato_itens_numerados, public.v_contrato_empenho_distribuicao,
  public.v_contrato_itens_execucao, public.v_arp_item_contrato_empenhado FROM anon;
GRANT SELECT ON public.v_contrato_itens_numerados, public.v_contrato_empenho_distribuicao,
  public.v_contrato_itens_execucao, public.v_arp_item_contrato_empenhado TO authenticated;

-- ------------------------------------------------------------------------------
-- 5) Carga inicial: distribuição automática dos contratos de um item só
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_key VARCHAR(150);
BEGIN
  FOR v_key IN SELECT DISTINCT contract_key FROM public.contrato_empenhos LOOP
    PERFORM public.aplicar_distribuicao_automatica_do_contrato(v_key);
  END LOOP;
END $$;
