-- ==============================================================================
-- MIGRATION 139: GRUPO DE TRABALHO INTEGRADO (GTI) DE CADA UASG E FATIA DAS ATAS
-- Versão: 20261015000139_grupos_gti_das_uasgs.sql
--
-- Contexto (protótipo aprovado em 15/10/2026): filtrar as atas pelo interesse de cada GTI do ComprasSUSP
-- (LIGABOM = Bombeiros, CNCG = Polícias Militares, CNPC = Polícias Civis, CONDPCI = Perícia,
-- CONSESP = Secretarias de Segurança Pública). O Compras.gov.br não tem um campo que diga a força:
-- o sistema sugere pelo nome da UASG e pela sigla do órgão, e o coordenador confirma.
-- Medição de 15/10/2026: Bombeiros participam de 137 das 211 atas com órgãos copiados, por isso o
-- interesse é medido pela FATIA da quantidade registrada, não pela simples presença.
--
-- 1) uasgs_cadastro ganha o órgão da UASG (modulo-uasg/2_consultarOrgao): código, sigla e esfera.
--    gravar_cadastro_uasgs passa a gravá-los; uasgs_para_cadastrar relê as UASGs achadas antes disso.
--
-- 2) uasgs_grupo_gti: o grupo confirmado de cada UASG, com quem confirmou e quando.
--    Escrita só por definir_grupos_uasgs, só o coordenador (perfil admin).
--
-- 3) v_ata_gti_fatias: por ata, a quantidade registrada dos órgãos participantes somada por grupo.
--    Fora da conta: a SENASP (200330/200331), a gerenciadora da ata e as adesões.
--    UASG sem grupo confirmado entra como 'A_CONFIRMAR' (o total da ata fica honesto).
--
-- 4) v_uasgs_participantes_gti: as UASGs participantes, com cadastro e grupo (tela Ajustes).
--
-- 5) v_item_gti_fatias: o mesmo da 3, por item (aba Itens da carteira).
--
-- Leitura: todo usuário logado e ativo. Nenhuma regra existente muda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Órgão da UASG no cadastro
-- ------------------------------------------------------------------------------
ALTER TABLE public.uasgs_cadastro
  ADD COLUMN IF NOT EXISTS codigo_orgao  INTEGER,
  ADD COLUMN IF NOT EXISTS sigla_orgao   VARCHAR(80),
  ADD COLUMN IF NOT EXISTS esfera_orgao  VARCHAR(1),
  ADD COLUMN IF NOT EXISTS orgao_lido_em TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uasgs_cadastro_esfera') THEN
    ALTER TABLE public.uasgs_cadastro
      ADD CONSTRAINT uasgs_cadastro_esfera CHECK (esfera_orgao IS NULL OR esfera_orgao IN ('F', 'E', 'M'));
  END IF;
END $$;

COMMENT ON COLUMN public.uasgs_cadastro.sigla_orgao IS
  'nomeMnemonicoOrgao do órgão da UASG (modulo-uasg/2_consultarOrgao), ex.: CBMES/ES. Base da sugestão do GTI.';
COMMENT ON COLUMN public.uasgs_cadastro.orgao_lido_em IS
  'Quando o órgão da UASG foi lido. Nulo: a UASG foi lida antes da migration 139 e volta para a fila.';

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
       -- Lida antes da migration 139: falta o órgão (sigla e esfera).
       OR (k.encontrada AND k.orgao_lido_em IS NULL)
     )
   ORDER BY k.lido_em NULLS FIRST, ci.uasg
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 2000));
$$;

