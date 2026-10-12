-- ==============================================================================
-- MIGRATION 104: QUANTIDADE DA NOTA DE EMPENHO INFORMADA PELO GESTOR, POR ITEM DO CONTRATO
-- Versão: 20261009000104_quantidade_informada_nota_item.sql
--
-- Contexto (protótipo aprovado em 08-09/10/2026: https://claude.ai/artifact/UjGbGgXwaSi6HRZPMNuSkC):
-- na migration 94 a quantidade da nota em cada item era a parcela em R$ ÷ preço unitário do item. O gestor
-- precisa dizer a quantidade direto (ex.: locação deu 4,78 un); o valor da nota não importa para isso.
--
-- O que entra
-- 1) contrato_empenho_itens ganha quantidade_informada (inteira, > 0), com quem e quando informou. A
--    parcela em R$ passa a ser opcional: o vínculo por quantidade (vários itens) não reparte o valor.
--    Quantidade usada = a informada, senão parcela ÷ preço unitário (como antes).
-- 2) Distribuição automática (contrato de um item): quando o valor da nota muda, atualiza a parcela no
--    lugar, sem apagar a quantidade informada. Se havia quantidade informada, o valor de referência
--    (valor_nota da distribuição) fica o antigo, para a tela avisar "confira as quantidades".
-- 3) RPCs (só gestor e coordenador, como a distribuição):
--    informar_quantidade_empenho_item   grava ou limpa a quantidade de uma nota em um item;
--    vincular_empenho_aos_itens         vincula a nota aos itens por quantidade (substitui o vínculo
--                                       anterior; contrato de um item continua automático);
--    conferir_quantidades_empenho       o gestor confirma as quantidades depois que o valor da nota mudou.
--    distribuir_empenho_nos_itens (por valor) continua no banco, mas a tela deixa de usar.
-- 4) Leitura:
--    v_contrato_empenho_distribuicao: a nota vinculada conta (DISTRIBUIDA) mesmo se o valor dela mudou
--      depois; o aviso fica em motivo_revisao = 'VALOR_MUDOU'. REVISAR só para item fora do contrato.
--      As parcelas trazem quantidade_informada.
--    v_contrato_itens_execucao: quantidade_empenhada usa a informada; nova coluna parcelas_sem_quantidade.
--
-- O que não muda: v_arp_item_contrato_empenhado, v_arp_item_saldo_detalhado (leem as views acima),
-- empenho_links (unidade interna) e a sincronização.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Quantidade informada na parcela
-- ------------------------------------------------------------------------------
ALTER TABLE public.contrato_empenho_itens
  ADD COLUMN IF NOT EXISTS quantidade_informada   NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS informada_por_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS informada_por_nome     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS informada_em           TIMESTAMPTZ;

ALTER TABLE public.contrato_empenho_itens ALTER COLUMN valor DROP NOT NULL;
ALTER TABLE public.contrato_empenho_itens DROP CONSTRAINT IF EXISTS contrato_empenho_itens_valor;
ALTER TABLE public.contrato_empenho_itens ADD CONSTRAINT contrato_empenho_itens_valor CHECK (valor IS NULL OR valor > 0);

ALTER TABLE public.contrato_empenho_itens DROP CONSTRAINT IF EXISTS contrato_empenho_itens_quantidade;
ALTER TABLE public.contrato_empenho_itens ADD CONSTRAINT contrato_empenho_itens_quantidade CHECK (
  quantidade_informada IS NULL
  OR (
    quantidade_informada > 0
    AND quantidade_informada = trunc(quantidade_informada)
    AND informada_por_nome IS NOT NULL
    AND informada_em IS NOT NULL
  )
);

-- A parcela precisa dizer alguma coisa: o valor (para calcular) ou a quantidade.
ALTER TABLE public.contrato_empenho_itens DROP CONSTRAINT IF EXISTS contrato_empenho_itens_valor_ou_quantidade;
ALTER TABLE public.contrato_empenho_itens ADD CONSTRAINT contrato_empenho_itens_valor_ou_quantidade CHECK (
  valor IS NOT NULL OR quantidade_informada IS NOT NULL
);

