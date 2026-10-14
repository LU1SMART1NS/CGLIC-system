-- ==============================================================================
-- MIGRATION 118: NOTA DE EMPENHO VINCULADA AO ITEM PELO VALOR, SEM CLIQUE
-- Versão: 20261013000118_vinculo_empenho_item_pelo_valor.sql
--
-- Contexto (pedido do usuário em 13/10/2026, "caminho 1"): nenhuma fonte aberta diz o item da nota
-- (ver migration 94). Em contrato de vários itens a fila já mostra uma sugestão quando o valor da nota é igual
-- ao total de um item ou múltiplo exato do preço de um item; até aqui o gestor precisava aceitar a sugestão.
-- Agora o servidor aplica sozinho a sugestão quando ela é a única explicação possível do valor.
--
-- Regra (todas precisam valer; senão a nota fica na fila como antes):
--   a) contrato com 2 a 50 itens numerados, todos com preço unitário (item sem preço, como serviço, pode
--      receber qualquer valor, então o valor não prova nada);
--   b) exatamente um item explica o valor: total do item igual ao valor da nota, ou valor = preço × quantidade
--      inteira;
--   c) a quantidade não passa da contratada no item;
--   d) o valor não fecha também como soma de dois itens (a × preço de um + b × preço de outro, quantidades
--      inteiras dentro do contratado). Isso barra os preços "redondos", que casam com muitos valores.
--
-- O que entra
-- 1) Origem nova VALOR em contrato_empenho_distribuicoes ("vinculada pelo valor"). A nota vai inteira para o
--    item; a quantidade é a calculada (valor ÷ preço, inteira pela regra). Conta no empenhado como as demais.
-- 2) aplicar_vinculo_pelo_valor: roda pelos mesmos gatilhos da distribuição automática (nota entra ou muda de
--    valor; itens do contrato regravados). Nunca toca vínculo do gestor (USUARIO) nem o AUTO legado. Se o valor
--    da nota muda e a regra deixa de valer, a nota volta para a fila; se o gestor já informou quantidade, fica
--    como está e a tela avisa "confira as quantidades" (como na migration 104).
-- 3) contrato_empenho_vinculo_recusado: quando o gestor desfaz um vínculo (pelo valor ou dele), a automação
--    pelo valor não refaz aquela nota. Contrato que passa a ter um item só continua com a distribuição AUTO.
-- 4) Carga inicial: aplica a regra às notas que hoje estão a vincular.
--
-- O que não muda: as views (a origem é só mais um valor), as RPCs do gestor (vincular sobrescreve VALOR com
-- USUARIO), a sincronização e as proteções da migration 113 (VALOR é automático, como AUTO).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Origem VALOR
-- ------------------------------------------------------------------------------
ALTER TABLE public.contrato_empenho_distribuicoes DROP CONSTRAINT IF EXISTS contrato_empenho_distribuicoes_origem;
ALTER TABLE public.contrato_empenho_distribuicoes
  ADD CONSTRAINT contrato_empenho_distribuicoes_origem CHECK (origem IN ('AUTO', 'VALOR', 'USUARIO'));

ALTER TABLE public.contrato_empenho_distribuicoes DROP CONSTRAINT IF EXISTS contrato_empenho_distribuicoes_autor;
ALTER TABLE public.contrato_empenho_distribuicoes
  ADD CONSTRAINT contrato_empenho_distribuicoes_autor CHECK (origem IN ('AUTO', 'VALOR') OR distribuido_por_nome IS NOT NULL);

COMMENT ON TABLE public.contrato_empenho_distribuicoes IS
  'Vínculo de uma NE do contrato aos itens dele. AUTO = contrato de um item só; VALOR = o valor da nota só se explica por um item (servidor); USUARIO = feito pelo gestor.';

