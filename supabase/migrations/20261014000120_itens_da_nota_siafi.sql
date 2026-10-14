-- ==============================================================================
-- MIGRATION 120: ITENS DA NOTA DE EMPENHO PELO SIAFI (PORTAL DA TRANSPARÊNCIA)
-- Versão: 20261014000120_itens_da_nota_siafi.sql
--
-- Contexto (caminho 2, protótipo aprovado em 14/10/2026: https://claude.ai/artifact/9H1pH4VYF3S1TxNymwqYRe):
-- o Portal da Transparência (com chave) lista as linhas de cada nota de empenho, com o item da compra
-- ("Item compra: 00032 - …") e o histórico de cada linha (inclusão, reforço, anulação, inscrição em RP) com
-- quantidade e preço. Medição de 14/10/2026 em 735 notas: resolve 335 das 417 notas a vincular e confirma
-- 148 das 158 vinculadas pelo valor; 6 notas do 00043/2026 dizem um item diferente do que a regra escolheu.
--
-- O servidor (recurso itens_notas_siafi) lê o portal, descarta as operações repetidas e grava o resultado
-- líquido de cada linha. O banco decide o vínculo:
--   - contrato com 2 ou mais itens: a nota é vinculada aos itens que ela diz (origem SIAFI), com a quantidade
--     e o valor da nota. Só quando a leitura fecha: toda linha com número do item, quantidade inteira e a
--     soma dos itens igual ao valor da nota (ou à metade: 35 notas da UG 200330 vêm em dobro do Contratos.gov.br);
--   - item da nota fora do contrato: os outros itens contam; a nota vai para conferência;
--   - item da nota com o preço de outro item do contrato (caso 00043/2026): não vincula; conferência;
--   - a leitura não fecha ou não existe: a regra pelo valor (migration 118) fica de reserva, mas nunca
--     escolhe um item que a nota não tem;
--   - vínculo do gestor nunca é trocado; se ele foi feito antes da leitura e difere da nota, conferência;
--   - contrato de um item só continua com a distribuição AUTO (sem mudança);
--   - contrato sem itens: conferência para cadastrar os itens no Contratos.gov.br.
--
-- O que entra
-- 1) empenho_leituras_siafi e empenho_itens_siafi (o que o portal diz de cada nota).
-- 2) Origem SIAFI e quantidade_nota na parcela; as views usam informada → da nota → valor ÷ preço.
-- 3) nota_siafi_no_contrato: compara a nota com os itens do contrato.
-- 4) aplicar_vinculo_pela_nota, chamada pela distribuição automática no lugar da regra pelo valor.
-- 5) gravar_leituras_siafi e notas_para_ler_no_siafi (só o servidor).
-- 6) Quantidade da nota nas views da distribuição; v_empenho_nota_siafi com o que a nota diz.
-- 7) v_empenho_conferencia_nota + correcoes_nota_no_contrato com marcar/desfazer ("Vou corrigir").
-- 8) Agendamento do recurso itens_notas_siafi por UG emitente, em horários alternados (limite do portal).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) O que o portal diz de cada nota
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empenho_leituras_siafi (
  empenho_id        UUID PRIMARY KEY REFERENCES public.empenhos(id) ON DELETE CASCADE,
  codigo_documento  VARCHAR(30)   NOT NULL,           -- UG + gestão 00001 + número da nota
  situacao          VARCHAR(12)   NOT NULL,
  linhas            INTEGER       NOT NULL DEFAULT 0,
  total_siafi       NUMERIC(18, 2),                   -- soma líquida das operações (sem inscrição em RP)
  valor_no_sistema  NUMERIC(18, 4),                   -- empenhos.valor_empenhado na leitura (relê se mudar)
  lido_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT empenho_leituras_siafi_situacao CHECK (situacao IN ('LIDA', 'SEM_LINHAS')),
  CONSTRAINT empenho_leituras_siafi_linhas CHECK (linhas >= 0)
);

CREATE TABLE IF NOT EXISTS public.empenho_itens_siafi (
  empenho_id      UUID    NOT NULL REFERENCES public.empenho_leituras_siafi(empenho_id) ON DELETE CASCADE,
  sequencial      INTEGER NOT NULL,
  numero_item     INTEGER,                -- "Item compra: 00032" → 32; nulo quando a linha não diz
  descricao       TEXT,
  quantidade      NUMERIC(18, 4),         -- líquida: inclusão + reforço − anulação
  valor_unitario  NUMERIC(18, 4),
  valor_total     NUMERIC(18, 2),         -- líquido
  PRIMARY KEY (empenho_id, sequencial)
);

COMMENT ON TABLE public.empenho_leituras_siafi IS
  'Última leitura de cada nota de empenho no Portal da Transparência (SIAFI), feita pelo servidor.';
COMMENT ON TABLE public.empenho_itens_siafi IS
  'Linhas da nota no SIAFI: item da compra, quantidade, preço e valor líquidos (operações repetidas descartadas).';

