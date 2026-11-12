-- ==============================================================================
-- Versão: 20261028000238_atas_a_montar.sql
-- Atas a montar, entrega 1: o que o servidor lê do PNCP antes de a ata existir (protótipo aprovado em
-- 28/10/2026, D1 a D8).
--
-- Depois da homologação de um pregão de registro de preços da SENASP, e antes da publicação da ata, o gestor monta
-- os quadros da ata (preços, gerenciador e participantes) para copiar ao SEI. O servidor (recurso 'atas_a_montar',
-- src/services/atasAMontarSyncService.ts) lê:
--   - o resultado de cada item da compra no PNCP (fornecedor, quantidade homologada, preços);
--   - a minuta da ata do edital (Anexo III): descrição e CATMAT dos itens, quantidade do gerenciador e de cada
--     órgão participante. A leitura de um item só vale quando a soma dos órgãos fecha com o total do PNCP.
--
--   1. atas_a_montar_compras: uma linha por compra, com os itens (e resultados) e a leitura da minuta. Só o
--      servidor grava (gravar_ata_a_montar_compra).
--   2. atas_a_montar_rascunhos: o que o gestor preenche na tela (fornecedor, marca, divisão interna...), por
--      compra e fornecedor. Grava pelo salvar_rascunho_ata_a_montar (gestor e coordenador).
--   3. v_atas_a_montar: uma linha por fornecedor vencedor que ainda não tem ata no banco (a linha some quando a
--      ata é publicada e chega pela sincronização de atas).
--   4. atas_a_montar_para_ler(): a fila do servidor.
--   5. Agendamento de 2 em 2 horas, no minuto 52 (a trava do banco exige 1 hora entre leituras).
--
-- Nada que já existe muda. O recurso só funciona depois de publicar a função sincronizar-fontes.
-- ==============================================================================

-- 1. Compras lidas pelo servidor -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.atas_a_montar_compras (
  numero_controle_compra VARCHAR(40)  PRIMARY KEY CHECK (numero_controle_compra ~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}$'),
  codigo_uasg            VARCHAR(6)   NOT NULL,
  ano_compra             INTEGER      NOT NULL,
  sequencial_compra      INTEGER      NOT NULL,
  numero_compra          VARCHAR(20),
  processo               VARCHAR(40),
  objeto                 TEXT,
  -- [{numero, descricao, unidade, quantidade, situacao,
  --   resultados: [{fornecedor_ni, fornecedor_nome, quantidade, valor_unitario, valor_total, data_resultado}]}]
  itens                  JSONB        NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(itens) = 'array'),
  itens_lidos_em         TIMESTAMPTZ,
  -- PENDENTE (ainda não lida) | LIDA (todas as somas fecham) | A_CONFERIR (algum item não fecha) |
  -- SEM_MINUTA (o edital não tem a seção 3) | ERRO (a leitura falhou TENTATIVAS vezes)
  minuta_estado          VARCHAR(12)  NOT NULL DEFAULT 'PENDENTE'
                          CHECK (minuta_estado IN ('PENDENTE', 'LIDA', 'A_CONFERIR', 'SEM_MINUTA', 'ERRO')),
  -- {arquivo, modelo, avisos[], itens: {"<n>": {descricao, catmat, gerenciador, participantes: [{uasg, nome, quantidade}], fecha}}}
  minuta                 JSONB,
  minuta_tentativas      INTEGER      NOT NULL DEFAULT 0,
  minuta_lida_em         TIMESTAMPTZ,
  detectada_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.atas_a_montar_compras IS
  'Pregões de registro de preços da SENASP homologados no PNCP, lidos pelo servidor para montar a ata antes da publicação (migration 238): itens com resultado e leitura da minuta do edital. Só o servidor grava.';

ALTER TABLE public.atas_a_montar_compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: atas_a_montar_compras" ON public.atas_a_montar_compras;
CREATE POLICY "Authenticated Read: atas_a_montar_compras" ON public.atas_a_montar_compras FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.atas_a_montar_compras;
CREATE POLICY "Somente usuario ativo" ON public.atas_a_montar_compras AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.atas_a_montar_compras FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.atas_a_montar_compras TO authenticated;
GRANT ALL ON public.atas_a_montar_compras TO service_role;