CREATE INDEX IF NOT EXISTS contrato_empenho_itens_informada_por_idx
  ON public.contrato_empenho_itens (informada_por_user_id) WHERE informada_por_user_id IS NOT NULL;

COMMENT ON COLUMN public.contrato_empenho_itens.valor IS
  'Parte da NE em R$ neste item. NULL quando o gestor vinculou só por quantidade a mais de um item.';
COMMENT ON COLUMN public.contrato_empenho_itens.quantidade_informada IS
  'Quantidade da NE neste item informada pelo gestor (inteira). NULL = usa valor ÷ preço unitário do item. A automação nunca apaga.';
COMMENT ON COLUMN public.contrato_empenho_distribuicoes.valor_nota IS
  'Valor da NE quando o vínculo aos itens foi feito ou as quantidades foram conferidas. Diferente do atual = a tela pede para conferir as quantidades (a nota continua contando).';

-- ------------------------------------------------------------------------------
-- 2) Distribuição automática: não apaga a quantidade informada
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
  v_parcelas     INTEGER;
  v_parcela      public.contrato_empenho_itens%ROWTYPE;
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

  IF v_tem_dist THEN
    SELECT count(*) INTO v_parcelas FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id;
    SELECT * INTO v_parcela FROM public.contrato_empenho_itens
     WHERE contrato_empenho_id = p_contrato_empenho_id AND numero_item = v_item;

    -- Mesma parcela no mesmo item: atualiza no lugar, sem perder a quantidade informada.
    IF v_parcelas = 1 AND FOUND THEN
      -- Já está igual: não regrava (evita auditoria a cada sincronização).
      IF v_parcela.valor = v_valor THEN RETURN; END IF;

      UPDATE public.contrato_empenho_itens
         SET valor = v_valor
       WHERE contrato_empenho_id = p_contrato_empenho_id AND numero_item = v_item;

      -- Sem quantidade informada a quantidade acompanha o valor; com ela, o valor antigo fica de
      -- referência e a tela pede para conferir.
      IF v_parcela.quantidade_informada IS NULL THEN
        UPDATE public.contrato_empenho_distribuicoes
           SET valor_nota = v_valor, distribuido_em = NOW()
         WHERE contrato_empenho_id = p_contrato_empenho_id;
      END IF;
      RETURN;
    END IF;
  END IF;

  -- Sem distribuição, ou o item do contrato mudou: refaz do zero.
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
  'Contrato com um único item numerado: põe 100% da NE nesse item (origem AUTO). Não toca distribuição do gestor nem a quantidade informada.';

