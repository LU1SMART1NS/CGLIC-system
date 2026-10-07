-- ==============================================================================
-- MIGRATION 91: CÓPIA DOS ÓRGÃOS PARTICIPANTES DE CADA ITEM DA ATA
-- Versão: 20261007000091_copia_unidades_dos_itens.sql
--
-- Contexto: a aba "Órgãos participantes" do Item lia a lista só ao vivo no Compras.gov.br
-- (modulo-arp/3_consultarUnidadesItem). Em 07/10/2026 essa consulta passou a devolver vazio para todas
-- as atas, e a tela ficou sem os órgãos. A partir daqui o servidor guarda a última lista válida de cada
-- item e a tela usa essa cópia (com a data) quando a API não responde.
--
-- 1) itens_ata_unidades_copia: uma linha por item da ata (item_key), com a lista de unidades como a API
--    devolveu (gerenciadora e participantes, só os campos que a tela usa).
--    - Leitura vazia não apaga a cópia: a API fora do ar não pode esvaziar um item que tinha órgãos.
--    - copiado_em = quando a lista guardada foi lida; lido_em = última tentativa (com ou sem dados).
--    - Sem gatilho de auditoria de propósito, como itens_contrato: é cópia de fonte oficial regravada.
--
-- 2) gravar_unidades_itens: escrita só por esta função, com a trava do recurso 'unidades_itens' da
--    UASG (sincronizacao_fontes). Aceita gestor, coordenador e o servidor, como gravar_itens_contratos.
--
-- 3) Agendamento: um job por UASG às :40 e :42.
--
-- Leitura: todo usuário logado. Nenhuma regra existente muda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) itens_ata_unidades_copia
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itens_ata_unidades_copia (
  item_key             VARCHAR(100) PRIMARY KEY,  -- `${numeroAta}-${uasg}-${Pad5(numeroItem)}`
  unidades             JSONB,                     -- nula enquanto nenhuma leitura trouxe órgãos
  total_unidades       INTEGER      NOT NULL DEFAULT 0,
  copiado_em           TIMESTAMPTZ,               -- quando a lista guardada foi lida
  lido_em              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ultima_leitura_vazia BOOLEAN      NOT NULL DEFAULT FALSE,
  CONSTRAINT itens_ata_unidades_copia_lista CHECK (
    unidades IS NULL OR (jsonb_typeof(unidades) = 'array' AND jsonb_array_length(unidades) > 0)
  ),
  CONSTRAINT itens_ata_unidades_copia_total CHECK (total_unidades >= 0),
  CONSTRAINT itens_ata_unidades_copia_coerente CHECK ((unidades IS NULL) = (copiado_em IS NULL))
);

ALTER TABLE public.itens_ata_unidades_copia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: itens_ata_unidades_copia" ON public.itens_ata_unidades_copia;
CREATE POLICY "Authenticated Read: itens_ata_unidades_copia"
  ON public.itens_ata_unidades_copia FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.itens_ata_unidades_copia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.itens_ata_unidades_copia TO authenticated;

-- ------------------------------------------------------------------------------
-- 2) Gravar as listas lidas, só com a trava em mãos
--
-- p_itens: array JSON (no máximo 100 itens por chamada) de
--   { "item_key": "00036/2024-200331-00002", "unidades": [ { "codigoUnidade": "200331", ... } ] }
-- Item com unidades: substitui a cópia. Item sem unidades: só registra a tentativa (a cópia fica).
-- Devolve quantos itens tiveram a cópia substituída.
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

    -- Só objetos entram na lista; o resto é descartado sem derrubar o lote.
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
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_unidades_itens(VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_unidades_itens(VARCHAR, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) Agendamento (mesmo padrão da migration 77; o mesmo nome atualiza o job existente)
-- ------------------------------------------------------------------------------
SELECT cron.schedule('sincronizar-unidades-itens-200330', '40 * * * *', $$SELECT public.disparar_sincronizacao('unidades_itens', '200330')$$);
SELECT cron.schedule('sincronizar-unidades-itens-200331', '42 * * * *', $$SELECT public.disparar_sincronizacao('unidades_itens', '200331')$$);
