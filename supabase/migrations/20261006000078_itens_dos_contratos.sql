-- ==============================================================================
-- MIGRATION 78: ITENS DOS CONTRATOS PERSISTIDOS
-- Versão: 20261006000078_itens_dos_contratos.sql
--
-- Contexto: o Contrato 360 não mostrava os itens do contrato. Eles só existiam ao vivo nas APIs
-- (Contratos.gov.br e, na falta, Compras.gov.br) e cada tela que precisava consultava por conta própria.
-- Os vínculos item da ata × contrato (arp_item_contract_links) guardam só os itens vinculados.
--
-- 1) itens_contrato: a cópia oficial dos itens de cada contrato, uma linha por item, como a API devolve.
--    - Chave (contract_key, posicao): a posição é a ordem na resposta da API. O número do item da compra
--      (numero_item, o mesmo número do item na ata) pode faltar em contratos sem compra, por isso não é
--      a chave.
--    - A cada leitura bem-sucedida, os itens do contrato são substituídos pelo que a API devolveu.
--    - Leitura vazia não apaga nada: a API fora do ar não pode esvaziar um contrato que tinha itens.
--    - Sem gatilho de auditoria de propósito, como contratos_oficiais: a sincronização regrava os itens
--      vindos das APIs oficiais, o que encheria audit_logs sem informação útil.
--
-- 2) itens_contrato_leituras: por contrato, quando os itens foram lidos pela última vez e quantos vieram.
--    Distingue "ainda não lido" de "lido e a API não tem itens", e diz à sincronização o que reler.
--
-- 3) gravar_itens_contratos: escrita só por esta função, com a trava do recurso 'itens_contratos' da
--    UASG (sincronizacao_fontes, migrations 72 e 76). Aceita gestor, coordenador e o servidor.
--
-- 4) Agendamento: um job por UASG às :25, depois de contratos (:05) e atas (:15).
--
-- Leitura: todo usuário logado, como contratos_oficiais. Nenhuma regra existente muda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) itens_contrato
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itens_contrato (
  contract_key    VARCHAR(100) NOT NULL,   -- chave canônica do contrato (ContractDashboardRecord.id)
  posicao         INTEGER      NOT NULL,   -- ordem do item na resposta da API (1, 2, 3...)
  numero_item     INTEGER,                 -- número do item da compra = número do item na ata
  descricao       TEXT,
  tipo            TEXT,                    -- Material / Serviço, como a API informa
  quantidade      NUMERIC(18, 4),
  valor_unitario  NUMERIC(18, 4),
  valor_total     NUMERIC(18, 4),
  fonte           VARCHAR(20)  NOT NULL,
  sincronizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contract_key, posicao),
  CONSTRAINT itens_contrato_posicao_positiva CHECK (posicao > 0),
  CONSTRAINT itens_contrato_fonte_valida CHECK (fonte IN ('CONTRATOS_GOV', 'COMPRAS_GOV'))
);

ALTER TABLE public.itens_contrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: itens_contrato" ON public.itens_contrato;
CREATE POLICY "Authenticated Read: itens_contrato"
  ON public.itens_contrato FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.itens_contrato FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2) itens_contrato_leituras
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itens_contrato_leituras (
  contract_key VARCHAR(100) PRIMARY KEY,
  lido_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  total_itens  INTEGER      NOT NULL,
  fonte        VARCHAR(20),               -- nula quando a leitura não trouxe itens
  CONSTRAINT itens_contrato_leituras_total CHECK (total_itens >= 0),
  CONSTRAINT itens_contrato_leituras_fonte CHECK (fonte IS NULL OR fonte IN ('CONTRATOS_GOV', 'COMPRAS_GOV'))
);

ALTER TABLE public.itens_contrato_leituras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: itens_contrato_leituras" ON public.itens_contrato_leituras;
CREATE POLICY "Authenticated Read: itens_contrato_leituras"
  ON public.itens_contrato_leituras FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.itens_contrato_leituras FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3) Gravar os itens lidos, só com a trava em mãos