REVOKE ALL ON FUNCTION public.uasgs_para_cadastrar(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uasgs_para_cadastrar(INTEGER) TO authenticated, service_role;

-- p_uasgs: array JSON (no máximo 200 por chamada) de
--   { "codigo_uasg": "927117", "nome": "EES-CORPO DE BOMB MILITAR EST. ESPÍRITO SANTO",
--     "municipio": "VITÓRIA", "sigla_uf": "ES", "ativa": true,
--     "codigo_orgao": 85633, "sigla_orgao": "CBMES/ES", "esfera_orgao": "E" }
-- Sem "nome": a UASG não foi achada. Com a chave "codigo_orgao" (mesmo nula): o órgão foi lido.
CREATE OR REPLACE FUNCTION public.gravar_cadastro_uasgs(p_uasgs JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item    JSONB;
  v_codigo  TEXT;
  v_nome    TEXT;
  v_uf      TEXT;
  v_orgao   INTEGER;
  v_sigla   TEXT;
  v_esfera  TEXT;
  v_leu_org BOOLEAN;
  v_total   INTEGER := 0;
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

    v_leu_org := v_item ? 'codigo_orgao';
    v_orgao := CASE WHEN jsonb_typeof(v_item->'codigo_orgao') = 'number' AND (v_item->>'codigo_orgao') ~ '^[1-9][0-9]{0,8}$'
                    THEN (v_item->>'codigo_orgao')::INTEGER END;
    v_sigla := NULLIF(left(btrim(COALESCE(v_item->>'sigla_orgao', '')), 80), '');
    v_esfera := upper(btrim(COALESCE(v_item->>'esfera_orgao', '')));
    IF v_esfera NOT IN ('F', 'E', 'M') THEN v_esfera := NULL; END IF;

    IF v_nome IS NOT NULL THEN
      INSERT INTO public.uasgs_cadastro (codigo_uasg, nome, municipio, sigla_uf, ativa, encontrada, lido_em,
                                         codigo_orgao, sigla_orgao, esfera_orgao, orgao_lido_em)
      VALUES (
        v_codigo, v_nome,
        NULLIF(left(btrim(COALESCE(v_item->>'municipio', '')), 120), ''),
        v_uf,
        CASE WHEN jsonb_typeof(v_item->'ativa') = 'boolean' THEN (v_item->>'ativa')::BOOLEAN END,
        TRUE, NOW(),
        v_orgao, v_sigla, v_esfera, CASE WHEN v_leu_org THEN NOW() END
      )
      ON CONFLICT (codigo_uasg) DO UPDATE
        SET nome = EXCLUDED.nome, municipio = EXCLUDED.municipio, sigla_uf = EXCLUDED.sigla_uf,
            ativa = EXCLUDED.ativa, encontrada = TRUE, lido_em = EXCLUDED.lido_em,
            -- Sem a leitura do órgão (função antiga), o que foi lido antes continua valendo.
            codigo_orgao  = CASE WHEN v_leu_org THEN EXCLUDED.codigo_orgao ELSE public.uasgs_cadastro.codigo_orgao END,
            sigla_orgao   = CASE WHEN v_leu_org THEN EXCLUDED.sigla_orgao ELSE public.uasgs_cadastro.sigla_orgao END,
            esfera_orgao  = CASE WHEN v_leu_org THEN EXCLUDED.esfera_orgao ELSE public.uasgs_cadastro.esfera_orgao END,
            orgao_lido_em = CASE WHEN v_leu_org THEN EXCLUDED.orgao_lido_em ELSE public.uasgs_cadastro.orgao_lido_em END;
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
-- 2) Grupo confirmado de cada UASG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uasgs_grupo_gti (
  codigo_uasg          VARCHAR(6)   PRIMARY KEY,
  grupo                VARCHAR(10)  NOT NULL,
  confirmado_por       UUID,
  confirmado_por_nome  VARCHAR(200),
  confirmado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uasgs_grupo_gti_codigo CHECK (codigo_uasg ~ '^[0-9]{6}$'),
  CONSTRAINT uasgs_grupo_gti_grupo CHECK (grupo IN ('LIGABOM', 'CNCG', 'CNPC', 'CONDPCI', 'CONSESP', 'OUTROS'))
);
COMMENT ON TABLE public.uasgs_grupo_gti IS
  'GTI do ComprasSUSP de cada UASG, confirmado pelo coordenador. Grava só por definir_grupos_uasgs.';

ALTER TABLE public.uasgs_grupo_gti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: uasgs_grupo_gti" ON public.uasgs_grupo_gti;
CREATE POLICY "Authenticated Read: uasgs_grupo_gti"
  ON public.uasgs_grupo_gti FOR SELECT TO authenticated USING (true);

-- Mesma trava das outras tabelas (migration 124): usuário desativado não lê nada.
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.uasgs_grupo_gti;
CREATE POLICY "Somente usuario ativo" ON public.uasgs_grupo_gti AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));