-- 2. Rascunho do gestor ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atas_a_montar_rascunhos (
  numero_controle_compra VARCHAR(40)  NOT NULL REFERENCES public.atas_a_montar_compras (numero_controle_compra) ON DELETE CASCADE,
  -- Identificador como o PNCP usa: CNPJ (14 dígitos) ou ESTRANG… para empresa estrangeira.
  fornecedor_ni          VARCHAR(30)  NOT NULL,
  dados                  JSONB        NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(dados) = 'object'),
  atualizado_por         UUID,
  atualizado_por_nome    TEXT,
  atualizado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (numero_controle_compra, fornecedor_ni)
);
COMMENT ON TABLE public.atas_a_montar_rascunhos IS
  'O que o gestor preenche na montagem da ata (fornecedor, marca, CATMAT, divisão interna, opções dos quadros), por compra e fornecedor (migration 238). Grava só pelo salvar_rascunho_ata_a_montar.';

ALTER TABLE public.atas_a_montar_rascunhos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: atas_a_montar_rascunhos" ON public.atas_a_montar_rascunhos;
CREATE POLICY "Authenticated Read: atas_a_montar_rascunhos" ON public.atas_a_montar_rascunhos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.atas_a_montar_rascunhos;
CREATE POLICY "Somente usuario ativo" ON public.atas_a_montar_rascunhos AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.atas_a_montar_rascunhos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.atas_a_montar_rascunhos TO authenticated;
GRANT ALL ON public.atas_a_montar_rascunhos TO service_role;

-- 3. Fornecedores vencedores sem ata ------------------------------------------
-- A ata está publicada quando o banco já tem, da mesma compra, uma ata com item desse fornecedor, ou uma ata com o
-- fornecedor indicado pelo coordenador (atas_fornecedor_pncp, migration 107), ou quando a compra já tem tantas atas
-- quanto fornecedores vencedores (o PNCP não diz o fornecedor da ata).
CREATE OR REPLACE VIEW public.v_atas_a_montar
WITH (security_invoker = true) AS
WITH resultados AS (
  SELECT c.numero_controle_compra,
         (i ->> 'numero')::INTEGER                       AS numero_item,
         r ->> 'fornecedor_ni'                           AS fornecedor_ni,
         r ->> 'fornecedor_nome'                         AS fornecedor_nome,
         NULLIF(r ->> 'valor_total', '')::NUMERIC        AS valor_total,
         NULLIF(left(r ->> 'data_resultado', 10), '')::DATE AS data_resultado,
         COALESCE((c.minuta -> 'itens' -> (i ->> 'numero') ->> 'fecha')::BOOLEAN, FALSE) AS minuta_fecha
    FROM public.atas_a_montar_compras c
    CROSS JOIN LATERAL jsonb_array_elements(c.itens) i
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i -> 'resultados', '[]'::JSONB)) r
   WHERE COALESCE(r ->> 'fornecedor_ni', '') <> ''
),
por_fornecedor AS (
  SELECT numero_controle_compra, fornecedor_ni,
         max(fornecedor_nome)                       AS fornecedor_nome,
         count(DISTINCT numero_item)::INTEGER       AS itens,
         sum(valor_total)                           AS valor_total,
         max(data_resultado)                        AS homologado_em,
         count(DISTINCT numero_item) FILTER (WHERE NOT minuta_fecha)::INTEGER AS itens_a_conferir
    FROM resultados
   GROUP BY numero_controle_compra, fornecedor_ni
),
atas_da_compra AS (
  SELECT a.id, split_part(a.numero_controle_pncp, '-', 1) || '-1-' || split_part(a.numero_controle_pncp, '-', 3) AS compra
    FROM public.atas_registro_preco a
   WHERE a.numero_controle_pncp ~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}-[0-9]{6}$'
)
SELECT f.numero_controle_compra,
       c.codigo_uasg,
       c.numero_compra,
       c.ano_compra,
       c.processo,
       c.objeto,
       f.fornecedor_ni,
       f.fornecedor_nome,
       f.itens,
       f.valor_total,
       f.homologado_em,
       c.minuta_estado,
       CASE WHEN c.minuta_estado IN ('LIDA', 'A_CONFERIR') THEN f.itens_a_conferir ELSE f.itens END AS itens_a_conferir,
       r.atualizado_em       AS rascunho_atualizado_em,
       r.atualizado_por_nome AS rascunho_atualizado_por_nome
  FROM por_fornecedor f
  JOIN public.atas_a_montar_compras c ON c.numero_controle_compra = f.numero_controle_compra
  LEFT JOIN public.atas_a_montar_rascunhos r
         ON r.numero_controle_compra = f.numero_controle_compra AND r.fornecedor_ni = f.fornecedor_ni
 WHERE NOT EXISTS (
         SELECT 1
           FROM atas_da_compra a
           JOIN public.itens_ata i ON i.ata_id = a.id
          WHERE a.compra = f.numero_controle_compra
            AND (upper(btrim(i.fornecedor_cnpj_cpf)) = upper(btrim(f.fornecedor_ni))
                 OR (length(regexp_replace(f.fornecedor_ni, '\D', '', 'g')) >= 11
                     AND regexp_replace(i.fornecedor_cnpj_cpf, '\D', '', 'g') = regexp_replace(f.fornecedor_ni, '\D', '', 'g'))))
   AND NOT EXISTS (
         SELECT 1 FROM public.atas_fornecedor_pncp p
          WHERE p.numero_controle_pncp_compra = f.numero_controle_compra
            AND upper(btrim(p.fornecedor_identificador)) = upper(btrim(f.fornecedor_ni)))
   AND (SELECT count(*) FROM atas_da_compra a WHERE a.compra = f.numero_controle_compra)
       < (SELECT count(*) FROM por_fornecedor o WHERE o.numero_controle_compra = f.numero_controle_compra);