REVOKE ALL ON FUNCTION public.aplicar_distribuicao_automatica(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3) RPCs do gestor
-- ------------------------------------------------------------------------------
-- Valida uma quantidade vinda da tela: inteira, maior que zero e com teto de sanidade.
CREATE OR REPLACE FUNCTION public.quantidade_informada_valida(p_quantidade NUMERIC, p_numero_item INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_quantidade IS NULL OR p_quantidade <= 0 OR p_quantidade <> trunc(p_quantidade) THEN
    RAISE EXCEPTION 'INVALID_VALUE: A quantidade do item % precisa ser um número inteiro maior que zero.', p_numero_item
      USING ERRCODE = '22023';
  END IF;
  IF p_quantidade > 1000000000 THEN
    RAISE EXCEPTION 'INVALID_VALUE: A quantidade do item % passa do limite.', p_numero_item
      USING ERRCODE = '22023';
  END IF;
  RETURN p_quantidade;
END;
$$;

REVOKE ALL ON FUNCTION public.quantidade_informada_valida(NUMERIC, INTEGER) FROM PUBLIC, anon, authenticated;

-- p_quantidade NULL = volta a usar a quantidade calculada pelo valor.
CREATE OR REPLACE FUNCTION public.informar_quantidade_empenho_item(
  p_contrato_empenho_id UUID,
  p_numero_item INTEGER,
  p_quantidade NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_numero  VARCHAR(50);
  v_valor   NUMERIC(18, 4);
  v_parcela public.contrato_empenho_itens%ROWTYPE;
  v_qtd     NUMERIC(18, 4);
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador informa a quantidade da nota no item.'
      USING ERRCODE = '42501';
  END IF;

  IF p_contrato_empenho_id IS NULL OR p_numero_item IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a nota e o item.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('distribuir_empenho:' || p_contrato_empenho_id::TEXT));

  SELECT e.numero_oficial, COALESCE(ce.valor_vinculado, e.valor_empenhado, 0)
    INTO v_numero, v_valor
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   WHERE ce.id = p_contrato_empenho_id
     FOR UPDATE OF ce;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VINCULO_NAO_ENCONTRADO: Este empenho não está mais vinculado ao contrato.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT p.* INTO v_parcela
    FROM public.contrato_empenho_itens p
   WHERE p.contrato_empenho_id = p_contrato_empenho_id AND p.numero_item = p_numero_item
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_VINCULADA_AO_ITEM: A nota % não está vinculada ao item %. Vincule a nota aos itens primeiro.', v_numero, p_numero_item
      USING ERRCODE = 'P0002';
  END IF;

  IF p_quantidade IS NULL THEN
    IF v_parcela.valor IS NULL THEN
      RAISE EXCEPTION 'SEM_CALCULO: A nota % foi vinculada ao item % só pela quantidade; informe uma quantidade.', v_numero, p_numero_item
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.contrato_empenho_itens
       SET quantidade_informada = NULL, informada_por_user_id = NULL, informada_por_nome = NULL, informada_em = NULL
     WHERE contrato_empenho_id = p_contrato_empenho_id AND numero_item = p_numero_item;
  ELSE
    v_qtd := public.quantidade_informada_valida(p_quantidade, p_numero_item);
    UPDATE public.contrato_empenho_itens
       SET quantidade_informada = v_qtd,
           informada_por_user_id = auth.uid(),
           informada_por_nome = COALESCE(public.nome_do_usuario_logado(), 'Usuário'),
           informada_em = NOW()
     WHERE contrato_empenho_id = p_contrato_empenho_id AND numero_item = p_numero_item;
  END IF;

  -- Mexer na quantidade é conferir: o valor atual vira a referência e o aviso "valor mudou" some.
  IF v_valor > 0 THEN
    UPDATE public.contrato_empenho_distribuicoes
       SET valor_nota = v_valor
     WHERE contrato_empenho_id = p_contrato_empenho_id AND valor_nota <> v_valor;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contrato_empenho_id', p_contrato_empenho_id,
    'numero_empenho', v_numero,
    'numero_item', p_numero_item,
    'quantidade_informada', v_qtd
  );
END;
$$;

COMMENT ON FUNCTION public.informar_quantidade_empenho_item(UUID, INTEGER, NUMERIC) IS
  'O gestor informa a quantidade da NE em um item do contrato (inteira); NULL volta à calculada pelo valor.';