REVOKE ALL ON public.uasgs_grupo_gti FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.uasgs_grupo_gti TO authenticated;
GRANT ALL ON public.uasgs_grupo_gti TO service_role;

-- Auditoria: quem confirmou, trocou ou tirou o grupo fica em audit_logs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_uasgs_grupo_gti ON public.uasgs_grupo_gti;
    CREATE TRIGGER trg_audit_uasgs_grupo_gti
      AFTER INSERT OR UPDATE OR DELETE ON public.uasgs_grupo_gti
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- p_itens: array JSON (no máximo 600) de { "codigo_uasg": "927117", "grupo": "LIGABOM" }.
-- "grupo" nulo tira a confirmação. Devolve quantas UASGs mudaram.
CREATE OR REPLACE FUNCTION public.definir_grupos_uasgs(p_itens JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item   JSONB;
  v_codigo TEXT;
  v_grupo  TEXT;
  v_nome   TEXT;
  v_total  INTEGER := 0;
  v_n      INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador define o grupo das UASGs.'
      USING ERRCODE = '42501';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_itens deve ser um array JSON.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 600 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 600 UASGs por chamada.'
      USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);

  FOR v_item IN SELECT valor FROM jsonb_array_elements(p_itens) AS e(valor) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: cada item deve ser um objeto.' USING ERRCODE = '22023';
    END IF;
    v_codigo := btrim(COALESCE(v_item->>'codigo_uasg', ''));
    IF v_codigo !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: UASG inválida: %', v_codigo USING ERRCODE = '22023';
    END IF;
    v_grupo := NULLIF(upper(btrim(COALESCE(v_item->>'grupo', ''))), '');

    IF v_grupo IS NULL THEN
      DELETE FROM public.uasgs_grupo_gti WHERE codigo_uasg = v_codigo;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSE
      IF v_grupo NOT IN ('LIGABOM', 'CNCG', 'CNPC', 'CONDPCI', 'CONSESP', 'OUTROS') THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: grupo inválido: %', v_grupo USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.uasgs_grupo_gti (codigo_uasg, grupo, confirmado_por, confirmado_por_nome, confirmado_em)
      VALUES (v_codigo, v_grupo, auth.uid(), v_nome, NOW())
      ON CONFLICT (codigo_uasg) DO UPDATE
        SET grupo = EXCLUDED.grupo, confirmado_por = EXCLUDED.confirmado_por,
            confirmado_por_nome = EXCLUDED.confirmado_por_nome, confirmado_em = EXCLUDED.confirmado_em
        WHERE public.uasgs_grupo_gti.grupo IS DISTINCT FROM EXCLUDED.grupo;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    v_total := v_total + v_n;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.definir_grupos_uasgs(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_grupos_uasgs(JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3) Fatia de cada grupo nas atas
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ata_gti_fatias
WITH (security_invoker = true) AS
WITH participantes AS (
  SELECT split_part(c.item_key, '-', 1) AS numero_ata,
         split_part(c.item_key, '-', 2) AS uasg_gerenciadora,
         u->>'codigoUnidade'             AS uasg,
         CASE WHEN (u->>'quantidadeRegistrada') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN (u->>'quantidadeRegistrada')::NUMERIC ELSE 0 END AS quantidade
    FROM public.itens_ata_unidades_copia c,
         jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u
   WHERE (u->>'codigoUnidade') ~ '^[0-9]{6}$'
     AND (u->>'codigoUnidade') NOT IN ('200330', '200331')
     AND (u->>'codigoUnidade') <> split_part(c.item_key, '-', 2)
     AND COALESCE(u->>'tipoUnidade', '') <> 'GERENCIADORA'
)
SELECT p.numero_ata,
       p.uasg_gerenciadora,
       COALESCE(g.grupo, 'A_CONFIRMAR')::VARCHAR(12) AS grupo,
       SUM(p.quantidade)                              AS quantidade,
       COUNT(DISTINCT p.uasg)::INTEGER                AS orgaos
  FROM participantes p
  LEFT JOIN public.uasgs_grupo_gti g ON g.codigo_uasg = p.uasg
 GROUP BY p.numero_ata, p.uasg_gerenciadora, COALESCE(g.grupo, 'A_CONFIRMAR');

COMMENT ON VIEW public.v_ata_gti_fatias IS
  'Por ata: quantidade registrada dos órgãos participantes somada por GTI (sem SENASP, gerenciadora e adesões).';

REVOKE ALL ON public.v_ata_gti_fatias FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_ata_gti_fatias TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4) UASGs participantes, com cadastro e grupo (tela Ajustes › Grupos das UASGs)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_uasgs_participantes_gti
WITH (security_invoker = true) AS
WITH participantes AS (
  SELECT u->>'codigoUnidade' AS uasg,
         split_part(c.item_key, '-', 1) || '-' || split_part(c.item_key, '-', 2) AS ata,
         NULLIF(btrim(u->>'nomeUnidade'), '') AS nome_na_ata
    FROM public.itens_ata_unidades_copia c,
         jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u
   WHERE (u->>'codigoUnidade') ~ '^[0-9]{6}$'
     AND (u->>'codigoUnidade') NOT IN ('200330', '200331')
     AND (u->>'codigoUnidade') <> split_part(c.item_key, '-', 2)
     AND COALESCE(u->>'tipoUnidade', '') <> 'GERENCIADORA'
),
por_uasg AS (
  SELECT uasg, MAX(nome_na_ata) AS nome_na_ata, COUNT(DISTINCT ata)::INTEGER AS atas
    FROM participantes
   GROUP BY uasg
  UNION ALL
  -- Grupo confirmado de UASG que deixou de aparecer nos itens continua na lista.
  SELECT g.codigo_uasg, NULL, 0
    FROM public.uasgs_grupo_gti g
   WHERE NOT EXISTS (SELECT 1 FROM participantes p WHERE p.uasg = g.codigo_uasg)
)
SELECT pu.uasg::VARCHAR(6)   AS codigo_uasg,
       COALESCE(k.nome, pu.nome_na_ata) AS nome,
       pu.nome_na_ata,
       k.sigla_uf,
       k.municipio,
       k.sigla_orgao,
       k.esfera_orgao,
       pu.atas,
       g.grupo,
       g.confirmado_por_nome,
       g.confirmado_em
  FROM por_uasg pu
  LEFT JOIN public.uasgs_cadastro k ON k.codigo_uasg = pu.uasg AND k.encontrada
  LEFT JOIN public.uasgs_grupo_gti g ON g.codigo_uasg = pu.uasg;