-- ------------------------------------------------------------------------------
-- 2) Recusa do gestor
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_empenho_vinculo_recusado (
  contrato_empenho_id   UUID PRIMARY KEY REFERENCES public.contrato_empenhos(id) ON DELETE CASCADE,
  recusado_por_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recusado_por_nome     VARCHAR(150),
  recusado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contrato_empenho_vinculo_recusado_autor_idx
  ON public.contrato_empenho_vinculo_recusado (recusado_por_user_id) WHERE recusado_por_user_id IS NOT NULL;

COMMENT ON TABLE public.contrato_empenho_vinculo_recusado IS
  'Notas cujo vínculo aos itens o gestor desfez: a automação pelo valor não volta a vinculá-las.';

ALTER TABLE public.contrato_empenho_vinculo_recusado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: contrato_empenho_vinculo_recusado" ON public.contrato_empenho_vinculo_recusado;
CREATE POLICY "Authenticated Read: contrato_empenho_vinculo_recusado"
  ON public.contrato_empenho_vinculo_recusado FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.contrato_empenho_vinculo_recusado FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_empenho_vinculo_recusado FROM authenticated;
GRANT SELECT ON public.contrato_empenho_vinculo_recusado TO authenticated;

-- ------------------------------------------------------------------------------
-- 3) Regra
-- ------------------------------------------------------------------------------
-- Existe a × p + b × q = v com a em [1, a_max] e b em [1, b_max]? (inteiros; equação diofantina, sem laço)
CREATE OR REPLACE FUNCTION public.soma_de_dois_itens_fecha(v NUMERIC, p NUMERIC, a_max NUMERIC, q NUMERIC, b_max NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  -- algoritmo de Euclides estendido: p·x + q·y = g
  r0 NUMERIC := p; r1 NUMERIC := q;
  x0 NUMERIC := 1; x1 NUMERIC := 0;
  y0 NUMERIC := 0; y1 NUMERIC := 1;
  t  NUMERIC; k NUMERIC;
  g NUMERIC; a0 NUMERIC; b0 NUMERIC; passo_a NUMERIC; passo_b NUMERIC;
  k_min NUMERIC; k_max NUMERIC;
BEGIN
  IF v IS NULL OR p IS NULL OR q IS NULL OR p <= 0 OR q <= 0 OR v <= 0 OR a_max < 1 OR b_max < 1 THEN
    RETURN false;
  END IF;
  WHILE r1 <> 0 LOOP
    k := floor(r0 / r1);
    t := r0 - k * r1; r0 := r1; r1 := t;
    t := x0 - k * x1; x0 := x1; x1 := t;
    t := y0 - k * y1; y0 := y1; y1 := t;
  END LOOP;
  g := r0;
  IF mod(v, g) <> 0 THEN RETURN false; END IF;
  a0 := x0 * (v / g);
  b0 := y0 * (v / g);
  passo_a := q / g;   -- a = a0 + k·passo_a
  passo_b := p / g;   -- b = b0 − k·passo_b
  k_min := greatest(ceil((1 - a0) / passo_a), ceil((b0 - b_max) / passo_b));
  k_max := least(floor((a_max - a0) / passo_a), floor((b0 - 1) / passo_b));
  RETURN k_min <= k_max;
END;
$$;

REVOKE ALL ON FUNCTION public.soma_de_dois_itens_fecha(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

-- O item que explica o valor da nota, ou nenhuma linha. regra = TOTAL_DO_ITEM ou MULTIPLO_DO_PRECO.
CREATE OR REPLACE FUNCTION public.item_pelo_valor_da_nota(p_contract_key VARCHAR, p_valor NUMERIC)
RETURNS TABLE (numero_item INTEGER, quantidade NUMERIC, regra TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n          INTEGER;
  v_sem_preco  INTEGER;
  v_cand       RECORD;
  v_qtd_q      INTEGER;
  -- valores em décimos de milésimo (NUMERIC(18,4)) para a conta inteira
  v_v          NUMERIC := round(p_valor * 10000);
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN RETURN; END IF;

  SELECT count(*), count(*) FILTER (WHERE i.valor_unitario IS NULL OR i.valor_unitario <= 0)
    INTO v_n, v_sem_preco
    FROM public.v_contrato_itens_numerados i
   WHERE i.contract_key = p_contract_key;

  -- a) 2 a 50 itens, todos com preço
  IF v_n < 2 OR v_n > 50 OR v_sem_preco > 0 THEN RETURN; END IF;

  -- b) exatamente um item explica o valor
  SELECT count(*) INTO v_qtd_q
    FROM public.v_contrato_itens_numerados i
   WHERE i.contract_key = p_contract_key
     AND (
       (i.valor_total IS NOT NULL AND abs(i.valor_total - p_valor) < 0.005)
       OR (round(p_valor / i.valor_unitario) >= 1 AND abs(p_valor - round(p_valor / i.valor_unitario) * i.valor_unitario) < 0.005)
     );
  IF v_qtd_q <> 1 THEN RETURN; END IF;

  SELECT
    i.numero_item AS n,
    i.quantidade AS contratada,
    CASE
      WHEN i.valor_total IS NOT NULL AND abs(i.valor_total - p_valor) < 0.005 AND i.quantidade IS NOT NULL THEN i.quantidade
      ELSE round(p_valor / i.valor_unitario)
    END AS q,
    CASE WHEN i.valor_total IS NOT NULL AND abs(i.valor_total - p_valor) < 0.005 THEN 'TOTAL_DO_ITEM' ELSE 'MULTIPLO_DO_PRECO' END AS r
    INTO v_cand
    FROM public.v_contrato_itens_numerados i
   WHERE i.contract_key = p_contract_key
     AND (
       (i.valor_total IS NOT NULL AND abs(i.valor_total - p_valor) < 0.005)
       OR (round(p_valor / i.valor_unitario) >= 1 AND abs(p_valor - round(p_valor / i.valor_unitario) * i.valor_unitario) < 0.005)
     );

  -- c) não passa do contratado (e a quantidade é inteira)
  IF v_cand.q IS NULL OR v_cand.q < 1 OR v_cand.q <> trunc(v_cand.q) THEN RETURN; END IF;
  IF v_cand.contratada IS NOT NULL AND v_cand.q > v_cand.contratada + 0.0001 THEN RETURN; END IF;

  -- d) o valor não fecha como soma de dois itens (cada um com quantidade inteira até o contratado)
  IF EXISTS (
    SELECT 1
      FROM public.v_contrato_itens_numerados a
      JOIN public.v_contrato_itens_numerados b
        ON b.contract_key = a.contract_key AND b.numero_item > a.numero_item
     WHERE a.contract_key = p_contract_key
       AND public.soma_de_dois_itens_fecha(
             v_v,
             round(a.valor_unitario * 10000),
             least(floor(p_valor / a.valor_unitario), COALESCE(floor(a.quantidade), floor(p_valor / a.valor_unitario))),
             round(b.valor_unitario * 10000),
             least(floor(p_valor / b.valor_unitario), COALESCE(floor(b.quantidade), floor(p_valor / b.valor_unitario)))
           )
  ) THEN
    RETURN;
  END IF;

  numero_item := v_cand.n;
  quantidade := v_cand.q;
  regra := v_cand.r;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.item_pelo_valor_da_nota(VARCHAR, NUMERIC) IS
  'Item do contrato que é a única explicação do valor da nota (total do item ou preço × quantidade inteira, dentro do contratado, sem soma de dois itens que feche). Sem linha = não dá para afirmar.';

