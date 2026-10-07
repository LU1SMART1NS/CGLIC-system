-- ==============================================================================
-- MIGRATION 92: CÓPIA DAS ADESÕES DE CADA ITEM DA ATA
-- Versão: 20261007000092_copia_adesoes_dos_itens.sql
--
-- Contexto: como os órgãos participantes (migration 91), as adesões (caronas) do item só existiam ao vivo
-- no Compras.gov.br (modulo-arp/5_consultarAdesoesItem), que desde 07/10/2026 devolve vazio para todas
-- as atas. A aba Adesões passava a dizer "nenhuma carona" sem saber se era verdade.
--
-- Diferença para os órgãos: um item sem adesão devolve vazio de verdade. Por isso a sincronização só
-- grava a lista de adesões quando, na mesma leitura, a consulta de órgãos do item respondeu (a API está
-- de pé); aí a lista vazia também é gravada, como "sem adesões, conferido em". Com a API fora do ar, a
-- cópia das adesões não é tocada.
--
-- 1) itens_ata_unidades_copia ganha adesoes / total_adesoes / adesoes_copiado_em.
-- 2) gravar_unidades_itens aceita a chave opcional "adesoes" em cada item: presente (lista, mesmo vazia),
--    substitui a cópia das adesões; ausente, não mexe nela. Mesma assinatura, mesma trava, mesmos perfis.
--
-- Leitura: todo usuário logado (a política da migration 91 já cobre as colunas novas).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Colunas das adesões
-- ------------------------------------------------------------------------------
ALTER TABLE public.itens_ata_unidades_copia
  ADD COLUMN IF NOT EXISTS adesoes            JSONB,                       -- nula enquanto nenhuma leitura confiável
  ADD COLUMN IF NOT EXISTS total_adesoes      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adesoes_copiado_em TIMESTAMPTZ;                 -- quando a lista guardada foi lida

ALTER TABLE public.itens_ata_unidades_copia DROP CONSTRAINT IF EXISTS itens_ata_unidades_copia_adesoes_lista;
ALTER TABLE public.itens_ata_unidades_copia ADD CONSTRAINT itens_ata_unidades_copia_adesoes_lista
  CHECK (adesoes IS NULL OR jsonb_typeof(adesoes) = 'array');

ALTER TABLE public.itens_ata_unidades_copia DROP CONSTRAINT IF EXISTS itens_ata_unidades_copia_adesoes_coerente;
ALTER TABLE public.itens_ata_unidades_copia ADD CONSTRAINT itens_ata_unidades_copia_adesoes_coerente
  CHECK ((adesoes IS NULL) = (adesoes_copiado_em IS NULL));

ALTER TABLE public.itens_ata_unidades_copia DROP CONSTRAINT IF EXISTS itens_ata_unidades_copia_adesoes_total;
ALTER TABLE public.itens_ata_unidades_copia ADD CONSTRAINT itens_ata_unidades_copia_adesoes_total
  CHECK (total_adesoes >= 0);

-- ------------------------------------------------------------------------------
-- 2) Gravar órgãos e adesões lidos, só com a trava em mãos
--
-- p_itens: array JSON (no máximo 100 itens por chamada) de
--   { "item_key": "00036/2024-200331-00002",
--     "unidades": [ { "codigoUnidade": "200331", ... } ],
--     "adesoes":  [ { "unidadeNaoParticipante": "929777 - ...", ... } ] }   -- opcional
-- Unidades: com itens, substitui a cópia; vazia, só registra a tentativa (a cópia fica).
-- Adesões: presente (mesmo vazia), substitui a cópia das adesões; ausente, não mexe.
-- Devolve quantos itens tiveram a cópia dos órgãos substituída.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_unidades_itens(
  p_uasg VARCHAR(6),
  p_itens JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item     JSONB;
  v_key      TEXT;
  v_unidades JSONB;
  v_adesoes  JSONB;
  v_total    INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'unidades_itens'
       AND uasg = p_uasg
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização dos órgãos dos itens da UASG % não reservada por este usuário.', p_uasg
      USING ERRCODE = '55000';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_itens deve ser um array JSON.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 100 itens por chamada.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT valor FROM jsonb_array_elements(p_itens) AS e(valor) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;
    v_key := left(btrim(COALESCE(v_item->>'item_key', '')), 100);
    IF v_key = '' THEN CONTINUE; END IF;

    -- Só objetos entram nas listas; o resto é descartado sem derrubar o lote.
    SELECT COALESCE(jsonb_agg(u.valor ORDER BY u.ordem), '[]'::jsonb)
      INTO v_unidades
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_item->'unidades') = 'array' THEN v_item->'unidades' ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS u(valor, ordem)
     WHERE jsonb_typeof(u.valor) = 'object';

    IF jsonb_array_length(v_unidades) > 500 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 unidades por item (%).', v_key
        USING ERRCODE = '22023';
    END IF;

    v_adesoes := NULL;
    IF jsonb_typeof(v_item->'adesoes') = 'array' THEN
      SELECT COALESCE(jsonb_agg(a.valor ORDER BY a.ordem), '[]'::jsonb)
        INTO v_adesoes
        FROM jsonb_array_elements(v_item->'adesoes') WITH ORDINALITY AS a(valor, ordem)
       WHERE jsonb_typeof(a.valor) = 'object';
      IF jsonb_array_length(v_adesoes) > 1000 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 1000 adesões por item (%).', v_key
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF jsonb_array_length(v_unidades) > 0 THEN
      INSERT INTO public.itens_ata_unidades_copia AS c
        (item_key, unidades, total_unidades, copiado_em, lido_em, ultima_leitura_vazia)
      VALUES (v_key, v_unidades, jsonb_array_length(v_unidades), NOW(), NOW(), FALSE)
      ON CONFLICT (item_key) DO UPDATE
        SET unidades = EXCLUDED.unidades,
            total_unidades = EXCLUDED.total_unidades,
            copiado_em = EXCLUDED.copiado_em,
            lido_em = EXCLUDED.lido_em,
            ultima_leitura_vazia = FALSE;
      v_total := v_total + 1;
    ELSE
      INSERT INTO public.itens_ata_unidades_copia AS c (item_key, lido_em, ultima_leitura_vazia)
      VALUES (v_key, NOW(), TRUE)
      ON CONFLICT (item_key) DO UPDATE
        SET lido_em = EXCLUDED.lido_em, ultima_leitura_vazia = TRUE;
    END IF;

    IF v_adesoes IS NOT NULL THEN
      UPDATE public.itens_ata_unidades_copia
         SET adesoes = v_adesoes,
             total_adesoes = jsonb_array_length(v_adesoes),
             adesoes_copiado_em = NOW()
       WHERE item_key = v_key;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_unidades_itens(VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_unidades_itens(VARCHAR, JSONB) TO authenticated, service_role;
