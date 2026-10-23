-- ==============================================================================
-- MIGRATION 164: EMENDAS PARLAMENTARES — ENTREGA 4 (NOTA DE EMPENHO E EXECUÇÃO DE CADA LINHA)
-- Versão: 20261023000164_emendas_notas_e_execucao.sql
--
-- A CAEP não digita a nota de empenho das emendas que vieram das planilhas (a planilha traz o documento SEI do
-- empenho, não o número da nota). O sistema acha a nota sozinho, porque o plano interno (PI) da nota traz a emenda:
-- 'SP999S93084 - DIEGO GARCIA 202630840008' = ano do orçamento (2026) + emenda (30840008); o código SP999S9XXXX
-- traz os 4 primeiros dígitos da emenda (o autor). Medição de 23/10/2026: 1.406 de 2.134 linhas empenhadas (66%)
-- com uma nota só.
--
-- Regras, em ordem, só com notas do ano do pedido (o ano da NOTA; o ano do PI é o do orçamento e pode ser o anterior):
--   CONTRATO: nota ligada ao contrato citado na linha, com a emenda no PI;
--   ITEM:     nota ligada a um contrato que tem o item da ata da linha, com a emenda no PI;
--   AUTOR:    nota ligada a um contrato que tem o item, sem emenda no texto do PI mas com o autor no código do PI.
-- Se uma regra acha mais de uma nota, a linha fica sem nota com o motivo VARIAS (não se escolhe ao acaso).
--
-- 1) emenda_linha_notas: uma linha por linha empenhada do pedido, com a nota achada (ou o motivo de não achar) e a
--    execução copiada da nota (empenhado, liquidado, pago) e a próxima entrega prevista do contrato (informada pelo
--    gestor do contrato). Copiar evita que o perfil gestor de emendas precise ler contratos e entregas.
-- 2) emendas_ligar_notas(): refaz tudo de uma vez (consulta em conjunto; a versão com subconsulta por linha passava
--    de 3 minutos). Roda pelo cron às :58, depois da leitura das notas (:45/:50) e do vínculo automático (:55).
--    A nota digitada pela CAEP no empenho (emenda_pedido_linhas.nota_empenho) continua valendo mais nas telas.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.emenda_linha_notas (
  linha_id               UUID          PRIMARY KEY REFERENCES public.emenda_pedido_linhas(id) ON DELETE CASCADE,
  empenho_id             UUID          REFERENCES public.empenhos(id) ON DELETE SET NULL,
  nota                   VARCHAR(50),
  regra                  VARCHAR(10),
  motivo                 VARCHAR(20),
  contract_key           VARCHAR(100),
  valor_empenhado        NUMERIC(18, 2),
  valor_liquidado        NUMERIC(18, 2),
  valor_pago             NUMERIC(18, 2),
  entrega_prevista       DATE,
  entrega_prevista_valor NUMERIC(18, 2),
  atualizado_em          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_linha_notas_regra CHECK (regra IS NULL OR regra IN ('CONTRATO', 'ITEM', 'AUTOR')),
  CONSTRAINT emenda_linha_notas_motivo CHECK (motivo IS NULL OR motivo IN ('SEM_CONTRATO', 'CONTRATO_FORA', 'CONTRATO_SEM_NOTA', 'OUTRAS_EMENDAS', 'VARIAS', 'SEM_EMENDA')),
  CONSTRAINT emenda_linha_notas_nota_ou_motivo CHECK ((empenho_id IS NOT NULL AND regra IS NOT NULL AND motivo IS NULL) OR (empenho_id IS NULL AND motivo IS NOT NULL))
);
COMMENT ON TABLE public.emenda_linha_notas IS
  'Nota de empenho achada para cada linha empenhada das emendas (pelo plano interno) e a execução dela. Refeita por emendas_ligar_notas().';
CREATE INDEX IF NOT EXISTS ix_emenda_linha_notas_empenho ON public.emenda_linha_notas (empenho_id) WHERE empenho_id IS NOT NULL;

ALTER TABLE public.emenda_linha_notas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_linha_notas" ON public.emenda_linha_notas;
CREATE POLICY "Leitura das emendas: emenda_linha_notas" ON public.emenda_linha_notas FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_linha_notas;
CREATE POLICY "Somente usuario ativo" ON public.emenda_linha_notas AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_linha_notas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_linha_notas TO authenticated;
GRANT ALL ON public.emenda_linha_notas TO service_role;

