-- ==============================================================================
-- MIGRATION 93: CÓPIA DO HISTÓRICO, RESPONSÁVEIS E GARANTIAS DOS CONTRATOS
-- Versão: 20261007000093_copia_detalhes_dos_contratos.sql
--
-- Contexto: o Contrato 360 lia ao vivo no Contratos.gov.br o histórico (termos aditivos e apostilamentos),
-- os responsáveis (fiscais) e as garantias de cada contrato. Se a consulta falhava, a tela recebia lista
-- vazia e mostrava "sem fiscal", "sem garantia" e "sem aditivos" como se fosse verdade. A partir daqui o
-- servidor guarda a última leitura válida de cada um, e a tela usa a cópia (com a data) quando a API falha.
--
-- 1) contratos_detalhes_copia: uma linha por contrato (contract_key), com as três listas como a API
--    devolveu. Cada lista tem a própria data: a leitura de uma pode falhar sem mexer nas outras.
--    - Diferente do Compras.gov.br, o Contratos.gov.br responde erro quando falha; resposta bem-sucedida
--      e vazia é "não há" de verdade e também é gravada.
--    - Responsáveis: só o nome, sem o CPF mascarado que a API manda junto.
--    - Sem gatilho de auditoria de propósito, como itens_contrato: é cópia de fonte oficial regravada.
--
-- 2) gravar_detalhes_contratos: escrita só por esta função, com a trava do recurso 'itens_contratos' da
--    UASG (o mesmo da leitura dos itens, que passa a ler também estes dados). Gestor, coordenador e servidor.
--
-- Leitura: todo usuário logado. Nenhuma regra existente muda; sem agendamento novo.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) contratos_detalhes_copia
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contratos_detalhes_copia (
  contract_key            VARCHAR(100) PRIMARY KEY,   -- chave canônica do contrato (ContractDashboardRecord.id)
  contrato_id_gov         TEXT,                       -- id no Contratos.gov.br usado na leitura
  historico               JSONB,
  historico_copiado_em    TIMESTAMPTZ,
  responsaveis            JSONB,
  responsaveis_copiado_em TIMESTAMPTZ,
  garantias               JSONB,
  garantias_copiado_em    TIMESTAMPTZ,
  lido_em                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- última tentativa (com ou sem sucesso)
  CONSTRAINT contratos_detalhes_copia_historico CHECK (
    (historico IS NULL) = (historico_copiado_em IS NULL) AND (historico IS NULL OR jsonb_typeof(historico) = 'array')
  ),
  CONSTRAINT contratos_detalhes_copia_responsaveis CHECK (
    (responsaveis IS NULL) = (responsaveis_copiado_em IS NULL) AND (responsaveis IS NULL OR jsonb_typeof(responsaveis) = 'array')
  ),
  CONSTRAINT contratos_detalhes_copia_garantias CHECK (
    (garantias IS NULL) = (garantias_copiado_em IS NULL) AND (garantias IS NULL OR jsonb_typeof(garantias) = 'array')
  )
);

ALTER TABLE public.contratos_detalhes_copia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contratos_detalhes_copia" ON public.contratos_detalhes_copia;
CREATE POLICY "Authenticated Read: contratos_detalhes_copia"
  ON public.contratos_detalhes_copia FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contratos_detalhes_copia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contratos_detalhes_copia TO authenticated;

-- ------------------------------------------------------------------------------
-- 2) Gravar o que foi lido, só com a trava em mãos
--
-- p_contratos: array JSON (no máximo 100 contratos por chamada) de
--   { "contract_key": "...", "contrato_id_gov": "999732",
--     "historico": [ ... ], "responsaveis": [ ... ], "garantias": [ ... ] }
-- Cada lista presente (mesmo vazia) substitui a cópia dela; ausente (a leitura falhou), não mexe.
-- Só objetos entram nas listas. Devolve quantos contratos tiveram ao menos uma lista gravada.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_detalhes_contratos(
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
  v_lista    TEXT;
  v_valor    JSONB;
  v_listas   JSONB;
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

    -- Listas válidas deste contrato, já sem o que não for objeto.
    v_listas := '{}'::jsonb;
    FOREACH v_lista IN ARRAY ARRAY['historico', 'responsaveis', 'garantias'] LOOP
      IF jsonb_typeof(v_contrato->v_lista) = 'array' THEN
        SELECT COALESCE(jsonb_agg(l.valor ORDER BY l.ordem), '[]'::jsonb)
          INTO v_valor
          FROM jsonb_array_elements(v_contrato->v_lista) WITH ORDINALITY AS l(valor, ordem)
         WHERE jsonb_typeof(l.valor) = 'object';
        IF jsonb_array_length(v_valor) > 500 THEN
          RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 registros em % por contrato (%).', v_lista, v_key
            USING ERRCODE = '22023';
        END IF;
        v_listas := v_listas || jsonb_build_object(v_lista, v_valor);
      END IF;
    END LOOP;

    INSERT INTO public.contratos_detalhes_copia AS c (contract_key, contrato_id_gov, lido_em)
    VALUES (v_key, NULLIF(btrim(v_contrato->>'contrato_id_gov'), ''), NOW())
    ON CONFLICT (contract_key) DO UPDATE
      SET lido_em = EXCLUDED.lido_em,
          contrato_id_gov = COALESCE(EXCLUDED.contrato_id_gov, c.contrato_id_gov);

    UPDATE public.contratos_detalhes_copia
       SET historico               = CASE WHEN v_listas ? 'historico' THEN v_listas->'historico' ELSE historico END,
           historico_copiado_em    = CASE WHEN v_listas ? 'historico' THEN NOW() ELSE historico_copiado_em END,
           responsaveis            = CASE WHEN v_listas ? 'responsaveis' THEN v_listas->'responsaveis' ELSE responsaveis END,
           responsaveis_copiado_em = CASE WHEN v_listas ? 'responsaveis' THEN NOW() ELSE responsaveis_copiado_em END,
           garantias               = CASE WHEN v_listas ? 'garantias' THEN v_listas->'garantias' ELSE garantias END,
           garantias_copiado_em    = CASE WHEN v_listas ? 'garantias' THEN NOW() ELSE garantias_copiado_em END
     WHERE contract_key = v_key;

    IF v_listas <> '{}'::jsonb THEN
      v_total := v_total + 1;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_detalhes_contratos(VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_detalhes_contratos(VARCHAR, JSONB) TO authenticated, service_role;