ALTER TABLE public.empenho_leituras_siafi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empenho_itens_siafi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura para logados: empenho_leituras_siafi" ON public.empenho_leituras_siafi;
CREATE POLICY "Leitura para logados: empenho_leituras_siafi" ON public.empenho_leituras_siafi FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura para logados: empenho_itens_siafi" ON public.empenho_itens_siafi;
CREATE POLICY "Leitura para logados: empenho_itens_siafi" ON public.empenho_itens_siafi FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.empenho_leituras_siafi, public.empenho_itens_siafi FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.empenho_leituras_siafi, public.empenho_itens_siafi FROM authenticated;
GRANT SELECT ON public.empenho_leituras_siafi, public.empenho_itens_siafi TO authenticated;
GRANT ALL ON public.empenho_leituras_siafi, public.empenho_itens_siafi TO service_role;

-- ------------------------------------------------------------------------------
-- 2) Origem SIAFI e quantidade da nota na parcela
-- ------------------------------------------------------------------------------
ALTER TABLE public.contrato_empenho_distribuicoes DROP CONSTRAINT IF EXISTS contrato_empenho_distribuicoes_origem;
ALTER TABLE public.contrato_empenho_distribuicoes
  ADD CONSTRAINT contrato_empenho_distribuicoes_origem CHECK (origem IN ('AUTO', 'VALOR', 'SIAFI', 'USUARIO'));
ALTER TABLE public.contrato_empenho_distribuicoes DROP CONSTRAINT IF EXISTS contrato_empenho_distribuicoes_autor;
ALTER TABLE public.contrato_empenho_distribuicoes
  ADD CONSTRAINT contrato_empenho_distribuicoes_autor CHECK (origem IN ('AUTO', 'VALOR', 'SIAFI') OR distribuido_por_nome IS NOT NULL);

COMMENT ON TABLE public.contrato_empenho_distribuicoes IS
  'Vínculo de uma NE do contrato aos itens dele. AUTO = contrato de um item só; SIAFI = itens e quantidades da nota no SIAFI; VALOR = só um item explica o valor da nota (reserva); USUARIO = feito pelo gestor.';

ALTER TABLE public.contrato_empenho_itens ADD COLUMN IF NOT EXISTS quantidade_nota NUMERIC(18, 4);
ALTER TABLE public.contrato_empenho_itens DROP CONSTRAINT IF EXISTS contrato_empenho_itens_quantidade_nota;
ALTER TABLE public.contrato_empenho_itens
  ADD CONSTRAINT contrato_empenho_itens_quantidade_nota CHECK (quantidade_nota IS NULL OR quantidade_nota > 0);
ALTER TABLE public.contrato_empenho_itens DROP CONSTRAINT IF EXISTS contrato_empenho_itens_valor_ou_quantidade;
ALTER TABLE public.contrato_empenho_itens ADD CONSTRAINT contrato_empenho_itens_valor_ou_quantidade CHECK (
  valor IS NOT NULL OR quantidade_informada IS NOT NULL OR quantidade_nota IS NOT NULL
);

COMMENT ON COLUMN public.contrato_empenho_itens.quantidade_nota IS
  'Quantidade da nota neste item segundo o SIAFI (origem SIAFI). Vale quando o gestor não informou outra.';

-- ------------------------------------------------------------------------------
-- 3) A nota no SIAFI comparada com os itens do contrato
-- ------------------------------------------------------------------------------
-- motivo (quando a leitura não serve para vincular): SEM_LEITURA, NOTA_SEM_ITENS, LINHA_SEM_ITEM,
-- QUANTIDADE_QUEBRADA, SOMA_NAO_FECHA. Divergências com o contrato (itens_fora, outro_preco) não são motivo:
-- a leitura serve, e quem decide o que fazer com elas é aplicar_vinculo_pela_nota e a conferência.
CREATE OR REPLACE FUNCTION public.nota_siafi_no_contrato(p_contrato_empenho_id UUID)
RETURNS TABLE (
  lida            BOOLEAN,
  motivo          TEXT,
  itens           JSONB,      -- [{numero_item, quantidade, valor_unitario, valor_total, descricao, no_contrato}]
  itens_fora      INTEGER[],
  outro_preco     JSONB,      -- [{numero_item, preco_nota, preco_contrato, item_com_esse_preco}]
  preco_diferente BOOLEAN,
  valor_em_dobro  BOOLEAN,
  total_siafi     NUMERIC,
  lido_em         TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150);
  v_empenho_id   UUID;
  v_valor        NUMERIC;
  v_leitura      public.empenho_leituras_siafi%ROWTYPE;
  v_sem_item     INTEGER;
  v_quebradas    INTEGER;
  v_positivos    INTEGER;
