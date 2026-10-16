-- ============================================================================
-- MIGRATION 136: VALOR EMPENHADO PELO TESOURO QUANDO O CONTRATOS.GOV.BR MOSTRA MENOS
-- Versão: 20261014000136_empenhado_pelo_tesouro.sql
-- ============================================================================
-- O "empenhado" do Contratos.gov.br não acompanha o reforço feito direto no SIAFI.
-- Ex.: 2025NE000424 (contrato 00269/2025) aparece com R$ 289.017 (1 veículo), mas
-- o Tesouro tinha R$ 8.670.510 (30 veículos) a liquidar em 31/12/2025. Medição de
-- 14/10/2026: 10 notas de 2025 da UG 200330, R$ 161 mi a menos.
--
-- No saldo contábil do Tesouro (migration 128), o empenhado de uma nota é a soma,
-- no ano de emissão, de a liquidar + em liquidação + liquidado a pagar + pago
-- (contas 622920101 a 622920104).
--
-- Regra: valor da nota = o maior entre o Contratos.gov.br e o Tesouro. O Tesouro
-- só corrige para cima: a nota que o Contratos.gov.br mostra a mais (há notas da
-- 200330 em dobro) continua como a fonte diz.
--
-- 1) empenhos.valor_empenhado_fonte guarda o que o Contratos.gov.br diz.
-- 2) empenhado_do_tesouro(ug, número): o empenhado da nota no Tesouro.
-- 3) save_empenho_soberano_atomic grava o maior dos dois (o histórico só registra
--    reforço ou anulação de verdade, e não a cada hora).
-- 4) sync_contract_empenhos_atomic: o vínculo que cobre a nota inteira acompanha
--    o valor corrigido (o gatilho da migration 94 refaz a divisão automática).
-- 5) aplicar_empenhado_do_tesouro(): acerta as notas já gravadas quando chega
--    leitura nova do Tesouro (cron :44 de 6 em 6 h, depois das leituras das :09 e :27).
-- ============================================================================

-- 1) O que o Contratos.gov.br diz -------------------------------------------
ALTER TABLE public.empenhos ADD COLUMN IF NOT EXISTS valor_empenhado_fonte NUMERIC(18, 4);
COMMENT ON COLUMN public.empenhos.valor_empenhado_fonte IS
  'Valor empenhado como a fonte (Contratos.gov.br) informou. valor_empenhado é o maior entre este e o empenhado no Tesouro (migration 136).';

-- Hoje valor_empenhado ainda é o da fonte. Sem o gatilho de auditoria: só copia o valor.
ALTER TABLE public.empenhos DISABLE TRIGGER trg_audit_empenhos;
UPDATE public.empenhos
   SET valor_empenhado_fonte = valor_empenhado
 WHERE valor_empenhado_fonte IS NULL AND fonte_origem <> 'MANUAL';
ALTER TABLE public.empenhos ENABLE TRIGGER trg_audit_empenhos;

-- 2) Empenhado da nota no Tesouro -------------------------------------------
CREATE OR REPLACE FUNCTION public.empenhado_do_tesouro(p_ug TEXT, p_numero TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT SUM(s.saldo)
    FROM public.empenho_saldo_contabil s
   WHERE s.ug = p_ug
     AND s.numero_empenho = upper(split_part(btrim(p_numero), ' ', 1))
     AND s.numero_empenho ~ '^[0-9]{4}NE'
     AND s.ano = left(s.numero_empenho, 4)::INTEGER
     AND s.conta IN ('622920101', '622920102', '622920103', '622920104');
$$;

COMMENT ON FUNCTION public.empenhado_do_tesouro(TEXT, TEXT) IS
  'Empenhado da nota no Tesouro: a liquidar + em liquidação + liquidado a pagar + pago no ano de emissão. Nulo sem leitura (migration 136).';

REVOKE ALL ON FUNCTION public.empenhado_do_tesouro(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empenhado_do_tesouro(TEXT, TEXT) TO authenticated, service_role;

-- 3) e 4) Gravação da nota e do vínculo --------------------------------------
-- Mesmo jeito da migration 131: parte da definição em produção, insere em pontos
-- únicos e marca para não repetir.
DO $migracao$
DECLARE
  v_marca  CONSTANT TEXT := '(migration 136)';
  v_def    TEXT;
  v_antes  TEXT;
  v_depois TEXT;
  v_n      INTEGER;
