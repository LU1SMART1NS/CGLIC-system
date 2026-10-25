-- ==============================================================================
-- MIGRATION 183: NOTAS DAS EMENDAS PARLAMENTARES TRAZIDAS PELO TESOURO
-- Versão: 20261025000183_notas_das_emendas_pelo_tesouro.sql
--
-- Por que (medição de 25/10/2026): os despachos de empenho do SEI dos pedidos citam 306 notas; 127 não
-- existem em `empenhos` e outras 71 existem só como a nota de mesmo número da outra UG (o número se repete em 200330 e
-- 200331, e a da 200331 é outra despesa: diárias, Miranda Turismo etc.). As notas das emendas são da UG 200330, e
-- `empenhos` só recebe nota pela lista de empenhos de cada contrato no Contratos.gov.br (recurso 'empenhos'): os
-- contratos são da UASG 200331, foram lidos com sucesso entre 21 e 24/10 e a nota da emenda não está neles (o
-- Tesouro tem 471 notas da 200330 em 2026; o sistema, 142). Sem a nota em `empenhos`, a leitura do Portal da
-- Transparência (notas_para_ler_no_siafi, migration 182) não a lê, porque grava por empenho_id.
--
-- O Tesouro (API aberta do STA, /api/empenho/{UG}00001{NE}) dá de cada nota o credor, a data, a natureza e o plano
-- interno, que traz o número da emenda (ou o código do autor). Ensaio de 25/10/2026: das 198 notas a trazer, 181 têm na
-- 200330 o plano interno da emenda que o SEI cita (165 pelo número da emenda, 16 pelo código do autor) e são gravadas;
-- 17 ficam de fora com o motivo registrado: 13 o STA não devolve na 200330, 3 têm na 200330 o plano de outra emenda e
-- 1 é uma nota de 2025 de outra despesa. Detalhes em docs/estudos/notas-das-emendas-pelo-tesouro.md.
--
-- 1) empenhos.fonte_origem aceita 'TESOURO'. A chave canônica é a mesma do Contratos.gov.br ({UG}-{ano}-{2026NE169}):
--    se a nota chegar depois por um contrato, save_empenho_soberano_atomic atualiza a mesma linha e ela vira
--    SINCRONIZADO (nada duplica).
-- 2) nota_casa_com_emenda(plano_interno, emenda): a mesma regra da migration 177 — o número da emenda no plano interno
--    ou, quando o texto vem cortado, o código do autor (SP999S9 + 4 primeiros dígitos da emenda).
-- 3) emenda_notas_tesouro_tentativas: o que o servidor já perguntou ao Tesouro, para não repetir a cada execução.
-- 4) notas_das_emendas_a_trazer(): números citados no SEI (etapa EMPENHO) sem nota da emenda em `empenhos`.
-- 5) gravar_notas_do_tesouro(consultadas, notas): só o servidor. Recebe as respostas do STA nas duas UGs e grava só
--    a nota cuja UG tem o plano interno da emenda, que existe no saldo contábil (migration 128) e que ainda não está em
--    `empenhos` (nunca sobrescreve uma nota do Contratos.gov.br). Valores pelo saldo contábil.
-- 6) notas_para_ler_no_siafi: a nota citada no SEI entra pela UG certa (antes, pelo número, entrava também a homônima
--    da outra UG).
-- Nada muda em contratos, faturas, pagamentos ou no Financeiro (que só mostra nota com contrato).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Fonte 'TESOURO'
-- ------------------------------------------------------------------------------
ALTER TABLE public.empenhos DROP CONSTRAINT IF EXISTS empenhos_fonte_origem_check;
ALTER TABLE public.empenhos ADD CONSTRAINT empenhos_fonte_origem_check
  CHECK (fonte_origem IN ('COMPRASNET', 'CONTRATOSNET', 'PNCP', 'MANUAL', 'SINCRONIZADO', 'TESOURO'));