BEGIN
  SELECT ce.contract_key, ce.empenho_id, COALESCE(ce.valor_vinculado, e.valor_empenhado, 0)
    INTO v_contract_key, v_empenho_id, v_valor
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   WHERE ce.id = p_contrato_empenho_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_leitura FROM public.empenho_leituras_siafi WHERE empenho_id = v_empenho_id;
  IF NOT FOUND THEN
    lida := FALSE; motivo := 'SEM_LEITURA'; itens := '[]'::jsonb; itens_fora := ARRAY[]::INTEGER[];
    outro_preco := '[]'::jsonb; preco_diferente := FALSE; valor_em_dobro := FALSE;
    RETURN NEXT; RETURN;
  END IF;

  lida := TRUE;
  lido_em := v_leitura.lido_em;
  total_siafi := v_leitura.total_siafi;
  valor_em_dobro := v_leitura.total_siafi > 0 AND abs(v_valor - 2 * v_leitura.total_siafi) <= 1
                    AND abs(v_leitura.total_siafi - v_valor) > 1;

  -- Linhas com algum valor que não dizem o item; itens com quantidade líquida quebrada ou negativa.
  SELECT count(*) INTO v_sem_item FROM public.empenho_itens_siafi s
   WHERE s.empenho_id = v_empenho_id AND s.numero_item IS NULL AND (COALESCE(s.quantidade, 0) <> 0 OR COALESCE(s.valor_total, 0) <> 0);

  WITH por_item AS (
    SELECT s.numero_item, sum(COALESCE(s.quantidade, 0)) AS q
      FROM public.empenho_itens_siafi s
     WHERE s.empenho_id = v_empenho_id AND s.numero_item IS NOT NULL
     GROUP BY s.numero_item
  )
  SELECT count(*) FILTER (WHERE q < 0 OR q <> trunc(q)), count(*) FILTER (WHERE q > 0)
    INTO v_quebradas, v_positivos
    FROM por_item;

  WITH por_item AS (
    SELECT s.numero_item,
           sum(COALESCE(s.quantidade, 0)) AS q,
           sum(COALESCE(s.valor_total, 0)) AS vt,
           min(s.valor_unitario) FILTER (WHERE s.valor_unitario > 0) AS pu,
           min(s.descricao) AS descricao
      FROM public.empenho_itens_siafi s
     WHERE s.empenho_id = v_empenho_id AND s.numero_item IS NOT NULL
     GROUP BY s.numero_item
    HAVING sum(COALESCE(s.quantidade, 0)) <> 0
  ),
  cmp AS (
    SELECT p.*, i.numero_item IS NOT NULL AS no_contrato, i.valor_unitario AS pu_contrato
      FROM por_item p
      LEFT JOIN public.v_contrato_itens_numerados i ON i.contract_key = v_contract_key AND i.numero_item = p.numero_item
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'numero_item', c.numero_item, 'quantidade', c.q, 'valor_unitario', c.pu, 'valor_total', c.vt,
      'descricao', c.descricao, 'no_contrato', c.no_contrato) ORDER BY c.numero_item), '[]'::jsonb),
    COALESCE(array_agg(c.numero_item ORDER BY c.numero_item) FILTER (WHERE NOT c.no_contrato), ARRAY[]::INTEGER[]),
    COALESCE(jsonb_agg(jsonb_build_object(
      'numero_item', c.numero_item, 'preco_nota', c.pu, 'preco_contrato', c.pu_contrato, 'item_com_esse_preco', o.numero_item)
      ORDER BY c.numero_item) FILTER (WHERE o.numero_item IS NOT NULL), '[]'::jsonb),
    COALESCE(bool_or(c.no_contrato AND c.pu IS NOT NULL AND c.pu_contrato IS NOT NULL AND abs(c.pu - c.pu_contrato) > 0.01 AND o.numero_item IS NULL), FALSE)
    INTO itens, itens_fora, outro_preco, preco_diferente
    FROM cmp c
    LEFT JOIN LATERAL (
      -- O preço da nota é o preço de OUTRO item do contrato: número de item trocado entre nota e contrato.
      SELECT j.numero_item FROM public.v_contrato_itens_numerados j
       WHERE c.no_contrato AND c.pu IS NOT NULL AND c.pu_contrato IS NOT NULL AND abs(c.pu - c.pu_contrato) > 0.01
         AND j.contract_key = v_contract_key AND j.numero_item <> c.numero_item AND abs(j.valor_unitario - c.pu) <= 0.01
       ORDER BY j.numero_item LIMIT 1
    ) o ON TRUE;

  motivo := CASE
    WHEN v_leitura.situacao = 'SEM_LINHAS' OR (v_positivos = 0 AND v_sem_item = 0) THEN 'NOTA_SEM_ITENS'
    WHEN v_sem_item > 0 THEN 'LINHA_SEM_ITEM'
    WHEN v_quebradas > 0 THEN 'QUANTIDADE_QUEBRADA'
    WHEN NOT (abs(COALESCE(v_leitura.total_siafi, 0) - v_valor) <= 1 OR valor_em_dobro) THEN 'SOMA_NAO_FECHA'
  END;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.nota_siafi_no_contrato(UUID) IS
  'Compara a nota no SIAFI com os itens do contrato: itens e quantidades da nota, itens fora do contrato, item com o preço de outro item e por que a leitura não serve (motivo).';

REVOKE ALL ON FUNCTION public.nota_siafi_no_contrato(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4) Vínculo pela nota (contrato de vários itens)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_vinculo_pela_nota(p_contrato_empenho_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150);
  v_empenho_id   UUID;
  v_valor        NUMERIC(18, 4);
  v_n_itens      INTEGER;
  v_dist         public.contrato_empenho_distribuicoes%ROWTYPE;
  v_tem_dist     BOOLEAN;
  v_nota         RECORD;
  v_desejadas    JSONB;
  v_atuais       JSONB;
  v_itens_nota   INTEGER[];
  v_candidato    INTEGER;