BEGIN
  -- 3) save_empenho_soberano_atomic
  v_def := pg_get_functiondef('public.save_empenho_soberano_atomic(jsonb)'::regprocedure);
  IF position(v_marca IN v_def) = 0 THEN
    FOREACH v_antes IN ARRAY ARRAY[
      E'  v_valor_empenhado NUMERIC(18, 4);\n',
      E'  v_valor_empenhado := COALESCE((p_empenho->>''valor_empenhado'')::NUMERIC, 0);\n',
      E'  RETURN jsonb_build_object(\n'
    ] LOOP
      v_n := (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes);
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'save_empenho_soberano_atomic: ponto de inserção encontrado % vez(es): %', v_n, v_antes;
      END IF;
    END LOOP;

    v_def := replace(v_def,
      E'  v_valor_empenhado NUMERIC(18, 4);\n',
      E'  v_valor_empenhado NUMERIC(18, 4);\n'
      '  v_valor_empenhado_fonte NUMERIC(18, 4);\n');

    v_def := replace(v_def,
      E'  v_valor_empenhado := COALESCE((p_empenho->>''valor_empenhado'')::NUMERIC, 0);\n',
      E'  v_valor_empenhado := COALESCE((p_empenho->>''valor_empenhado'')::NUMERIC, 0);\n'
      '  -- O Contratos.gov.br não acompanha o reforço feito no SIAFI: vale o maior entre a fonte e o Tesouro (migration 136).\n'
      '  v_valor_empenhado_fonte := v_valor_empenhado;\n'
      '  IF v_fonte_origem <> ''MANUAL'' THEN\n'
      '    v_valor_empenhado := GREATEST(v_valor_empenhado, COALESCE(public.empenhado_do_tesouro(v_uasg, v_numero_oficial), 0));\n'
      '  END IF;\n');

    v_def := replace(v_def,
      E'  RETURN jsonb_build_object(\n',
      E'  -- Guarda o que a fonte disse (migration 136).\n'
      '  IF v_fonte_origem <> ''MANUAL'' AND v_record.valor_empenhado_fonte IS DISTINCT FROM v_valor_empenhado_fonte THEN\n'
      '    UPDATE public.empenhos SET valor_empenhado_fonte = v_valor_empenhado_fonte\n'
      '     WHERE id = v_record.id\n'
      '     RETURNING * INTO v_record;\n'
      '  END IF;\n'
      '\n'
      '  RETURN jsonb_build_object(\n');

    EXECUTE v_def;
  END IF;

  -- 4) sync_contract_empenhos_atomic
  v_def := pg_get_functiondef('public.sync_contract_empenhos_atomic(character varying, jsonb, boolean)'::regprocedure);
  IF position(v_marca IN v_def) = 0 THEN
    v_antes := E'    SELECT * INTO v_existing\n      FROM public.contrato_empenhos\n';
    v_n := (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'sync_contract_empenhos_atomic: ponto de inserção encontrado % vez(es)', v_n;
    END IF;
    v_depois :=
      E'    -- Vínculo da nota inteira acompanha o valor corrigido pelo Tesouro (migration 136).\n'
      '    v_valor := COALESCE((\n'
      '      SELECT e.valor_empenhado FROM public.empenhos e\n'
      '       WHERE e.id = v_empenho_id\n'
      '         AND e.valor_empenhado_fonte IS NOT NULL\n'
      '         AND abs(v_valor - e.valor_empenhado_fonte) < 0.005\n'
      '    ), v_valor);\n'
      '\n'
      || v_antes;
    EXECUTE replace(v_def, v_antes, v_depois);
  END IF;
END
$migracao$;

-- 5) Acerto das notas já gravadas ---------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_empenhado_do_tesouro()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notas    INTEGER := 0;
  v_vinculos INTEGER := 0;
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
  )
  SELECT e.id,
         e.valor_empenhado AS antes,
         GREATEST(e.valor_empenhado_fonte, COALESCE(t.total, 0)) AS depois
    FROM public.empenhos e
    LEFT JOIN t
      ON t.ug = e.uasg_emitente
     AND t.numero_empenho = upper(split_part(btrim(e.numero_oficial), ' ', 1))
   WHERE e.valor_empenhado_fonte IS NOT NULL
     AND e.fonte_origem <> 'MANUAL'
     AND GREATEST(e.valor_empenhado_fonte, COALESCE(t.total, 0)) IS DISTINCT FROM e.valor_empenhado;

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

  RETURN jsonb_build_object('notas', v_notas, 'vinculos', v_vinculos);
END;
$$;

COMMENT ON FUNCTION public.aplicar_empenhado_do_tesouro() IS
  'Valor das notas = maior entre o Contratos.gov.br e o empenhado no Tesouro; o vínculo da nota inteira acompanha (migration 136).';

REVOKE ALL ON FUNCTION public.aplicar_empenhado_do_tesouro() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_empenhado_do_tesouro() TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'aplicar-empenhado-do-tesouro';
    PERFORM cron.schedule('aplicar-empenhado-do-tesouro', '44 */6 * * *', $c$SELECT public.aplicar_empenhado_do_tesouro()$c$);
  END IF;
END
$cron$;

-- Acerto inicial.
SELECT public.aplicar_empenhado_do_tesouro();