CREATE OR REPLACE FUNCTION public.emendas_ligar_notas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_res  JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador atualizam as notas.' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_emenda_notas (
    linha_id UUID PRIMARY KEY, empenho_id UUID, regra TEXT, motivo TEXT, contract_key TEXT
  ) ON COMMIT DROP;
  TRUNCATE tmp_emenda_notas;

  WITH l AS (
    SELECT l.id, l.item_key, l.contrato_numero, p.siop_emenda AS emenda,
           EXTRACT(YEAR FROM COALESCE(p.empenhado_em, (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE))::INTEGER AS ano
      FROM public.emenda_pedido_linhas l
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id
     WHERE NOT l.cancelada AND p.etapa = 'EMPENHADO' AND l.item_key IS NOT NULL),
  ne AS (
    SELECT e.id, e.ano_exercicio, ce.contract_key, co.numero AS contrato,
           substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') AS emenda_txt,
           substring(e.plano_interno from '^SP999S?9?([0-9]{4})') AS autor_pi
      FROM public.empenhos e
      JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
      JOIN public.contratos_oficiais co ON co.contract_key = ce.contract_key),
  ic AS (SELECT DISTINCT item_key, contract_key FROM public.arp_item_contract_links),
  a AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ne ON ne.contrato = l.contrato_numero AND ne.emenda_txt = l.emenda AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  b AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt = l.emenda AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  c AS (SELECT l.id, count(DISTINCT ne.id) n, (array_agg(ne.id))[1] empenho_id, (array_agg(ne.contract_key))[1] contract_key
          FROM l JOIN ic ON ic.item_key = l.item_key JOIN ne ON ne.contract_key = ic.contract_key
         WHERE ne.emenda_txt IS NULL AND ne.autor_pi = substr(l.emenda, 1, 4) AND ne.ano_exercicio = l.ano
         GROUP BY l.id),
  ctr AS (SELECT DISTINCT co.numero, co.contract_key,
                 EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.contract_key = co.contract_key) AS tem_nota
            FROM public.contratos_oficiais co WHERE co.uasg = '200331')
  INSERT INTO tmp_emenda_notas (linha_id, empenho_id, regra, motivo, contract_key)
  SELECT l.id,
         CASE WHEN a.n = 1 THEN a.empenho_id WHEN COALESCE(a.n, 0) = 0 AND b.n = 1 THEN b.empenho_id
              WHEN COALESCE(a.n, 0) = 0 AND COALESCE(b.n, 0) = 0 AND c.n = 1 THEN c.empenho_id END,
         CASE WHEN a.n = 1 THEN 'CONTRATO' WHEN COALESCE(a.n, 0) = 0 AND b.n = 1 THEN 'ITEM'
              WHEN COALESCE(a.n, 0) = 0 AND COALESCE(b.n, 0) = 0 AND c.n = 1 THEN 'AUTOR' END,
         CASE WHEN a.n = 1 OR (COALESCE(a.n, 0) = 0 AND b.n = 1) OR (COALESCE(a.n, 0) = 0 AND COALESCE(b.n, 0) = 0 AND c.n = 1) THEN NULL
              WHEN a.n > 1 OR b.n > 1 OR c.n > 1 THEN 'VARIAS'
              WHEN l.emenda IS NULL THEN 'SEM_EMENDA'
              WHEN l.contrato_numero IS NULL THEN 'SEM_CONTRATO'
              WHEN ctr.contract_key IS NULL THEN 'CONTRATO_FORA'
              WHEN NOT ctr.tem_nota THEN 'CONTRATO_SEM_NOTA'
              ELSE 'OUTRAS_EMENDAS' END,
         CASE WHEN a.n = 1 THEN a.contract_key WHEN COALESCE(a.n, 0) = 0 AND b.n = 1 THEN b.contract_key
              WHEN COALESCE(a.n, 0) = 0 AND COALESCE(b.n, 0) = 0 AND c.n = 1 THEN c.contract_key ELSE ctr.contract_key END
    FROM l
    LEFT JOIN a ON a.id = l.id
    LEFT JOIN b ON b.id = l.id
    LEFT JOIN c ON c.id = l.id
    LEFT JOIN ctr ON ctr.numero = l.contrato_numero;

  DELETE FROM public.emenda_linha_notas n WHERE NOT EXISTS (SELECT 1 FROM tmp_emenda_notas t WHERE t.linha_id = n.linha_id);

  INSERT INTO public.emenda_linha_notas AS d (linha_id, empenho_id, nota, regra, motivo, contract_key, valor_empenhado, valor_liquidado,
                                              valor_pago, entrega_prevista, entrega_prevista_valor, atualizado_em)
  SELECT t.linha_id, t.empenho_id, e.numero_oficial, t.regra, t.motivo, t.contract_key, e.valor_empenhado, e.valor_liquidado, e.valor_pago,
         ep.data_prevista, ep.valor, NOW()
    FROM tmp_emenda_notas t
    LEFT JOIN public.empenhos e ON e.id = t.empenho_id
    LEFT JOIN LATERAL (
      SELECT x.data_prevista, x.valor FROM public.contrato_entregas_previstas x
       WHERE x.contract_key = t.contract_key AND x.situacao = 'PREVISTA' AND x.data_prevista >= v_hoje
         AND (x.empenho_canonical_key IS NULL OR x.empenho_canonical_key = e.canonical_key)
       ORDER BY x.data_prevista LIMIT 1) ep ON TRUE
  ON CONFLICT (linha_id) DO UPDATE SET
    empenho_id = EXCLUDED.empenho_id, nota = EXCLUDED.nota, regra = EXCLUDED.regra, motivo = EXCLUDED.motivo,
    contract_key = EXCLUDED.contract_key, valor_empenhado = EXCLUDED.valor_empenhado, valor_liquidado = EXCLUDED.valor_liquidado,
    valor_pago = EXCLUDED.valor_pago, entrega_prevista = EXCLUDED.entrega_prevista, entrega_prevista_valor = EXCLUDED.entrega_prevista_valor,
    atualizado_em = EXCLUDED.atualizado_em;

  SELECT jsonb_build_object('linhas', count(*), 'com_nota', count(*) FILTER (WHERE empenho_id IS NOT NULL),
                            'por_motivo', (SELECT jsonb_object_agg(motivo, n) FROM (SELECT motivo, count(*) n FROM public.emenda_linha_notas WHERE motivo IS NOT NULL GROUP BY 1) s))
    INTO v_res FROM public.emenda_linha_notas;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_ligar_notas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_ligar_notas() TO authenticated, service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ligar-notas-das-emendas';
    PERFORM cron.schedule('ligar-notas-das-emendas', '58 * * * *', $c$SELECT public.emendas_ligar_notas()$c$);
  END IF;
END
$cron$;

-- Primeira ligação, já na aplicação da migration.
SELECT public.emendas_ligar_notas();