BEGIN
  SELECT ce.contract_key, ce.empenho_id, COALESCE(ce.valor_vinculado, e.valor_empenhado, 0)
    INTO v_contract_key, v_empenho_id, v_valor
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   WHERE ce.id = p_contrato_empenho_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*) INTO v_n_itens FROM public.v_contrato_itens_numerados WHERE contract_key = v_contract_key;
  IF v_n_itens < 2 THEN RETURN; END IF;

  SELECT * INTO v_dist FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
  v_tem_dist := FOUND;

  -- O que o gestor decidiu não é trocado (se diferir da nota, aparece na conferência).
  IF v_tem_dist AND v_dist.origem IN ('USUARIO', 'AUTO') THEN RETURN; END IF;

  -- O gestor já mexeu na quantidade de um vínculo automático: fica como está.
  IF v_tem_dist AND EXISTS (
    SELECT 1 FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id AND quantidade_informada IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_nota FROM public.nota_siafi_no_contrato(p_contrato_empenho_id);

  IF v_nota.lida AND v_nota.motivo IS NULL AND v_valor > 0 THEN
    -- Itens da nota que estão no contrato.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('numero_item', (x->>'numero_item')::INTEGER,
                                                 'quantidade', (x->>'quantidade')::NUMERIC,
                                                 'valor', (x->>'valor_total')::NUMERIC)
                              ORDER BY (x->>'numero_item')::INTEGER), '[]'::jsonb)
      INTO v_desejadas
      FROM jsonb_array_elements(v_nota.itens) x
     WHERE (x->>'no_contrato')::BOOLEAN AND (x->>'quantidade')::NUMERIC > 0;

    -- Divergência que impede o vínculo: item com o preço de outro, ou nenhum item da nota no contrato.
    IF jsonb_array_length(v_nota.outro_preco) > 0 OR jsonb_array_length(v_desejadas) = 0 THEN
      IF v_tem_dist THEN
        DELETE FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
      END IF;
      RETURN;
    END IF;

    -- Já está igual: não regrava (evita auditoria a cada sincronização).
    IF v_tem_dist AND v_dist.origem = 'SIAFI' AND v_dist.valor_nota = v_valor THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('numero_item', p.numero_item, 'quantidade', p.quantidade_nota, 'valor', p.valor)
                                ORDER BY p.numero_item), '[]'::jsonb)
        INTO v_atuais
        FROM public.contrato_empenho_itens p WHERE p.contrato_empenho_id = p_contrato_empenho_id;
      IF v_atuais = v_desejadas THEN RETURN; END IF;
    END IF;

    INSERT INTO public.contrato_empenho_distribuicoes (
      contrato_empenho_id, contract_key, empenho_id, origem, valor_nota, distribuido_em, observacao
    ) VALUES (
      p_contrato_empenho_id, v_contract_key, v_empenho_id, 'SIAFI', v_valor, NOW(), 'Itens e quantidades da nota no SIAFI.'
    )
    ON CONFLICT (contrato_empenho_id) DO UPDATE
      SET origem = 'SIAFI', valor_nota = EXCLUDED.valor_nota, distribuido_em = EXCLUDED.distribuido_em,
          observacao = EXCLUDED.observacao, distribuido_por_user_id = NULL, distribuido_por_nome = NULL;

    DELETE FROM public.contrato_empenho_itens WHERE contrato_empenho_id = p_contrato_empenho_id;
    INSERT INTO public.contrato_empenho_itens (contrato_empenho_id, numero_item, valor, quantidade_nota)
    SELECT p_contrato_empenho_id, (d->>'numero_item')::INTEGER, NULLIF((d->>'valor')::NUMERIC, 0), (d->>'quantidade')::NUMERIC
      FROM jsonb_array_elements(v_desejadas) d;
    RETURN;
  END IF;

  -- A nota no SIAFI não resolve: um vínculo SIAFI anterior sai, e a regra pelo valor fica de reserva.
  IF v_tem_dist AND v_dist.origem = 'SIAFI' THEN
    DELETE FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
    v_tem_dist := FALSE;
  END IF;

  -- A reserva nunca escolhe um item que a nota não tem (quando a nota diz os itens).
  IF v_nota.lida THEN
    SELECT array_agg((x->>'numero_item')::INTEGER) INTO v_itens_nota FROM jsonb_array_elements(v_nota.itens) x;
    IF COALESCE(cardinality(v_itens_nota), 0) > 0 THEN
      SELECT r.numero_item INTO v_candidato FROM public.item_pelo_valor_da_nota(v_contract_key, v_valor) r;
      IF v_candidato IS NULL OR NOT (v_candidato = ANY (v_itens_nota)) THEN
        IF v_tem_dist AND v_dist.origem = 'VALOR' THEN
          DELETE FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;
        END IF;
        RETURN;
      END IF;
    END IF;
  END IF;

  PERFORM public.aplicar_vinculo_pelo_valor(p_contrato_empenho_id);
END;
$$;

COMMENT ON FUNCTION public.aplicar_vinculo_pela_nota(UUID) IS
  'Contrato de vários itens: vincula a nota aos itens que ela diz no SIAFI (origem SIAFI). Sem leitura que feche, a regra pelo valor fica de reserva. Não toca vínculo do gestor.';

REVOKE ALL ON FUNCTION public.aplicar_vinculo_pela_nota(UUID) FROM PUBLIC, anon, authenticated;

