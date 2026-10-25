-- ==============================================================================
-- MIGRATION 195: SALDO CONTÁBIL = SOMA DE TODOS OS REGISTROS DA CONTA CORRENTE
-- Versão: 20261025000195_saldo_contabil_soma_dos_registros.sql
--
-- Achado de 25/10/2026: no ano corrente, a API do Tesouro (STA) devolve um registro por período (mês) para cada
-- conta corrente (nota + subitem), com o movimento do período: saldo = crédito − débito do período, débito e crédito
-- iniciais zerados, tiposaldo sempre 'C', sem campo de mês. Ex.: UG 200330, 2026, conta 622920101,
-- 2026NE00001233 (nota 2026NE000012, subitem 33): um registro de +71.996,00 (empenho) e outro de −71.996,00
-- (liquidação). Os anos fechados (2016 a 2025) vêm com um registro só por conta corrente.
--
-- gravar_saldo_contabil (migrations 128 e 130) guardava um registro qualquer (DISTINCT ON): em 2026, 2.260 das 7.020
-- contas correntes ficaram com saldo errado, com a liquidar negativo em 101 notas ligadas a contrato. Somando todos os
-- registros, nenhuma conta fica negativa e o empenhado bate com o Portal da Transparência em 40 de 40 notas sorteadas
-- entre as que mudam (e em 255 de 257 leituras do Portal já gravadas; as 2 restantes mudaram depois da leitura).
--
-- O que muda
-- 1) gravar_saldo_contabil soma os registros de cada conta corrente (saldo, débito, crédito; data mais recente).
--    A chave da tabela não muda: uma linha por UG × ano × conta × conta corrente, com o saldo acumulado.
--    A Edge Function já manda todos os registros; não muda. A leitura seguinte (cron de 6 em 6 h) corrige 2026.
-- 2) aplicar_empenhado_do_tesouro também acerta as notas trazidas pelo Tesouro ou pelo Portal (fonte_origem TESOURO
--    ou PORTAL, migrations 184 e 192): empenhado, liquidado e pago vinham do dia em que a nota entrou e não mudavam
--    mais (sem valor da fonte, a regra da 136 não as alcança). Agora seguem o saldo contábil:
--      empenhado = a liquidar + em liquidação + liquidado a pagar + pago no ano de emissão (empenhado_do_tesouro);
--      pago      = pago de todos os anos (como o pago_total de v_empenho_saldo_contabil);
--      liquidado = pago + liquidado a pagar do ano mais recente lido.
--    Não usa os itens do STA (/api/empenho): a lista repete as linhas e o total vem em dobro em 450 de 624 notas de 2026.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Gravação: soma dos registros da conta corrente
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_saldo_contabil(p_ug TEXT, p_ano INTEGER, p_conta TEXT, p_linhas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ug TEXT := btrim(COALESCE(p_ug, ''));
  v_conta TEXT := btrim(COALESCE(p_conta, ''));
  v_recebidas INTEGER;
  v_gravadas INTEGER := 0;
  v_removidas INTEGER := 0;
  v_existentes INTEGER;
  v_validas INTEGER := 0;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava o saldo contábil.' USING ERRCODE = '42501';
  END IF;
  IF v_ug !~ '^[0-9]{6}$' OR v_conta !~ '^[0-9]{9}$' OR p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UG, ano ou conta fora do formato (UG %, ano %, conta %).', v_ug, p_ano, v_conta USING ERRCODE = '22023';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Envie uma lista de linhas.' USING ERRCODE = '22023';
  END IF;

  -- Contas correntes recebidas (no ano corrente vêm vários registros por conta corrente, um por período).
  SELECT COUNT(DISTINCT x->>'conta_corrente') INTO v_recebidas FROM jsonb_array_elements(p_linhas) x;
  SELECT COUNT(*) INTO v_existentes FROM public.empenho_saldo_contabil WHERE ug = v_ug AND ano = p_ano AND conta = v_conta;

  -- Lista vazia ou com menos da metade das contas correntes que a conta já tem não substitui o que existe. As contas
  -- correntes de um ano não somem durante o ano (ficam com saldo zero); uma queda assim é resposta incompleta,
  -- como as do Tesouro durante a atualização diária (14/10/2026: contas vazias e 4 de 45 linhas).
  IF v_existentes > 0 AND v_recebidas < v_existentes * 0.5 THEN
    RETURN jsonb_build_object('gravadas', 0, 'removidas', 0, 'bloqueada', true, 'recebidas', v_recebidas, 'existentes', v_existentes);
  END IF;

  WITH linhas AS (
    -- Cada registro é o movimento de um período; o saldo da conta corrente é a soma de todos (migration 195).
    SELECT x->>'conta_corrente' AS conta_corrente,
           SUM(COALESCE(NULLIF(x->>'saldo', '')::NUMERIC, 0)) AS saldo,
           SUM(COALESCE(NULLIF(x->>'debito_mensal', '')::NUMERIC, 0)) AS debito_mensal,
           SUM(COALESCE(NULLIF(x->>'credito_mensal', '')::NUMERIC, 0)) AS credito_mensal,
           MAX(NULLIF(x->>'atualizado_tesouro', '')::TIMESTAMP) AS atualizado_tesouro
      FROM jsonb_array_elements(p_linhas) x
     WHERE x->>'conta_corrente' ~ '^[0-9]{4}NE[0-9]{8}$'
     GROUP BY x->>'conta_corrente'
  ), removidas AS (
    DELETE FROM public.empenho_saldo_contabil s
     WHERE s.ug = v_ug AND s.ano = p_ano AND s.conta = v_conta
       AND NOT EXISTS (SELECT 1 FROM linhas l WHERE l.conta_corrente = s.conta_corrente)
    RETURNING 1
  ), gravadas AS (
    INSERT INTO public.empenho_saldo_contabil AS s (ug, ano, conta, conta_corrente, saldo, debito_mensal, credito_mensal, atualizado_tesouro, sincronizado_em)
    SELECT v_ug, p_ano, v_conta, conta_corrente, saldo, debito_mensal, credito_mensal, atualizado_tesouro, NOW() FROM linhas
    ON CONFLICT (ug, ano, conta, conta_corrente) DO UPDATE SET
      saldo = EXCLUDED.saldo, debito_mensal = EXCLUDED.debito_mensal, credito_mensal = EXCLUDED.credito_mensal,
      atualizado_tesouro = EXCLUDED.atualizado_tesouro, sincronizado_em = NOW()
    -- linha igual não é regravada
    WHERE (s.saldo, s.debito_mensal, s.credito_mensal, s.atualizado_tesouro)
          IS DISTINCT FROM (EXCLUDED.saldo, EXCLUDED.debito_mensal, EXCLUDED.credito_mensal, EXCLUDED.atualizado_tesouro)
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM gravadas), (SELECT COUNT(*) FROM removidas), (SELECT COUNT(*) FROM linhas)
    INTO v_gravadas, v_removidas, v_validas;

  INSERT INTO public.saldo_contabil_cargas AS c (ug, ano, conta, linhas, carregado_em)
  VALUES (v_ug, p_ano, v_conta, v_validas, NOW())
  ON CONFLICT (ug, ano, conta) DO UPDATE SET linhas = EXCLUDED.linhas, carregado_em = NOW();

  RETURN jsonb_build_object('gravadas', v_gravadas, 'removidas', v_removidas, 'bloqueada', false);
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_saldo_contabil(TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_saldo_contabil(TEXT, INTEGER, TEXT, JSONB) TO service_role;

COMMENT ON COLUMN public.empenho_saldo_contabil.saldo IS
  'Saldo acumulado da conta corrente no ano: soma dos registros do Tesouro (no ano corrente vem um por período; migration 195).';
COMMENT ON COLUMN public.empenho_saldo_contabil.debito_mensal IS
  'Débitos do ano até a leitura (soma dos débitos dos períodos; migration 195).';
COMMENT ON COLUMN public.empenho_saldo_contabil.credito_mensal IS
  'Créditos do ano até a leitura (soma dos créditos dos períodos; migration 195).';

-- ------------------------------------------------------------------------------
-- 2) Notas trazidas pelo Tesouro ou pelo Portal seguem o saldo contábil
-- (igual à migration 136, mais o bloco das notas TESOURO/PORTAL)
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
           GREATEST(public.empenhado_do_tesouro(n.ug, n.numero), 0) AS empenhado,
           GREATEST(v.pago_total, 0) AS pago,
           GREATEST(v.pago_total + v.exercicio_liquidado_a_pagar + v.rp_liquidado_a_pagar, 0) AS liquidado
      FROM n
      JOIN public.v_empenho_saldo_contabil v ON v.ug = n.ug AND v.numero_empenho = n.numero
  )
  SELECT n.id, n.valor_empenhado AS antes, s.empenhado, s.liquidado, s.pago
    FROM n
    JOIN s ON s.id = n.id
   WHERE s.empenhado IS NOT NULL
     AND (s.empenhado, s.liquidado, s.pago) IS DISTINCT FROM (n.valor_empenhado, n.valor_liquidado, n.valor_pago);

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
  'Valor das notas = maior entre o Contratos.gov.br e o empenhado no Tesouro; o vínculo da nota inteira acompanha (migration 136). Notas trazidas pelo Tesouro ou pelo Portal: empenhado, liquidado e pago pelo saldo contábil (migration 195).';

REVOKE ALL ON FUNCTION public.aplicar_empenhado_do_tesouro() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_empenhado_do_tesouro() TO service_role;