-- p_itens: [{ "numero_item": 1, "quantidade": 16 }, ...]
CREATE OR REPLACE FUNCTION public.vincular_empenho_aos_itens(
  p_contrato_empenho_id UUID,
  p_itens JSONB,
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
  v_origem       VARCHAR(10);
  v_elem         JSONB;
  v_item         INTEGER;
  v_vistos       INTEGER[] := ARRAY[]::INTEGER[];
  v_qtds         NUMERIC[] := ARRAY[]::NUMERIC[];
  v_obs          TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_nome         VARCHAR(150);
  i              INTEGER;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador vincula empenhos aos itens.'
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
    RAISE EXCEPTION 'SEM_VALOR: O empenho % está com valor zero e não tem o que vincular.', v_numero
      USING ERRCODE = '22023';
  END IF;

  SELECT origem INTO v_origem FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
  IF v_origem = 'AUTO' THEN
    RAISE EXCEPTION 'AUTOMATICA: Contrato de um item só: a nota já está no item. Ajuste a quantidade direto na nota.'
      USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT numero_item) INTO v_itens
    FROM public.itens_contrato
   WHERE contract_key = v_contract_key AND numero_item IS NOT NULL;
  IF COALESCE(cardinality(v_itens), 0) = 0 THEN
    RAISE EXCEPTION 'SEM_ITENS: O contrato % não tem itens numerados na fonte; não há onde vincular.', v_contract_key
      USING ERRCODE = '22023';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a quantidade em pelo menos um item.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 itens por vínculo.'
      USING ERRCODE = '22023';
  END IF;

  IF v_obs IS NOT NULL AND length(v_obs) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A observação passa de 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_elem IN SELECT valor FROM jsonb_array_elements(p_itens) AS t(valor) LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR jsonb_typeof(v_elem->'numero_item') <> 'number'
       OR jsonb_typeof(v_elem->'quantidade') <> 'number' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Cada item precisa de numero_item e quantidade numéricos.'
        USING ERRCODE = '22023';
    END IF;
    IF (v_elem->>'numero_item')::NUMERIC <> trunc((v_elem->>'numero_item')::NUMERIC) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Número de item inválido (%).', v_elem->>'numero_item'
        USING ERRCODE = '22023';
    END IF;
    v_item := (v_elem->>'numero_item')::NUMERIC::INTEGER;
    IF NOT (v_item = ANY (v_itens)) THEN
      RAISE EXCEPTION 'ITEM_FORA_DO_CONTRATO: O item % não está no contrato %.', v_item, v_contract_key
        USING ERRCODE = '22023';
    END IF;
    IF v_item = ANY (v_vistos) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O item % aparece mais de uma vez.', v_item
        USING ERRCODE = '22023';
    END IF;
    v_vistos := array_append(v_vistos, v_item);
    v_qtds := array_append(v_qtds, public.quantidade_informada_valida((v_elem->>'quantidade')::NUMERIC, v_item));
  END LOOP;

  v_nome := COALESCE(public.nome_do_usuario_logado(), 'Usuário');

  INSERT INTO public.contrato_empenho_distribuicoes (
    contrato_empenho_id, contract_key, empenho_id, origem, valor_nota,
    distribuido_por_user_id, distribuido_por_nome, distribuido_em, observacao
  ) VALUES (
    p_contrato_empenho_id, v_contract_key, v_empenho_id, 'USUARIO', v_valor,
    auth.uid(), v_nome, NOW(), v_obs
  )
  ON CONFLICT (contrato_empenho_id) DO UPDATE
    SET origem = 'USUARIO',
        valor_nota = EXCLUDED.valor_nota,
        distribuido_por_user_id = EXCLUDED.distribuido_por_user_id,
        distribuido_por_nome = EXCLUDED.distribuido_por_nome,
        distribuido_em = EXCLUDED.distribuido_em,
        observacao = EXCLUDED.observacao;

  DELETE FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id;
  FOR i IN 1 .. cardinality(v_vistos) LOOP
    INSERT INTO public.contrato_empenho_itens (
      contrato_empenho_id, numero_item, valor,
      quantidade_informada, informada_por_user_id, informada_por_nome, informada_em
    ) VALUES (
      p_contrato_empenho_id, v_vistos[i],
      -- Nota inteira em um item só: o valor é certo. Em vários itens o valor não é repartido.
      CASE WHEN cardinality(v_vistos) = 1 THEN v_valor END,
      v_qtds[i], auth.uid(), v_nome, NOW()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'contrato_empenho_id', p_contrato_empenho_id,
    'numero_empenho', v_numero,
    'itens', cardinality(v_vistos)
  );
END;
$$;

COMMENT ON FUNCTION public.vincular_empenho_aos_itens(UUID, JSONB, TEXT) IS
  'O gestor vincula a NE aos itens do contrato informando a quantidade de cada um; substitui o vínculo anterior.';

CREATE OR REPLACE FUNCTION public.conferir_quantidades_empenho(p_contrato_empenho_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valor NUMERIC(18, 4);
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador confere as quantidades da nota.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('distribuir_empenho:' || COALESCE(p_contrato_empenho_id::TEXT, '')));

  SELECT COALESCE(ce.valor_vinculado, e.valor_empenhado, 0) INTO v_valor
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   WHERE ce.id = p_contrato_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VINCULO_NAO_ENCONTRADO: Este empenho não está mais vinculado ao contrato.'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'SEM_VALOR: A nota está com valor zero.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.contrato_empenho_distribuicoes SET valor_nota = v_valor WHERE contrato_empenho_id = p_contrato_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_DISTRIBUIDO: Esta nota ainda não foi vinculada aos itens.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'contrato_empenho_id', p_contrato_empenho_id);
END;
$$;