COMMENT ON VIEW public.v_atas_a_montar IS
  'Uma linha por fornecedor vencedor de pregão de registro de preços da SENASP que ainda não tem ata no banco (migration 238). Some quando a ata chega pela sincronização de atas.';
REVOKE ALL ON public.v_atas_a_montar FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_atas_a_montar TO authenticated, service_role;

-- 4. Fila do servidor -----------------------------------------------------------
-- Compras já conhecidas e se ainda há fornecedor sem ata (as encerradas não são relidas).
CREATE OR REPLACE FUNCTION public.atas_a_montar_para_ler()
RETURNS TABLE (
  numero_controle_compra TEXT,
  itens_lidos_em         TIMESTAMPTZ,
  minuta_estado          TEXT,
  minuta_tentativas      INTEGER,
  tem_fornecedor_sem_ata BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor lê a fila das atas a montar.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.numero_controle_compra::TEXT, c.itens_lidos_em, c.minuta_estado::TEXT, c.minuta_tentativas,
         (jsonb_array_length(c.itens) = 0
          OR EXISTS (SELECT 1 FROM public.v_atas_a_montar v WHERE v.numero_controle_compra = c.numero_controle_compra))
    FROM public.atas_a_montar_compras c;
END;
$$;
REVOKE ALL ON FUNCTION public.atas_a_montar_para_ler() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atas_a_montar_para_ler() TO service_role;

-- 5. Gravação pelo servidor -----------------------------------------------------
-- p_compra: {numero_controle_compra, codigo_uasg, ano_compra, sequencial_compra, numero_compra, processo, objeto,
--            itens?: [...], minuta?: {estado, leitura?}}. Sem "itens", os itens gravados ficam como estão; sem
--            "minuta", a leitura gravada fica como está. minuta.estado = 'FALHOU' conta uma tentativa (na 2ª vira ERRO).
CREATE OR REPLACE FUNCTION public.gravar_ata_a_montar_compra(p_compra JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_controle TEXT := btrim(COALESCE(p_compra ->> 'numero_controle_compra', ''));
  v_itens    JSONB := p_compra -> 'itens';
  v_minuta   JSONB := p_compra -> 'minuta';
  v_estado   TEXT := upper(COALESCE(v_minuta ->> 'estado', ''));
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava as atas a montar.' USING ERRCODE = '42501';
  END IF;
  IF v_controle !~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Número de controle da compra inválido: %', v_controle USING ERRCODE = '22023';
  END IF;
  IF v_itens IS NOT NULL AND jsonb_typeof(v_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: itens deve ser uma lista.' USING ERRCODE = '22023';
  END IF;
  IF v_minuta IS NOT NULL AND v_estado NOT IN ('LIDA', 'A_CONFERIR', 'SEM_MINUTA', 'FALHOU') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Estado da minuta inválido: %', v_estado USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.atas_a_montar_compras AS c
    (numero_controle_compra, codigo_uasg, ano_compra, sequencial_compra, numero_compra, processo, objeto,
     itens, itens_lidos_em)
  VALUES
    (v_controle, left(btrim(COALESCE(p_compra ->> 'codigo_uasg', '')), 6),
     (p_compra ->> 'ano_compra')::INTEGER, (p_compra ->> 'sequencial_compra')::INTEGER,
     NULLIF(btrim(COALESCE(p_compra ->> 'numero_compra', '')), ''), NULLIF(btrim(COALESCE(p_compra ->> 'processo', '')), ''),
     NULLIF(btrim(COALESCE(p_compra ->> 'objeto', '')), ''),
     COALESCE(v_itens, '[]'::JSONB), CASE WHEN v_itens IS NOT NULL THEN NOW() END)
  ON CONFLICT (numero_controle_compra) DO UPDATE
    SET numero_compra  = COALESCE(EXCLUDED.numero_compra, c.numero_compra),
        processo       = COALESCE(EXCLUDED.processo, c.processo),
        objeto         = COALESCE(EXCLUDED.objeto, c.objeto),
        itens          = CASE WHEN v_itens IS NOT NULL THEN EXCLUDED.itens ELSE c.itens END,
        itens_lidos_em = CASE WHEN v_itens IS NOT NULL THEN NOW() ELSE c.itens_lidos_em END,
        atualizado_em  = NOW();

  IF v_minuta IS NOT NULL THEN
    IF v_estado = 'FALHOU' THEN
      UPDATE public.atas_a_montar_compras
         SET minuta_tentativas = minuta_tentativas + 1,
             minuta_estado = CASE WHEN minuta_tentativas + 1 >= 2 THEN 'ERRO' ELSE minuta_estado END,
             minuta = jsonb_build_object('erro', left(COALESCE(v_minuta ->> 'erro', ''), 500)),
             minuta_lida_em = NOW(), atualizado_em = NOW()
       WHERE numero_controle_compra = v_controle;
    ELSE
      UPDATE public.atas_a_montar_compras
         SET minuta_estado = v_estado,
             minuta = v_minuta -> 'leitura',
             minuta_tentativas = minuta_tentativas + 1,
             minuta_lida_em = NOW(), atualizado_em = NOW()
       WHERE numero_controle_compra = v_controle;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'numero_controle_compra', v_controle);
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_ata_a_montar_compra(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_ata_a_montar_compra(JSONB) TO service_role;

-- 6. Rascunho: gestor e coordenador --------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_rascunho_ata_a_montar(p_compra TEXT, p_fornecedor_ni TEXT, p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_compra TEXT := btrim(COALESCE(p_compra, ''));
  v_ni     TEXT := btrim(COALESCE(p_fornecedor_ni, ''));
  v_em     TIMESTAMPTZ := NOW();
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: A ata é montada pelo gestor da ata ou pelo coordenador.' USING ERRCODE = '42501';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Dados da ata inválidos.' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_dados::TEXT) > 200000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Os dados da ata passaram do tamanho máximo.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.v_atas_a_montar v WHERE v.numero_controle_compra = v_compra AND v.fornecedor_ni = v_ni) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Esta ata não está mais a montar (já publicada ou fornecedor fora do resultado). Recarregue a tela.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.atas_a_montar_rascunhos (numero_controle_compra, fornecedor_ni, dados, atualizado_por, atualizado_por_nome, atualizado_em)
  VALUES (v_compra, v_ni, p_dados, auth.uid(), public.nome_do_usuario_logado(), v_em)
  ON CONFLICT (numero_controle_compra, fornecedor_ni) DO UPDATE
    SET dados = EXCLUDED.dados, atualizado_por = EXCLUDED.atualizado_por,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = EXCLUDED.atualizado_em;

  RETURN jsonb_build_object('success', true, 'atualizado_em', v_em);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_rascunho_ata_a_montar(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_rascunho_ata_a_montar(TEXT, TEXT, JSONB) TO authenticated, service_role;

-- 7. Agendamento ----------------------------------------------------------------
-- De 2 em 2 horas, no minuto 52 (livre): a trava do banco (reservar_sincronizacao) exige ao menos 1 hora entre
-- leituras do mesmo recurso, então "de hora em hora" pularia execuções.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-atas-a-montar';
    PERFORM cron.schedule('sincronizar-atas-a-montar', '52 */2 * * *', $c$SELECT public.disparar_sincronizacao('atas_a_montar', '000000')$c$);
  END IF;
END $$;
