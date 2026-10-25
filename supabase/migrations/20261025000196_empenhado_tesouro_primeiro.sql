-- ==============================================================================
-- MIGRATION 196: VALOR EMPENHADO = O DO TESOURO QUANDO A LEITURA É CONFIÁVEL
-- Versão: 20261025000196_empenhado_tesouro_primeiro.sql
--
-- A migration 136 fazia valor da nota = o maior entre o Contratos.gov.br e o Tesouro, porque o Contratos.gov.br não
-- acompanha o reforço feito no SIAFI. Com o saldo do Tesouro corrigido (migration 195), o maior passou a guardar o
-- erro do outro lado: em 25/10/2026, 96 notas de 2026 ficavam com o valor do Contratos.gov.br acima do Tesouro
-- (R$ 81,9 mi; 68 exatamente em dobro, como a 2026NE000012 da 200330: 143.992 lá, 71.996 no SIAFI).
--
-- Quando a leitura do Tesouro é confiável para o empenhado da nota (conferido no Portal da Transparência em 25/10/2026):
--   a) nota do ano corrente (o ano mais recente lido da UG): o ano está aberto, com as quatro contas do exercício;
--      40 de 40 notas de 2026 iguais ao Portal;
--   b) nota de ano fechado lido antes do encerramento (dados de 1º de janeiro em diante e conta a liquidar do ano
--      diferente de zero: 2023, 2024 e 2025 nas duas UGs) e sem restos a pagar processados: 16 de 16 iguais ao Portal.
-- Não é confiável:
--   - ano lido depois do encerramento (2016 a 2019, 2021 e 2022): a conta a liquidar veio zerada (o saldo passou para
--     restos a pagar) e o empenhado sai baixo ou zero (ex.: 2022NE000425 da 200331: R$ 20,8 mi no Portal, 0 no Tesouro);
--   - ano lido no meio do próprio ano (2020, dados de abril a agosto de 2020);
--   - nota com restos a pagar processados: no encerramento o liquidado a pagar sai da conta do exercício
--     (9 de 10 notas assim tinham o valor da fonte no Portal).
-- Nesses casos continua a regra da migration 136 (o maior entre a fonte e o Tesouro). Nota MANUAL não muda.
-- valor_empenhado_fonte continua guardando o que o Contratos.gov.br diz.
--
-- 1) empenhado_confiavel_do_tesouro(ug, número): o empenhado no Tesouro quando a leitura é confiável; nulo se não.
-- 2) save_empenho_soberano_atomic: troca o GREATEST da migration 136 (mesmo jeito: parte da definição em produção,
--    troca num ponto único e marca para não repetir).
-- 3) aplicar_empenhado_do_tesouro (cron :44 de 6 em 6 h): mesma regra nas notas já gravadas; o vínculo que cobria a
--    nota inteira acompanha, como antes. Nas notas TESOURO/PORTAL, sem leitura confiável o empenhado fica como está.
-- sync_contract_empenhos_atomic não muda: o vínculo da nota inteira já segue valor_empenhado.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Empenhado da nota no Tesouro, só quando a leitura é confiável
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.empenhado_confiavel_do_tesouro(p_ug TEXT, p_numero TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH n AS (
    SELECT upper(split_part(btrim(p_numero), ' ', 1)) AS numero
  ), a AS (
    SELECT n.numero, left(n.numero, 4)::INTEGER AS ano FROM n WHERE n.numero ~ '^[0-9]{4}NE'
  ), ano_lido AS (
    SELECT MAX(s.atualizado_tesouro) AS lido_em, SUM(s.saldo) FILTER (WHERE s.conta = '622920101') AS a_liquidar
      FROM public.empenho_saldo_contabil s, a
     WHERE s.ug = p_ug AND s.ano = a.ano AND s.conta IN ('622920101', '622920102', '622920103', '622920104')
  )
  SELECT GREATEST(public.empenhado_do_tesouro(p_ug, a.numero), 0)
    FROM a, ano_lido l
   WHERE public.empenhado_do_tesouro(p_ug, a.numero) IS NOT NULL
     AND (a.ano = (SELECT MAX(s.ano) FROM public.empenho_saldo_contabil s WHERE s.ug = p_ug)
          OR (l.lido_em >= make_date(a.ano + 1, 1, 1) AND l.a_liquidar > 0
              AND NOT EXISTS (SELECT 1 FROM public.empenho_saldo_contabil r
                               WHERE r.ug = p_ug AND r.numero_empenho = a.numero AND r.conta IN ('632100000', '632200000'))));
$$;

COMMENT ON FUNCTION public.empenhado_confiavel_do_tesouro(TEXT, TEXT) IS
  'Empenhado da nota no Tesouro quando a leitura é confiável: ano corrente, ou ano fechado lido antes do encerramento e nota sem restos a pagar processados. Nulo nos outros casos (migration 196).';

REVOKE ALL ON FUNCTION public.empenhado_confiavel_do_tesouro(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empenhado_confiavel_do_tesouro(TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Gravação da nota pelo Contratos.gov.br
-- ------------------------------------------------------------------------------
DO $migracao$
DECLARE
  v_marca  CONSTANT TEXT := '(migrations 136 e 196)';
  v_def    TEXT;
  v_antes  CONSTANT TEXT :=
    E'  -- O Contratos.gov.br não acompanha o reforço feito no SIAFI: vale o maior entre a fonte e o Tesouro (migration 136).\n'
    '  v_valor_empenhado_fonte := v_valor_empenhado;\n'
    '  IF v_fonte_origem <> ''MANUAL'' THEN\n'
    '    v_valor_empenhado := GREATEST(v_valor_empenhado, COALESCE(public.empenhado_do_tesouro(v_uasg, v_numero_oficial), 0));\n'
    '  END IF;\n';
  v_depois CONSTANT TEXT :=
    E'  -- O Contratos.gov.br não acompanha o reforço feito no SIAFI e às vezes mostra o dobro: com leitura confiável do\n'
    '  -- Tesouro vale o Tesouro; sem ela, o maior entre a fonte e o Tesouro (migrations 136 e 196).\n'
    '  v_valor_empenhado_fonte := v_valor_empenhado;\n'
    '  IF v_fonte_origem <> ''MANUAL'' THEN\n'
    '    v_valor_empenhado := COALESCE(public.empenhado_confiavel_do_tesouro(v_uasg, v_numero_oficial),\n'
    '                                  GREATEST(v_valor_empenhado, COALESCE(public.empenhado_do_tesouro(v_uasg, v_numero_oficial), 0)));\n'
    '  END IF;\n';
  v_n      INTEGER;
BEGIN
  v_def := pg_get_functiondef('public.save_empenho_soberano_atomic(jsonb)'::regprocedure);
  IF position(v_marca IN v_def) = 0 THEN
    v_n := (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'save_empenho_soberano_atomic: ponto da troca encontrado % vez(es)', v_n;
    END IF;
    EXECUTE replace(v_def, v_antes, v_depois);
  END IF;
END
$migracao$;

COMMENT ON COLUMN public.empenhos.valor_empenhado_fonte IS
  'Valor empenhado como a fonte (Contratos.gov.br) informou. valor_empenhado é o do Tesouro quando a leitura é confiável, senão o maior entre este e o Tesouro (migrations 136 e 196).';

-- ------------------------------------------------------------------------------
-- 3) Acerto das notas já gravadas
-- (igual à migration 195, com a regra nova no primeiro bloco e, nas notas TESOURO/PORTAL, o empenhado só pela
-- leitura confiável)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_empenhado_do_tesouro()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notas    INTEGER := 0;
  v_vinculos INTEGER := 0;
  v_tesouro  INTEGER := 0;
BEGIN
  -- pg_has_role: o db push entra com um papel de login membro de postgres (cli_login_postgres).
  IF NOT (public.eh_service_role() OR session_user IN ('postgres', 'supabase_admin')
          OR pg_has_role(session_user, 'postgres', 'MEMBER')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito.' USING ERRCODE = '42501';
  END IF;

  DROP TABLE IF EXISTS pg_temp.empenhado_tesouro_mudou;
  CREATE TEMP TABLE empenhado_tesouro_mudou ON COMMIT DROP AS
  WITH t AS (
    SELECT s.ug, s.numero_empenho, SUM(s.saldo) AS total
      FROM public.empenho_saldo_contabil s
     WHERE s.conta IN ('622920101', '622920102', '622920103', '622920104')
       AND s.numero_empenho ~ '^[0-9]{4}NE'
       AND s.ano = left(s.numero_empenho, 4)::INTEGER
     GROUP BY s.ug, s.numero_empenho
  ), anos AS (
    -- Mesmas condições de empenhado_confiavel_do_tesouro (migration 196), de uma vez para todas as notas.
    SELECT y.ug, y.ano,
           y.ano = MAX(y.ano) OVER (PARTITION BY y.ug) AS corrente,
           (y.lido_em >= make_date(y.ano + 1, 1, 1) AND y.a_liquidar > 0) AS antes_do_encerramento
      FROM (SELECT s.ug, s.ano, MAX(s.atualizado_tesouro) AS lido_em,
                   SUM(s.saldo) FILTER (WHERE s.conta = '622920101') AS a_liquidar
              FROM public.empenho_saldo_contabil s
             WHERE s.conta IN ('622920101', '622920102', '622920103', '622920104')
             GROUP BY s.ug, s.ano) y
  ), rp_processado AS (
    SELECT DISTINCT s.ug, s.numero_empenho
      FROM public.empenho_saldo_contabil s
     WHERE s.conta IN ('632100000', '632200000')
  ), c AS (
    SELECT t.ug, t.numero_empenho, t.total,
           CASE WHEN a.corrente
                  OR (a.antes_do_encerramento
                      AND NOT EXISTS (SELECT 1 FROM rp_processado r WHERE r.ug = t.ug AND r.numero_empenho = t.numero_empenho))
                THEN GREATEST(t.total, 0) END AS confiavel
      FROM t
      JOIN anos a ON a.ug = t.ug AND a.ano = left(t.numero_empenho, 4)::INTEGER
  ), n AS (
    SELECT e.id, e.valor_empenhado,
           -- Leitura confiável do Tesouro: vale o Tesouro; senão, o maior entre a fonte e o Tesouro (migrations 136 e 196).
           COALESCE(c.confiavel, GREATEST(e.valor_empenhado_fonte, COALESCE(c.total, 0))) AS depois
      FROM public.empenhos e
      LEFT JOIN c
        ON c.ug = e.uasg_emitente
       AND c.numero_empenho = upper(split_part(btrim(e.numero_oficial), ' ', 1))
     WHERE e.valor_empenhado_fonte IS NOT NULL
       AND e.fonte_origem <> 'MANUAL'
  )
  SELECT n.id, n.valor_empenhado AS antes, n.depois
    FROM n
   WHERE n.depois IS DISTINCT FROM n.valor_empenhado;

  UPDATE public.empenhos e
     SET valor_empenhado = m.depois, updated_at = NOW()
    FROM pg_temp.empenhado_tesouro_mudou m
   WHERE e.id = m.id;
  GET DIAGNOSTICS v_notas = ROW_COUNT;

  INSERT INTO public.empenho_eventos_historico (empenho_id, data_evento, tipo_evento, delta_valor, metadados)
  SELECT m.id, CURRENT_DATE,
         CASE WHEN m.depois > m.antes THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
         m.depois - m.antes,
         jsonb_build_object('evento', 'RECONCILIADO', 'origem', 'TESOURO')
    FROM pg_temp.empenhado_tesouro_mudou m;

  -- Vínculo que cobria a nota inteira acompanha (o gatilho refaz a divisão automática).
  WITH v AS (
    UPDATE public.contrato_empenhos ce
       SET valor_vinculado = m.depois, updated_at = NOW()
      FROM pg_temp.empenhado_tesouro_mudou m
     WHERE ce.empenho_id = m.id
       AND abs(ce.valor_vinculado - m.antes) < 0.005
    RETURNING ce.empenho_id, ce.contract_key, m.depois - m.antes AS delta
  ), ev AS (
    INSERT INTO public.empenho_eventos_historico (empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados)
    SELECT v.empenho_id, v.contract_key, CURRENT_DATE,
           CASE WHEN v.delta > 0 THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
           v.delta,
           jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'acao', 'ATUALIZACAO_VALOR', 'contract_key', v.contract_key, 'origem', 'TESOURO')
      FROM v
    RETURNING 1
  )
  SELECT count(*) INTO v_vinculos FROM ev;

  -- Notas trazidas pelo Tesouro ou pelo Portal (migrations 184 e 192): não têm valor da fonte; empenhado, liquidado
  -- e pago vêm todos do saldo contábil (migration 195). Sem leitura do Tesouro para a nota, ficam como estão.
  DROP TABLE IF EXISTS pg_temp.notas_tesouro_mudaram;
  CREATE TEMP TABLE notas_tesouro_mudaram ON COMMIT DROP AS
  WITH n AS (
    SELECT e.id, e.uasg_emitente AS ug, upper(split_part(btrim(e.numero_oficial), ' ', 1)) AS numero,
           e.valor_empenhado, e.valor_liquidado, e.valor_pago
      FROM public.empenhos e
     WHERE e.fonte_origem IN ('TESOURO', 'PORTAL')
  ), s AS (
    SELECT n.id,
           -- sem leitura confiável do ano de emissão, o empenhado fica como está (migration 196)
           COALESCE(public.empenhado_confiavel_do_tesouro(n.ug, n.numero), n.valor_empenhado) AS empenhado,
           GREATEST(v.pago_total, 0) AS pago,
           GREATEST(v.pago_total + v.exercicio_liquidado_a_pagar + v.rp_liquidado_a_pagar, 0) AS liquidado
      FROM n
      JOIN public.v_empenho_saldo_contabil v ON v.ug = n.ug AND v.numero_empenho = n.numero
  )
  SELECT n.id, n.valor_empenhado AS antes, s.empenhado, s.liquidado, s.pago
    FROM n
    JOIN s ON s.id = n.id
   WHERE (s.empenhado, s.liquidado, s.pago) IS DISTINCT FROM (n.valor_empenhado, n.valor_liquidado, n.valor_pago);

  UPDATE public.empenhos e
     SET valor_empenhado = m.empenhado, valor_liquidado = m.liquidado, valor_pago = m.pago,
         last_synced_at = NOW(), updated_at = NOW()
    FROM pg_temp.notas_tesouro_mudaram m
   WHERE e.id = m.id;
  GET DIAGNOSTICS v_tesouro = ROW_COUNT;

  INSERT INTO public.empenho_eventos_historico (empenho_id, data_evento, tipo_evento, delta_valor, metadados)
  SELECT m.id, CURRENT_DATE,
         CASE WHEN m.empenhado > m.antes THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
         m.empenhado - m.antes,
         jsonb_build_object('evento', 'RECONCILIADO', 'origem', 'TESOURO')
    FROM pg_temp.notas_tesouro_mudaram m
   WHERE abs(m.empenhado - m.antes) >= 0.005;

  RETURN jsonb_build_object('notas', v_notas, 'vinculos', v_vinculos, 'notas_tesouro_portal', v_tesouro);
END;
$$;

COMMENT ON FUNCTION public.aplicar_empenhado_do_tesouro() IS
  'Valor das notas = empenhado no Tesouro quando a leitura é confiável (empenhado_confiavel_do_tesouro, migration 196), senão o maior entre o Contratos.gov.br e o Tesouro (migration 136); o vínculo da nota inteira acompanha. Notas trazidas pelo Tesouro ou pelo Portal: empenhado, liquidado e pago pelo saldo contábil (migration 195).';

REVOKE ALL ON FUNCTION public.aplicar_empenhado_do_tesouro() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_empenhado_do_tesouro() TO service_role;