--
-- p_contratos: array JSON (no máximo 100 contratos por chamada) de
--   { "contract_key": "...", "fonte": "CONTRATOS_GOV" | "COMPRAS_GOV" | null,
--     "itens": [ { "numero_item": 4, "descricao": "...", "tipo": "...",
--                  "quantidade": 27, "valor_unitario": 21357.95, "valor_total": 576664.65 } ] }
-- Valores que não são número JSON viram nulos (não derrubam o lote).
-- Contrato com itens: substitui os itens dele e registra a leitura.
-- Contrato sem itens: registra a leitura vazia só se ele não tinha itens; se tinha, nada muda
-- (a próxima sincronização tenta de novo).
-- Devolve quantos contratos tiveram a leitura registrada.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_itens_contratos(
  p_uasg VARCHAR(6),
  p_contratos JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contrato JSONB;
  v_key      TEXT;
  v_itens    JSONB;
  v_fonte    TEXT;
  v_total    INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'itens_contratos'
       AND uasg = p_uasg
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização dos itens dos contratos da UASG % não reservada por este usuário.', p_uasg
      USING ERRCODE = '55000';
  END IF;

  IF p_contratos IS NULL OR jsonb_typeof(p_contratos) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_contratos deve ser um array JSON.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_contratos) > 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 100 contratos por chamada.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_contrato IN SELECT valor FROM jsonb_array_elements(p_contratos) AS e(valor) LOOP
    IF jsonb_typeof(v_contrato) <> 'object' THEN CONTINUE; END IF;
    v_key := left(btrim(COALESCE(v_contrato->>'contract_key', '')), 100);
    IF v_key = '' THEN CONTINUE; END IF;

    v_itens := CASE WHEN jsonb_typeof(v_contrato->'itens') = 'array' THEN v_contrato->'itens' ELSE '[]'::jsonb END;
    IF jsonb_array_length(v_itens) > 500 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 itens por contrato (%).', v_key
        USING ERRCODE = '22023';
    END IF;
    v_fonte := v_contrato->>'fonte';
    IF v_fonte IS NOT NULL AND v_fonte NOT IN ('CONTRATOS_GOV', 'COMPRAS_GOV') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: fonte inválida (%).', v_fonte
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(v_itens) > 0 THEN
      IF v_fonte IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: contrato % com itens precisa informar a fonte.', v_key
          USING ERRCODE = '22023';
      END IF;

      DELETE FROM public.itens_contrato WHERE contract_key = v_key;

      INSERT INTO public.itens_contrato (
        contract_key, posicao, numero_item, descricao, tipo, quantidade, valor_unitario, valor_total, fonte, sincronizado_em
      )
      SELECT v_key,
             i.ordem::INTEGER,
             CASE WHEN jsonb_typeof(i.item->'numero_item') = 'number' THEN trunc((i.item->>'numero_item')::NUMERIC)::INTEGER END,
             NULLIF(btrim(i.item->>'descricao'), ''),
             NULLIF(btrim(i.item->>'tipo'), ''),
             CASE WHEN jsonb_typeof(i.item->'quantidade') = 'number' THEN (i.item->>'quantidade')::NUMERIC END,
             CASE WHEN jsonb_typeof(i.item->'valor_unitario') = 'number' THEN (i.item->>'valor_unitario')::NUMERIC END,
             CASE WHEN jsonb_typeof(i.item->'valor_total') = 'number' THEN (i.item->>'valor_total')::NUMERIC END,
             v_fonte,
             NOW()
        FROM jsonb_array_elements(v_itens) WITH ORDINALITY AS i(item, ordem)
       WHERE jsonb_typeof(i.item) = 'object';

      INSERT INTO public.itens_contrato_leituras AS l (contract_key, lido_em, total_itens, fonte)
      VALUES (v_key, NOW(), (SELECT count(*) FROM public.itens_contrato WHERE contract_key = v_key), v_fonte)
      ON CONFLICT (contract_key) DO UPDATE
        SET lido_em = EXCLUDED.lido_em, total_itens = EXCLUDED.total_itens, fonte = EXCLUDED.fonte;
      v_total := v_total + 1;

    ELSIF NOT EXISTS (SELECT 1 FROM public.itens_contrato WHERE contract_key = v_key) THEN
      INSERT INTO public.itens_contrato_leituras AS l (contract_key, lido_em, total_itens, fonte)
      VALUES (v_key, NOW(), 0, NULL)
      ON CONFLICT (contract_key) DO UPDATE
        SET lido_em = EXCLUDED.lido_em, total_itens = 0, fonte = NULL;
      v_total := v_total + 1;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_itens_contratos(VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_itens_contratos(VARCHAR, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4) Agendamento (mesmo padrão da migration 77; o mesmo nome atualiza o job existente)
-- ------------------------------------------------------------------------------
SELECT cron.schedule('sincronizar-itens-contratos-200330', '25 * * * *', $$SELECT public.disparar_sincronizacao('itens_contratos', '200330')$$);
SELECT cron.schedule('sincronizar-itens-contratos-200331', '25 * * * *', $$SELECT public.disparar_sincronizacao('itens_contratos', '200331')$$);