COMMENT ON VIEW public.v_uasgs_participantes_gti IS
  'UASGs que participam de itens das atas (sem SENASP, gerenciadora e adesões), com cadastro e GTI confirmado.';

REVOKE ALL ON public.v_uasgs_participantes_gti FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_uasgs_participantes_gti TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5) Fatia de cada grupo em cada item (aba Itens da carteira), mesmas regras da v_ata_gti_fatias
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_item_gti_fatias
WITH (security_invoker = true) AS
WITH participantes AS (
  SELECT c.item_key,
         u->>'codigoUnidade' AS uasg,
         CASE WHEN (u->>'quantidadeRegistrada') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN (u->>'quantidadeRegistrada')::NUMERIC ELSE 0 END AS quantidade
    FROM public.itens_ata_unidades_copia c,
         jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u
   WHERE (u->>'codigoUnidade') ~ '^[0-9]{6}$'
     AND (u->>'codigoUnidade') NOT IN ('200330', '200331')
     AND (u->>'codigoUnidade') <> split_part(c.item_key, '-', 2)
     AND COALESCE(u->>'tipoUnidade', '') <> 'GERENCIADORA'
)
SELECT p.item_key,
       COALESCE(g.grupo, 'A_CONFIRMAR')::VARCHAR(12) AS grupo,
       SUM(p.quantidade)                              AS quantidade,
       COUNT(DISTINCT p.uasg)::INTEGER                AS orgaos
  FROM participantes p
  LEFT JOIN public.uasgs_grupo_gti g ON g.codigo_uasg = p.uasg
 GROUP BY p.item_key, COALESCE(g.grupo, 'A_CONFIRMAR');

COMMENT ON VIEW public.v_item_gti_fatias IS
  'Por item da ata: quantidade registrada dos órgãos participantes somada por GTI (sem SENASP, gerenciadora e adesões).';

REVOKE ALL ON public.v_item_gti_fatias FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_item_gti_fatias TO authenticated, service_role;
