-- ==============================================================================
-- MIGRATION 111: CADASTRO DAS UASGs DOS ÓRGÃOS PARTICIPANTES
-- Versão: 20261013000111_cadastro_uasgs.sql
--
-- Contexto: o nome do órgão que vem com a ata (3_consultarUnidadesItem) chega cortado em 45 letras
-- ("CORPO DE BOMBEIROS MILITAR DO ESTADO DE RORAI"). O cadastro de UASGs do Compras.gov.br
-- (modulo-uasg/1_consultarUasg) traz o nome inteiro (abreviado pela própria fonte), a cidade e a UF.
-- Medição de 13/10/2026: as 260 UASGs dos itens foram achadas no cadastro, sem erro.
--
-- 1) uasgs_cadastro: uma linha por UASG, como o cadastro devolveu. UASG que o cadastro não achou fica
--    com nome nulo e encontrada = FALSE (a tela mostra o nome da ata).
--
-- 2) uasgs_para_cadastrar: UASGs citadas nos itens (órgãos e adesões da cópia, órgãos da ata assinada)
--    que nunca foram lidas, lidas há mais de 30 dias ou não achadas há mais de 7 dias.
--
-- 3) gravar_cadastro_uasgs: escrita só por esta função, com a trava do recurso 'cadastro_uasgs'
--    (UASG 000000, vale para todas as carteiras, como saldos_itens).
--
-- 4) Agendamento: um job por hora, aos :48.
--
-- Leitura: todo usuário logado. Nenhuma regra existente muda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) uasgs_cadastro
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uasgs_cadastro (
  codigo_uasg  VARCHAR(6)   PRIMARY KEY,
  nome         VARCHAR(200),               -- nomeUasg do cadastro; nulo quando não achada
  municipio    VARCHAR(120),               -- nomeMunicipioIbge
  sigla_uf     VARCHAR(2),
  ativa        BOOLEAN,                    -- statusUasg
  encontrada   BOOLEAN      NOT NULL DEFAULT FALSE,
  lido_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uasgs_cadastro_codigo CHECK (codigo_uasg ~ '^[0-9]{6}$'),
  CONSTRAINT uasgs_cadastro_uf CHECK (sigla_uf IS NULL OR sigla_uf ~ '^[A-Z]{2}$'),
  CONSTRAINT uasgs_cadastro_coerente CHECK (encontrada = (nome IS NOT NULL))
);
COMMENT ON TABLE public.uasgs_cadastro IS
  'Cadastro de UASGs do Compras.gov.br (modulo-uasg/1_consultarUasg): nome, cidade e UF. Grava só por gravar_cadastro_uasgs.';

ALTER TABLE public.uasgs_cadastro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: uasgs_cadastro" ON public.uasgs_cadastro;
CREATE POLICY "Authenticated Read: uasgs_cadastro"
  ON public.uasgs_cadastro FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.uasgs_cadastro FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.uasgs_cadastro TO authenticated;

-- ------------------------------------------------------------------------------
-- 2) UASGs que precisam ser lidas no cadastro
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uasgs_para_cadastrar(p_limite INTEGER DEFAULT 500)
RETURNS TABLE (codigo_uasg VARCHAR(6))
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH citadas AS (
    SELECT u->>'codigoUnidade' AS uasg
      FROM public.itens_ata_unidades_copia c,
           jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u
    UNION
    -- adesões: "929777 - SECRETARIA DE ..."
    SELECT substring(a->>'unidadeNaoParticipante' FROM '^\s*([0-9]{6})')
      FROM public.itens_ata_unidades_copia c,
           jsonb_array_elements(CASE WHEN jsonb_typeof(c.adesoes) = 'array' THEN c.adesoes ELSE '[]'::jsonb END) a
    UNION
    SELECT q.uasg FROM public.ata_item_quantidade_assinada q
  )
  SELECT ci.uasg::VARCHAR(6)
    FROM citadas ci
    LEFT JOIN public.uasgs_cadastro k ON k.codigo_uasg = ci.uasg
   WHERE ci.uasg ~ '^[0-9]{6}$'
     AND (public.eh_service_role() OR public.has_role('gestor'))
     AND (
       k.codigo_uasg IS NULL
       OR (k.encontrada AND k.lido_em < NOW() - INTERVAL '30 days')
       OR (NOT k.encontrada AND k.lido_em < NOW() - INTERVAL '7 days')
     )
   ORDER BY k.lido_em NULLS FIRST, ci.uasg
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 2000));
$$;