REVOKE ALL ON FUNCTION public.item_pelo_valor_da_nota(VARCHAR, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4) Aplicar a regra a uma nota
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_vinculo_pelo_valor(p_contrato_empenho_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150);
  v_empenho_id   UUID;
  v_valor        NUMERIC(18, 4);
  v_dist         public.contrato_empenho_distribuicoes%ROWTYPE;
  v_tem_dist     BOOLEAN;
  v_item         INTEGER;
  v_qtd          NUMERIC;
  v_regra        TEXT;
  v_obs          TEXT;
BEGIN
  SELECT ce.contract_key, ce.empenho_id, COALESCE(ce.valor_vinculado, e.valor_empenhado, 0)
    INTO v_contract_key, v_empenho_id, v_valor
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   WHERE ce.id = p_contrato_empenho_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_dist FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
  v_tem_dist := FOUND;

  -- Só decide o que é dela: nota sem vínculo, ou vinculada antes pelo valor.
  IF v_tem_dist AND v_dist.origem <> 'VALOR' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.contrato_empenho_vinculo_recusado WHERE contrato_empenho_id = p_contrato_empenho_id) THEN
    RETURN;
  END IF;

  -- O gestor já mexeu na quantidade: não refaz; se o valor mudou, a tela pede para conferir.
  IF v_tem_dist AND EXISTS (
    SELECT 1 FROM public.contrato_empenho_itens
     WHERE contrato_empenho_id = p_contrato_empenho_id AND quantidade_informada IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  SELECT r.numero_item, r.quantidade, r.regra INTO v_item, v_qtd, v_regra
    FROM public.item_pelo_valor_da_nota(v_contract_key, v_valor) r;

  IF v_item IS NULL THEN
    -- O valor deixou de explicar um item só: a nota volta para a fila.
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

  v_obs := CASE v_regra
    WHEN 'TOTAL_DO_ITEM' THEN format('Valor da nota igual ao total do item %s.', v_item)
    ELSE format('Valor da nota = %s × preço unitário do item %s.', v_qtd::BIGINT, v_item)
  END;

  INSERT INTO public.contrato_empenho_distribuicoes (
    contrato_empenho_id, contract_key, empenho_id, origem, valor_nota, distribuido_em, observacao
  ) VALUES (
    p_contrato_empenho_id, v_contract_key, v_empenho_id, 'VALOR', v_valor, NOW(), v_obs
  )
  ON CONFLICT (contrato_empenho_id) DO UPDATE
    SET origem = 'VALOR',
        valor_nota = EXCLUDED.valor_nota,
        distribuido_em = EXCLUDED.distribuido_em,
        observacao = EXCLUDED.observacao,
        distribuido_por_user_id = NULL,
        distribuido_por_nome = NULL;

  DELETE FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id;
  INSERT INTO public.contrato_empenho_itens (contrato_empenho_id, numero_item, valor)
  VALUES (p_contrato_empenho_id, v_item, v_valor);
END;
$$;

COMMENT ON FUNCTION public.aplicar_vinculo_pelo_valor(UUID) IS
  'Contrato de vários itens: vincula a nota inteira ao único item que explica o valor dela (origem VALOR). Não toca vínculo do gestor, AUTO, nota recusada nem quantidade informada.';

REVOKE ALL ON FUNCTION public.aplicar_vinculo_pelo_valor(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5) Distribuição automática: contrato de um item (AUTO) ou de vários (pelo valor)
--    Mesma função da migration 104, com duas mudanças: vários itens chama a regra pelo valor, e um vínculo
--    VALOR de contrato que passou a ter um item só vira AUTO.
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

  -- Contrato de vários itens: só a regra pelo valor decide (e só quando o valor não deixa dúvida).
  IF COALESCE(cardinality(v_itens), 0) >= 2 THEN
    PERFORM public.aplicar_vinculo_pelo_valor(p_contrato_empenho_id);
    RETURN;
  END IF;
  IF COALESCE(cardinality(v_itens), 0) = 0 THEN RETURN; END IF;
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

  -- Vinculada pelo valor quando o contrato tinha vários itens: agora é o caso de um item só.
  IF v_tem_dist AND v_dist.origem = 'VALOR' THEN
    UPDATE public.contrato_empenho_distribuicoes
       SET origem = 'AUTO', observacao = NULL
     WHERE contrato_empenho_id = p_contrato_empenho_id;
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
    SET origem = 'AUTO',
        valor_nota = EXCLUDED.valor_nota,
        distribuido_em = EXCLUDED.distribuido_em,
        observacao = NULL;

  DELETE FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id;
  INSERT INTO public.contrato_empenho_itens (contrato_empenho_id, numero_item, valor)
  VALUES (p_contrato_empenho_id, v_item, v_valor);
END;
$$;

COMMENT ON FUNCTION public.aplicar_distribuicao_automatica(UUID) IS
  'Contrato com um único item numerado: põe 100% da NE nesse item (AUTO). Vários itens: regra pelo valor (VALOR). Não toca vínculo do gestor nem a quantidade informada.';

REVOKE ALL ON FUNCTION public.aplicar_distribuicao_automatica(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6) Desfazer: a nota volta para a fila e a automação pelo valor não a refaz
-- ------------------------------------------------------------------------------
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

  INSERT INTO public.contrato_empenho_vinculo_recusado (contrato_empenho_id, recusado_por_user_id, recusado_por_nome, recusado_em)
  VALUES (p_contrato_empenho_id, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'), NOW())
  ON CONFLICT (contrato_empenho_id) DO UPDATE
    SET recusado_por_user_id = EXCLUDED.recusado_por_user_id,
        recusado_por_nome = EXCLUDED.recusado_por_nome,
        recusado_em = EXCLUDED.recusado_em;

  -- Contrato que hoje tem um item só volta a ter a distribuição automática (a recusa vale só para o valor).
  PERFORM public.aplicar_distribuicao_automatica(p_contrato_empenho_id);
  RETURN jsonb_build_object('success', true, 'contrato_empenho_id', p_contrato_empenho_id, 'origem_desfeita', v_origem);
END;
$$;

COMMENT ON FUNCTION public.desfazer_distribuicao_empenho(UUID) IS
  'Desfaz o vínculo da NE aos itens (do gestor ou pelo valor); a nota volta para a fila e a automação pelo valor não a refaz.';

REVOKE ALL ON FUNCTION public.desfazer_distribuicao_empenho(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_distribuicao_empenho(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7) Carga inicial: notas a vincular hoje
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN
    SELECT ce.id
      FROM public.contrato_empenhos ce
     WHERE NOT EXISTS (SELECT 1 FROM public.contrato_empenho_distribuicoes d WHERE d.contrato_empenho_id = ce.id)
  LOOP
    PERFORM public.aplicar_vinculo_pelo_valor(v_id);
  END LOOP;
END $$;