-- Distribuição automática (migration 118) com a nota no lugar da regra pelo valor; vínculo SIAFI de contrato
-- que passou a ter um item só vira AUTO, como o VALOR.
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

  -- Contrato de vários itens: a nota no SIAFI decide; a regra pelo valor fica de reserva.
  IF COALESCE(cardinality(v_itens), 0) >= 2 THEN
    PERFORM public.aplicar_vinculo_pela_nota(p_contrato_empenho_id);
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

  -- Vinculada pela nota ou pelo valor quando o contrato tinha vários itens: agora é o caso de um item só.
  IF v_tem_dist AND v_dist.origem IN ('VALOR', 'SIAFI') THEN
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
      IF v_parcela.valor = v_valor THEN RETURN; END IF;

      UPDATE public.contrato_empenho_itens
         SET valor = v_valor
       WHERE contrato_empenho_id = p_contrato_empenho_id AND numero_item = v_item;

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
  'Contrato com um único item numerado: 100% da NE nesse item (AUTO). Vários itens: itens da nota no SIAFI, com a regra pelo valor de reserva. Não toca vínculo do gestor nem a quantidade informada.';

REVOKE ALL ON FUNCTION public.aplicar_distribuicao_automatica(UUID) FROM PUBLIC, anon, authenticated;