REVOKE ALL ON FUNCTION public.uasgs_para_cadastrar(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uasgs_para_cadastrar(INTEGER) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) Gravar o que o cadastro devolveu, só com a trava em mãos
--
-- p_uasgs: array JSON (no máximo 200 por chamada) de
--   { "codigo_uasg": "462492", "nome": "CORPO DE BOMBEIROS MILITAR DE RORAIMA/RR",
--     "municipio": "BOA VISTA", "sigla_uf": "RR", "ativa": true }
-- Sem "nome": a UASG não foi achada (fica registrada para nova tentativa em 7 dias).
-- Devolve quantas UASGs foram gravadas.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_cadastro_uasgs(p_uasgs JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item   JSONB;
  v_codigo TEXT;
  v_nome   TEXT;
  v_uf     TEXT;
  v_total  INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'cadastro_uasgs'
       AND uasg = '000000'
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização do cadastro de UASGs não reservada por este usuário.'
      USING ERRCODE = '55000';
  END IF;

  IF p_uasgs IS NULL OR jsonb_typeof(p_uasgs) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_uasgs deve ser um array JSON.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_uasgs) > 200 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 200 UASGs por chamada.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT valor FROM jsonb_array_elements(p_uasgs) AS e(valor) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;
    v_codigo := btrim(COALESCE(v_item->>'codigo_uasg', ''));
    IF v_codigo !~ '^[0-9]{6}$' THEN CONTINUE; END IF;
    v_nome := NULLIF(left(btrim(COALESCE(v_item->>'nome', '')), 200), '');
    v_uf := upper(btrim(COALESCE(v_item->>'sigla_uf', '')));
    IF v_uf !~ '^[A-Z]{2}$' THEN v_uf := NULL; END IF;

    IF v_nome IS NOT NULL THEN
      INSERT INTO public.uasgs_cadastro (codigo_uasg, nome, municipio, sigla_uf, ativa, encontrada, lido_em)
      VALUES (
        v_codigo, v_nome,
        NULLIF(left(btrim(COALESCE(v_item->>'municipio', '')), 120), ''),
        v_uf,
        CASE WHEN jsonb_typeof(v_item->'ativa') = 'boolean' THEN (v_item->>'ativa')::BOOLEAN END,
        TRUE, NOW()
      )
      ON CONFLICT (codigo_uasg) DO UPDATE
        SET nome = EXCLUDED.nome, municipio = EXCLUDED.municipio, sigla_uf = EXCLUDED.sigla_uf,
            ativa = EXCLUDED.ativa, encontrada = TRUE, lido_em = EXCLUDED.lido_em;
    ELSE
      -- Não achada: um nome lido antes continua valendo; só registra a tentativa.
      INSERT INTO public.uasgs_cadastro (codigo_uasg, encontrada, lido_em)
      VALUES (v_codigo, FALSE, NOW())
      ON CONFLICT (codigo_uasg) DO UPDATE SET lido_em = EXCLUDED.lido_em;
    END IF;
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_cadastro_uasgs(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_cadastro_uasgs(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4) Agendamento (mesmo padrão da migration 77; o mesmo nome atualiza o job existente)
-- ------------------------------------------------------------------------------
SELECT cron.schedule('sincronizar-cadastro-uasgs', '48 * * * *', $$SELECT public.disparar_sincronizacao('cadastro_uasgs')$$);