-- ------------------------------------------------------------------------------
-- 2) A nota é da emenda?
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nota_casa_com_emenda(p_plano_interno TEXT, p_emenda TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(p_emenda ~ '^[0-9]{8}$' AND (
           substring(p_plano_interno from '20[0-9]{2}([0-9]{8})') = p_emenda
        OR substring(p_plano_interno from '^SP999S?9?([0-9]{4})') = left(p_emenda, 4)), FALSE);
$$;

COMMENT ON FUNCTION public.nota_casa_com_emenda(TEXT, TEXT) IS
  'Plano interno da nota com o número da emenda (20AA + 8 dígitos) ou com o código do autor (SP999S9 + 4 primeiros dígitos da emenda), como na migration 177.';

REVOKE ALL ON FUNCTION public.nota_casa_com_emenda(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nota_casa_com_emenda(TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) Tentativas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_notas_tesouro_tentativas (
  numero_oficial  VARCHAR(12) PRIMARY KEY,
  situacao        VARCHAR(30) NOT NULL,
  ug              VARCHAR(6),
  detalhe         TEXT,
  tentativa_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_notas_tesouro_tentativas_situacao CHECK (situacao IN
    ('GRAVADA', 'JA_EXISTIA', 'TESOURO_SEM_A_NOTA', 'SEM_PLANO_DA_EMENDA', 'AS_DUAS_UGS', 'SEM_SALDO_CONTABIL'))
);

COMMENT ON TABLE public.emenda_notas_tesouro_tentativas IS
  'Última consulta ao Tesouro de cada nota citada no SEI das emendas e o resultado (migration 183). Escrita só por gravar_notas_do_tesouro.';

ALTER TABLE public.emenda_notas_tesouro_tentativas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura para logados: emenda_notas_tesouro_tentativas" ON public.emenda_notas_tesouro_tentativas;
CREATE POLICY "Leitura para logados: emenda_notas_tesouro_tentativas" ON public.emenda_notas_tesouro_tentativas
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.emenda_notas_tesouro_tentativas FROM PUBLIC, anon;
GRANT SELECT ON public.emenda_notas_tesouro_tentativas TO authenticated;
GRANT ALL ON public.emenda_notas_tesouro_tentativas TO service_role;

-- ------------------------------------------------------------------------------
-- 4) O que falta trazer
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notas_das_emendas_a_trazer(p_reconsulta INTERVAL DEFAULT INTERVAL '1 day')
RETURNS TABLE (numero_oficial VARCHAR, emendas TEXT[], tentativa_em TIMESTAMPTZ, situacao VARCHAR)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH citadas AS (
    SELECT upper(btrim(d.nota_empenho)) AS numero, array_agg(DISTINCT p.siop_emenda) AS emendas
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
     WHERE d.etapa = 'EMPENHO'
       AND upper(btrim(d.nota_empenho)) ~ '^[0-9]{4}NE[0-9]{6}$'
       AND p.siop_emenda IS NOT NULL
     GROUP BY 1
  )
  SELECT c.numero::VARCHAR, c.emendas, t.tentativa_em, t.situacao
    FROM citadas c
    LEFT JOIN public.emenda_notas_tesouro_tentativas t ON t.numero_oficial = c.numero
   WHERE NOT EXISTS (
           SELECT 1 FROM public.empenhos e
            WHERE e.numero_oficial = c.numero
              AND e.uasg_emitente IN ('200330', '200331')
              AND EXISTS (SELECT 1 FROM unnest(c.emendas) em WHERE public.nota_casa_com_emenda(e.plano_interno, em)))
     AND (t.tentativa_em IS NULL OR t.tentativa_em < NOW() - COALESCE(p_reconsulta, INTERVAL '1 day'))
   ORDER BY t.tentativa_em NULLS FIRST, c.numero;
$$;

REVOKE ALL ON FUNCTION public.notas_das_emendas_a_trazer(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notas_das_emendas_a_trazer(INTERVAL) TO service_role;

-- ------------------------------------------------------------------------------
-- 5) Gravação
-- p_consultadas: números perguntados ao Tesouro nas duas UGs nesta execução.
-- p_notas: as respostas não vazias do STA (/api/empenho), como vieram: ug, numero, emissao, nome, cpfcnpjugidgener,
--          picodigo, pidescricao, naturezadespesa, naturezadespesadescricao.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_notas_do_tesouro(p_consultadas TEXT[], p_notas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n        RECORD;
  v_cand     JSONB;
  v_casadas  JSONB;
  v_ug       TEXT;
  v_pi       TEXT;
  v_ano      INTEGER;
  v_chave    TEXT;
  v_situacao TEXT;
  v_detalhe  TEXT;
  v_empenhado NUMERIC;
  v_liquidado NUMERIC;
  v_pago      NUMERIC;
  v_contagem JSONB := '{}'::JSONB;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava notas pelo Tesouro.' USING ERRCODE = '42501';
  END IF;
  IF p_notas IS NULL OR jsonb_typeof(p_notas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Envie a lista de respostas do Tesouro.' USING ERRCODE = '22023';
  END IF;

  FOR v_n IN
    SELECT a.numero_oficial AS numero, a.emendas
      FROM public.notas_das_emendas_a_trazer(INTERVAL '0 seconds') a
     WHERE a.numero_oficial = ANY (SELECT upper(btrim(x)) FROM unnest(COALESCE(p_consultadas, ARRAY[]::TEXT[])) x)
  LOOP
    v_situacao := NULL; v_detalhe := NULL; v_ug := NULL;

    -- Respostas do Tesouro para o número, nas duas UGs; as que têm o plano interno da emenda
    SELECT COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_cand
      FROM jsonb_array_elements(p_notas) r
     WHERE upper(btrim(r->>'numero')) = v_n.numero AND r->>'ug' IN ('200330', '200331');
    SELECT COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_casadas
      FROM jsonb_array_elements(v_cand) r
     WHERE EXISTS (SELECT 1 FROM unnest(v_n.emendas) em
                    WHERE public.nota_casa_com_emenda(btrim(COALESCE(r->>'picodigo', '') || ' - ' || COALESCE(r->>'pidescricao', '')), em));

    IF jsonb_array_length(v_cand) = 0 THEN
      v_situacao := 'TESOURO_SEM_A_NOTA';
    ELSIF jsonb_array_length(v_casadas) = 0 THEN
      v_situacao := 'SEM_PLANO_DA_EMENDA';
      v_detalhe := (SELECT string_agg((r->>'ug') || ': ' || COALESCE(r->>'picodigo', '?') || ' ' || COALESCE(r->>'nome', ''), ' | ')
                      FROM jsonb_array_elements(v_cand) r);
    ELSIF jsonb_array_length(v_casadas) > 1 THEN
      v_situacao := 'AS_DUAS_UGS';
    ELSE
      v_cand := v_casadas->0;
      v_ug := v_cand->>'ug';
      v_pi := btrim(COALESCE(v_cand->>'picodigo', '') || ' - ' || COALESCE(v_cand->>'pidescricao', ''));
      v_ano := left(v_n.numero, 4)::INTEGER;
      v_chave := v_ug || '-' || v_ano || '-' || v_ano || 'NE' || (substr(v_n.numero, 7))::INTEGER;

      SELECT sum(s.saldo) FILTER (WHERE s.conta IN ('622920101', '622920102', '622920103', '622920104')),
             sum(s.saldo) FILTER (WHERE s.conta IN ('622920103', '622920104')),
             sum(s.saldo) FILTER (WHERE s.conta = '622920104')
        INTO v_empenhado, v_liquidado, v_pago
        FROM public.empenho_saldo_contabil s
       WHERE s.ug = v_ug AND s.numero_empenho = v_n.numero AND s.ano = v_ano;

      IF v_empenhado IS NULL THEN
        v_situacao := 'SEM_SALDO_CONTABIL';
      ELSE
        INSERT INTO public.empenhos (
          canonical_key, numero_oficial, ano_exercicio, uasg_emitente, numero_normalizado, data_emissao,
          valor_empenhado, valor_liquidado, valor_pago, valor_rpinscrito, credor_nome, credor_cnpj_cpf,
          fonte_origem, informado_manualmente_inicialmente, plano_interno, natureza_despesa, natureza_despesa_descricao,
          last_synced_at)
        VALUES (
          v_chave, v_n.numero, v_ano, v_ug, v_ano || 'NE' || (substr(v_n.numero, 7))::INTEGER,
          COALESCE(NULLIF(v_cand->>'emissao', '')::DATE, make_date(v_ano, 1, 1)),
          GREATEST(v_empenhado, 0), GREATEST(COALESCE(v_liquidado, 0), 0), GREATEST(COALESCE(v_pago, 0), 0), 0,
          NULLIF(btrim(v_cand->>'nome'), ''), NULLIF(btrim(v_cand->>'cpfcnpjugidgener'), ''),
          'TESOURO', FALSE, NULLIF(v_pi, '-'), NULLIF(btrim(v_cand->>'naturezadespesa'), ''),
          NULLIF(btrim(v_cand->>'naturezadespesadescricao'), ''), NOW())
        ON CONFLICT (canonical_key) DO NOTHING;
        v_situacao := CASE WHEN FOUND THEN 'GRAVADA' ELSE 'JA_EXISTIA' END;
      END IF;
    END IF;

    INSERT INTO public.emenda_notas_tesouro_tentativas (numero_oficial, situacao, ug, detalhe, tentativa_em)
    VALUES (v_n.numero, v_situacao, v_ug, v_detalhe, NOW())
    ON CONFLICT (numero_oficial) DO UPDATE
      SET situacao = EXCLUDED.situacao, ug = EXCLUDED.ug, detalhe = EXCLUDED.detalhe, tentativa_em = EXCLUDED.tentativa_em;
    v_contagem := jsonb_set(v_contagem, ARRAY[v_situacao], to_jsonb(COALESCE((v_contagem->>v_situacao)::INTEGER, 0) + 1));
  END LOOP;

  RETURN v_contagem;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_notas_do_tesouro(TEXT[], JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_notas_do_tesouro(TEXT[], JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 6) Fila do Portal: a nota citada no SEI pela UG da emenda
-- (igual à migration 182, só muda o segundo ramo de das_emendas)
-- ------------------------------------------------------------------------------
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
  -- Notas das emendas parlamentares (migration 182): ligadas às linhas dos pedidos ou citadas no SEI; a citada no
  -- SEI só pela UG cujo plano interno é o da emenda (migration 183)
  das_emendas AS (
    SELECT n.empenho_id AS id FROM public.emenda_linha_notas n WHERE n.empenho_id IS NOT NULL
    UNION
    SELECT e.id
      FROM public.emenda_pedido_documentos_sei d
      JOIN public.emenda_pedidos p ON p.id = d.pedido_id
      JOIN public.empenhos e ON e.numero_oficial = upper(btrim(d.nota_empenho)) AND e.uasg_emitente = p_uasg
     WHERE d.etapa = 'EMPENHO' AND d.nota_empenho IS NOT NULL
       AND public.nota_casa_com_emenda(e.plano_interno, p.siop_emenda)
  ),
  alvo AS (
    SELECT e.id, e.numero_oficial, e.uasg_emitente, e.data_emissao, l.lido_em, l.valor_no_sistema, e.valor_empenhado
      FROM public.empenhos e
      LEFT JOIN n ON n.empenho_id = e.id
      LEFT JOIN public.empenho_leituras_siafi l ON l.empenho_id = e.id
     WHERE e.uasg_emitente = p_uasg
       AND e.valor_empenhado > 0
       AND ((n.empenho_id IS NOT NULL AND (n.max_itens >= 2 OR n.min_itens = 0))
            OR e.id IN (SELECT id FROM das_emendas))
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