-- Desfazer: o vínculo pela nota não se desfaz (como o AUTO); o gestor edita o vínculo, que passa a ser dele.
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
  IF v_origem = 'SIAFI' THEN
    RAISE EXCEPTION 'PELA_NOTA: A nota foi vinculada aos itens que ela diz no SIAFI. Para mudar, edite o vínculo aos itens.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.contrato_empenho_distribuicoes WHERE contrato_empenho_id = p_contrato_empenho_id;

  INSERT INTO public.contrato_empenho_vinculo_recusado (contrato_empenho_id, recusado_por_user_id, recusado_por_nome, recusado_em)
  VALUES (p_contrato_empenho_id, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'), NOW())
  ON CONFLICT (contrato_empenho_id) DO UPDATE
    SET recusado_por_user_id = EXCLUDED.recusado_por_user_id,
        recusado_por_nome = EXCLUDED.recusado_por_nome,
        recusado_em = EXCLUDED.recusado_em;

  PERFORM public.aplicar_distribuicao_automatica(p_contrato_empenho_id);
  RETURN jsonb_build_object('success', true, 'contrato_empenho_id', p_contrato_empenho_id, 'origem_desfeita', v_origem);
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_distribuicao_empenho(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_distribuicao_empenho(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5) Servidor: o que ler e onde gravar
-- ------------------------------------------------------------------------------
-- Notas da UG emitente em contratos de 2+ itens ou sem itens: nunca lidas, com valor mudado desde a leitura,
-- ou lidas há mais de 30 dias e emitidas nos últimos 2 anos (reforço e anulação mudam as linhas).
CREATE OR REPLACE FUNCTION public.notas_para_ler_no_siafi(p_uasg TEXT, p_limite INTEGER DEFAULT 500)
RETURNS TABLE (empenho_id UUID, numero_oficial VARCHAR, uasg_emitente VARCHAR, motivo TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH n AS (
    SELECT ce.empenho_id, max(COALESCE(x.n, 0)) AS max_itens, min(COALESCE(x.n, 0)) AS min_itens
      FROM public.contrato_empenhos ce
      LEFT JOIN (SELECT contract_key, count(*) AS n FROM public.v_contrato_itens_numerados GROUP BY contract_key) x
        ON x.contract_key = ce.contract_key
     GROUP BY ce.empenho_id
  ),
  alvo AS (
    SELECT e.id, e.numero_oficial, e.uasg_emitente, e.data_emissao, l.lido_em, l.valor_no_sistema, e.valor_empenhado
      FROM public.empenhos e
      JOIN n ON n.empenho_id = e.id
      LEFT JOIN public.empenho_leituras_siafi l ON l.empenho_id = e.id
     WHERE e.uasg_emitente = p_uasg
       AND e.valor_empenhado > 0
       AND (n.max_itens >= 2 OR n.min_itens = 0)
  )
  SELECT a.id, a.numero_oficial, a.uasg_emitente,
         CASE WHEN a.lido_em IS NULL THEN 'NUNCA_LIDA'
              WHEN a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado THEN 'VALOR_MUDOU'
              ELSE 'RELEITURA' END
    FROM alvo a
   WHERE a.lido_em IS NULL
      OR a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado
      OR (a.lido_em < NOW() - INTERVAL '30 days' AND a.data_emissao > (CURRENT_DATE - INTERVAL '2 years'))
   ORDER BY CASE WHEN a.lido_em IS NULL THEN 1 WHEN a.valor_no_sistema IS DISTINCT FROM a.valor_empenhado THEN 2 ELSE 3 END,
            a.data_emissao DESC NULLS LAST
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 5000));
$$;

REVOKE ALL ON FUNCTION public.notas_para_ler_no_siafi(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notas_para_ler_no_siafi(TEXT, INTEGER) TO service_role;

-- p_leituras: [{ empenho_id, codigo_documento, situacao, total_siafi,
--               linhas: [{ sequencial, numero_item, descricao, quantidade, valor_unitario, valor_total }] }]
CREATE OR REPLACE FUNCTION public.gravar_leituras_siafi(p_leituras JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_l     JSONB;
  v_id    UUID;
  v_ce    UUID;
  v_total INTEGER := 0;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava a leitura das notas no SIAFI.' USING ERRCODE = '42501';
  END IF;
  IF p_leituras IS NULL OR jsonb_typeof(p_leituras) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Envie uma lista de leituras.' USING ERRCODE = '22023';
  END IF;

  FOR v_l IN SELECT value FROM jsonb_array_elements(p_leituras) LOOP
    v_id := NULLIF(v_l->>'empenho_id', '')::UUID;
    IF v_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.empenhos WHERE id = v_id) THEN CONTINUE; END IF;

    INSERT INTO public.empenho_leituras_siafi (empenho_id, codigo_documento, situacao, linhas, total_siafi, valor_no_sistema, lido_em)
    SELECT v_id, left(COALESCE(v_l->>'codigo_documento', ''), 30),
           CASE WHEN v_l->>'situacao' = 'SEM_LINHAS' THEN 'SEM_LINHAS' ELSE 'LIDA' END,
           COALESCE(jsonb_array_length(COALESCE(v_l->'linhas', '[]'::jsonb)), 0),
           NULLIF(v_l->>'total_siafi', '')::NUMERIC,
           e.valor_empenhado, NOW()
      FROM public.empenhos e WHERE e.id = v_id
    ON CONFLICT (empenho_id) DO UPDATE
      SET codigo_documento = EXCLUDED.codigo_documento, situacao = EXCLUDED.situacao, linhas = EXCLUDED.linhas,
          total_siafi = EXCLUDED.total_siafi, valor_no_sistema = EXCLUDED.valor_no_sistema, lido_em = EXCLUDED.lido_em;

    DELETE FROM public.empenho_itens_siafi WHERE empenho_id = v_id;
    INSERT INTO public.empenho_itens_siafi (empenho_id, sequencial, numero_item, descricao, quantidade, valor_unitario, valor_total)
    SELECT v_id, (x->>'sequencial')::INTEGER, NULLIF(x->>'numero_item', '')::INTEGER, left(x->>'descricao', 500),
           NULLIF(x->>'quantidade', '')::NUMERIC, NULLIF(x->>'valor_unitario', '')::NUMERIC, NULLIF(x->>'valor_total', '')::NUMERIC
      FROM jsonb_array_elements(COALESCE(v_l->'linhas', '[]'::jsonb)) x
     WHERE x->>'sequencial' ~ '^[0-9]+$'
    ON CONFLICT (empenho_id, sequencial) DO NOTHING;

    FOR v_ce IN SELECT id FROM public.contrato_empenhos WHERE empenho_id = v_id LOOP
      PERFORM public.aplicar_distribuicao_automatica(v_ce);
    END LOOP;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_leituras_siafi(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_leituras_siafi(JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 6) Leitura
-- ------------------------------------------------------------------------------
-- As views da migration 104 com a quantidade da nota: nas parcelas e no empenhado do item. A comparação com o
-- SIAFI fica numa view à parte (v_empenho_nota_siafi), para não pesar nas views que usam a distribuição
-- (saldo dos itens, carteira).
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
      jsonb_build_object('numero_item', p.numero_item, 'valor', p.valor, 'quantidade_informada', p.quantidade_informada,
                         'quantidade_nota', p.quantidade_nota)
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
  'Uma linha por NE do contrato: situação do vínculo aos itens (A_DISTRIBUIR, DISTRIBUIDA, REVISAR, SEM_ITENS, SEM_VALOR), parcelas (valor, quantidade informada e quantidade da nota no SIAFI) e sugestão. VALOR_MUDOU em motivo_revisao é só aviso: a nota continua DISTRIBUIDA.';

CREATE OR REPLACE VIEW public.v_contrato_itens_execucao
WITH (security_invoker = true)
AS
WITH parcelas AS (
  SELECT
    d.contract_key,
    p.numero_item,
    p.valor,
    COALESCE(p.quantidade_informada, p.quantidade_nota, CASE WHEN i.valor_unitario > 0 THEN p.valor / i.valor_unitario END) AS quantidade
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
  'Por item do contrato: contratado e empenhado (notas vinculadas). quantidade_empenhada usa a quantidade informada pelo gestor, senão a da nota no SIAFI, senão valor ÷ preço unitário.';

REVOKE ALL ON public.v_contrato_empenho_distribuicao, public.v_contrato_itens_execucao FROM anon;
GRANT SELECT ON public.v_contrato_empenho_distribuicao, public.v_contrato_itens_execucao TO authenticated;

-- O que a nota diz no SIAFI, por nota do contrato (só as já lidas).
CREATE OR REPLACE VIEW public.v_empenho_nota_siafi
WITH (security_invoker = true)
AS
SELECT
  ce.id AS contrato_empenho_id,
  ce.contract_key,
  ce.empenho_id,
  sn.motivo,
  sn.itens,
  sn.itens_fora,
  sn.outro_preco,
  sn.preco_diferente,
  sn.valor_em_dobro,
  sn.total_siafi,
  sn.lido_em
FROM public.contrato_empenhos ce
JOIN public.empenho_leituras_siafi l ON l.empenho_id = ce.empenho_id
CROSS JOIN LATERAL public.nota_siafi_no_contrato(ce.id) sn;

COMMENT ON VIEW public.v_empenho_nota_siafi IS
  'Por nota do contrato já lida no SIAFI: itens e quantidades da nota, itens fora do contrato, item com o preço de outro e por que a leitura não serve para vincular (motivo).';

-- A view chama a comparação como quem lê: logados podem executá-la (ela só lê tabelas que eles leem).
GRANT EXECUTE ON FUNCTION public.nota_siafi_no_contrato(UUID) TO authenticated;
REVOKE ALL ON public.v_empenho_nota_siafi FROM PUBLIC, anon;
GRANT SELECT ON public.v_empenho_nota_siafi TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7) Conferência no Contratos.gov.br
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.correcoes_nota_no_contrato (
  id                  BIGSERIAL PRIMARY KEY,
  contrato_empenho_id UUID NOT NULL REFERENCES public.contrato_empenhos(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN (
                        'INCLUIR_ITEM_NO_CONTRATO', 'CORRIGIR_ITENS_DO_CONTRATO', 'CADASTRAR_ITENS_DO_CONTRATO',
                        'INCLUIR_NOTA_EM_OUTRO_CONTRATO', 'AVISAR_QUEM_EMITIU_A_NOTA', 'REVER_MEU_VINCULO', 'OUTRO')),
  observacao          TEXT CHECK (observacao IS NULL OR char_length(observacao) BETWEEN 1 AND 500),
  marcado_por         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  marcado_por_nome    TEXT,
  marcado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  desfeito_por        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  desfeito_por_nome   TEXT,
  desfeito_em         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS correcoes_nota_no_contrato_ativa_uidx
  ON public.correcoes_nota_no_contrato (contrato_empenho_id) WHERE desfeito_em IS NULL;
CREATE INDEX IF NOT EXISTS correcoes_nota_no_contrato_marcado_por_idx ON public.correcoes_nota_no_contrato (marcado_por) WHERE marcado_por IS NOT NULL;
CREATE INDEX IF NOT EXISTS correcoes_nota_no_contrato_desfeito_por_idx ON public.correcoes_nota_no_contrato (desfeito_por) WHERE desfeito_por IS NOT NULL;

ALTER TABLE public.correcoes_nota_no_contrato ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura para logados: correcoes_nota_no_contrato" ON public.correcoes_nota_no_contrato;
CREATE POLICY "Leitura para logados: correcoes_nota_no_contrato" ON public.correcoes_nota_no_contrato FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.correcoes_nota_no_contrato FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.correcoes_nota_no_contrato FROM authenticated;
GRANT SELECT ON public.correcoes_nota_no_contrato TO authenticated;
GRANT ALL ON public.correcoes_nota_no_contrato TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.correcoes_nota_no_contrato_id_seq TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_correcoes_nota_no_contrato ON public.correcoes_nota_no_contrato;
    CREATE TRIGGER trg_audit_correcoes_nota_no_contrato
      AFTER INSERT OR UPDATE OR DELETE ON public.correcoes_nota_no_contrato
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- Uma linha por nota que pede correção. tipo: CONTRATO_SEM_ITENS, ITEM_COM_OUTRO_PRECO,
-- ITEM_FORA_DO_CONTRATO, VINCULO_DIFERENTE_DA_NOTA.
CREATE OR REPLACE VIEW public.v_empenho_conferencia_nota
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT v.contrato_empenho_id, v.contract_key, v.empenho_id, v.numero_oficial, v.uasg_emitente, v.data_emissao,
         v.valor_nota, v.itens_no_contrato, v.origem, v.parcelas, v.distribuido_em,
         s.motivo, COALESCE(s.itens, '[]'::jsonb) AS itens_nota, COALESCE(s.itens_fora, ARRAY[]::INTEGER[]) AS itens_fora,
         COALESCE(s.outro_preco, '[]'::jsonb) AS outro_preco, s.total_siafi, COALESCE(s.valor_em_dobro, FALSE) AS valor_em_dobro,
         s.lido_em AS nota_lida_em
    FROM public.v_contrato_empenho_distribuicao v
    LEFT JOIN public.v_empenho_nota_siafi s ON s.contrato_empenho_id = v.contrato_empenho_id
   WHERE v.valor_nota > 0
     AND (v.itens_no_contrato = 0 OR (v.itens_no_contrato >= 2 AND s.lido_em IS NOT NULL AND s.motivo IS NULL))
),
com_tipo AS (
  SELECT b.*,
    CASE
      WHEN b.itens_no_contrato = 0 THEN 'CONTRATO_SEM_ITENS'
      WHEN jsonb_array_length(b.outro_preco) > 0 THEN 'ITEM_COM_OUTRO_PRECO'
      WHEN cardinality(b.itens_fora) > 0 THEN 'ITEM_FORA_DO_CONTRATO'
      WHEN b.origem = 'USUARIO' AND b.distribuido_em < b.nota_lida_em
       AND (SELECT COALESCE(array_agg(DISTINCT (x->>'numero_item')::INTEGER ORDER BY (x->>'numero_item')::INTEGER), ARRAY[]::INTEGER[])
              FROM jsonb_array_elements(b.parcelas) x)
           IS DISTINCT FROM
           (SELECT COALESCE(array_agg(DISTINCT (x->>'numero_item')::INTEGER ORDER BY (x->>'numero_item')::INTEGER), ARRAY[]::INTEGER[])
              FROM jsonb_array_elements(b.itens_nota) x WHERE (x->>'no_contrato')::BOOLEAN)
      THEN 'VINCULO_DIFERENTE_DA_NOTA'
    END AS tipo
    FROM base b
)
SELECT
  t.contrato_empenho_id,
  t.contract_key,
  t.empenho_id,
  t.numero_oficial,
  t.uasg_emitente,
  t.data_emissao,
  t.valor_nota,
  t.tipo,
  t.itens_nota,
  t.itens_fora,
  t.outro_preco,
  t.parcelas,
  t.origem,
  t.nota_lida_em,
  t.total_siafi,
  t.valor_em_dobro,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('numero_item', i.numero_item, 'quantidade', i.quantidade, 'valor_unitario', i.valor_unitario)
                             ORDER BY i.numero_item), '[]'::jsonb)
     FROM public.v_contrato_itens_numerados i WHERE i.contract_key = t.contract_key) AS itens_contrato,
  m.id               AS correcao_id,
  m.tipo             AS correcao_tipo,
  m.observacao       AS correcao_observacao,
  m.marcado_por_nome AS correcao_por_nome,
  m.marcado_em       AS correcao_em,
  CASE
    WHEN m.id IS NULL THEN 'A_CONFERIR'
    WHEN m.marcado_em > NOW() - INTERVAL '7 days' THEN 'CORRIGINDO'
    ELSE 'CORRECAO_NAO_CHEGOU'
  END AS situacao