COMMENT ON FUNCTION public.conferir_quantidades_empenho(UUID) IS
  'O gestor confirma que as quantidades da NE continuam certas depois que o valor dela mudou.';

REVOKE ALL ON FUNCTION public.informar_quantidade_empenho_item(UUID, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_quantidade_empenho_item(UUID, INTEGER, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION public.vincular_empenho_aos_itens(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_empenho_aos_itens(UUID, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.conferir_quantidades_empenho(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferir_quantidades_empenho(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4) Leitura (mesmas colunas, na mesma ordem; novas ao final)
-- ------------------------------------------------------------------------------
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
    jsonb_agg(
      jsonb_build_object('numero_item', p.numero_item, 'valor', p.valor, 'quantidade_informada', p.quantidade_informada)
      ORDER BY p.numero_item
    ) AS lista,
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
    -- Vinculada conta no empenhado mesmo se o valor da nota mudou depois (decisão de 09/10/2026).
    WHEN COALESCE(p.itens_existem, false) THEN 'DISTRIBUIDA'
    ELSE 'REVISAR'
  END AS situacao,
  CASE
    WHEN d.contrato_empenho_id IS NULL OR COALESCE(n.n, 0) = 0 OR b.valor_nota <= 0 THEN NULL
    WHEN NOT COALESCE(p.itens_existem, false) THEN 'ITEM_FORA_DO_CONTRATO'
    WHEN abs(d.valor_nota - b.valor_nota) >= 0.005 THEN 'VALOR_MUDOU'
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
  'Uma linha por NE do contrato: situação do vínculo aos itens (A_DISTRIBUIR, DISTRIBUIDA, REVISAR, SEM_ITENS, SEM_VALOR), parcelas (valor e quantidade informada) e sugestão. VALOR_MUDOU em motivo_revisao é só aviso: a nota continua DISTRIBUIDA.';

CREATE OR REPLACE VIEW public.v_contrato_itens_execucao
WITH (security_invoker = true)
AS
WITH parcelas AS (
  SELECT
    d.contract_key,
    p.numero_item,
    p.valor,
    COALESCE(p.quantidade_informada, CASE WHEN i.valor_unitario > 0 THEN p.valor / i.valor_unitario END) AS quantidade
    FROM public.contrato_empenho_itens p
    JOIN public.v_contrato_empenho_distribuicao d
      ON d.contrato_empenho_id = p.contrato_empenho_id AND d.situacao = 'DISTRIBUIDA'
    LEFT JOIN public.v_contrato_itens_numerados i
      ON i.contract_key = d.contract_key AND i.numero_item = p.numero_item
),
empenhado AS (
  SELECT
    contract_key,
    numero_item,
    sum(valor) AS valor,
    sum(quantidade) AS quantidade,
    count(*) AS notas,
    count(*) FILTER (WHERE quantidade IS NULL) AS sem_quantidade
    FROM parcelas
   GROUP BY contract_key, numero_item
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
  -- Com preço unitário: zero quando não há notas. Sem preço: só as quantidades informadas (nulo se nenhuma).
  CASE WHEN i.valor_unitario > 0 THEN COALESCE(x.quantidade, 0) ELSE x.quantidade END AS quantidade_empenhada,
  COALESCE(x.notas, 0) AS notas,
  COALESCE(x.sem_quantidade, 0) AS parcelas_sem_quantidade
FROM public.v_contrato_itens_numerados i
LEFT JOIN empenhado x ON x.contract_key = i.contract_key AND x.numero_item = i.numero_item;

COMMENT ON VIEW public.v_contrato_itens_execucao IS
  'Por item do contrato: contratado e empenhado (notas vinculadas). quantidade_empenhada usa a quantidade informada pelo gestor, senão valor ÷ preço unitário.';

REVOKE ALL ON public.v_contrato_empenho_distribuicao, public.v_contrato_itens_execucao FROM anon;
GRANT SELECT ON public.v_contrato_empenho_distribuicao, public.v_contrato_itens_execucao TO authenticated;