FROM com_tipo t
LEFT JOIN public.correcoes_nota_no_contrato m ON m.contrato_empenho_id = t.contrato_empenho_id AND m.desfeito_em IS NULL
WHERE t.tipo IS NOT NULL;

COMMENT ON VIEW public.v_empenho_conferencia_nota IS
  'Notas em que a nota no SIAFI e o contrato no Contratos.gov.br não batem: o que corrigir, com a marca "Vou corrigir" do gestor.';

REVOKE ALL ON public.v_empenho_conferencia_nota FROM PUBLIC, anon;
GRANT SELECT ON public.v_empenho_conferencia_nota TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marcar_correcao_nota_no_contrato(
  p_contrato_empenho_id UUID,
  p_tipo TEXT,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_obs  TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_id   BIGINT;
  v_nome TEXT;
BEGIN
  IF NOT COALESCE(public.has_role('gestor'), FALSE) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador marca a correção no Contratos.gov.br.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('INCLUIR_ITEM_NO_CONTRATO', 'CORRIGIR_ITENS_DO_CONTRATO', 'CADASTRAR_ITENS_DO_CONTRATO',
                                      'INCLUIR_NOTA_EM_OUTRO_CONTRATO', 'AVISAR_QUEM_EMITIU_A_NOTA', 'REVER_MEU_VINCULO', 'OUTRO') THEN
    RAISE EXCEPTION 'INVALID_TIPO: Escolha o que vai ser corrigido.' USING ERRCODE = '22023';
  END IF;
  IF v_obs IS NOT NULL AND char_length(v_obs) > 500 THEN
    RAISE EXCEPTION 'INVALID_OBSERVACAO: A observação tem no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.v_empenho_conferencia_nota v WHERE v.contrato_empenho_id = p_contrato_empenho_id) THEN
    RAISE EXCEPTION 'JA_RESOLVIDA: Esta nota não pede mais correção. Atualize a lista.' USING ERRCODE = 'P0002';
  END IF;

  v_nome := public.nome_do_usuario_logado();
  UPDATE public.correcoes_nota_no_contrato
     SET tipo = p_tipo, observacao = v_obs, marcado_por = auth.uid(), marcado_por_nome = v_nome, marcado_em = NOW()
   WHERE contrato_empenho_id = p_contrato_empenho_id AND desfeito_em IS NULL
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.correcoes_nota_no_contrato (contrato_empenho_id, tipo, observacao, marcado_por, marcado_por_nome)
    VALUES (p_contrato_empenho_id, p_tipo, v_obs, auth.uid(), v_nome)
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'id', v_id, 'marcado_por_nome', v_nome);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_correcao_nota_no_contrato(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_correcao_nota_no_contrato(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.desfazer_correcao_nota_no_contrato(p_contrato_empenho_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  IF NOT COALESCE(public.has_role('gestor'), FALSE) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador desfaz a marca.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.correcoes_nota_no_contrato
     SET desfeito_em = NOW(), desfeito_por = auth.uid(), desfeito_por_nome = public.nome_do_usuario_logado()
   WHERE contrato_empenho_id = p_contrato_empenho_id AND desfeito_em IS NULL
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SEM_MARCA: Esta nota não está marcada como em correção.' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_correcao_nota_no_contrato(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_correcao_nota_no_contrato(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8) Agendamento: uma UG emitente por vez, em minutos alternados (o portal limita ~90 consultas por minuto)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('sincronizar-itens-notas-siafi-200330', '2,32 * * * *', $c$SELECT public.disparar_sincronizacao('itens_notas_siafi', '200330')$c$);
    PERFORM cron.schedule('sincronizar-itens-notas-siafi-200331', '17,47 * * * *', $c$SELECT public.disparar_sincronizacao('itens_notas_siafi', '200331')$c$);
  END IF;
END $$;
