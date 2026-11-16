-- ==============================================================================
-- Liquidado e pago das notas das emendas pelo Tesouro (16/11/2026).
--
-- emendas_ligar_notas() (migration 316, de hora em hora) gravava em emenda_linha_notas o liquidado e o pago da nota
-- como o Contratos.gov.br informa (empenhos.valor_liquidado / valor_pago). Esses campos quase nunca acompanham o SIAFI
-- e às vezes vêm incoerentes (2026NE000183 paga com liquidado 0; 2026NE000155 liquidada com pago 0; 2026NE000231 com
-- pago em dobro). Medição de 16/11/2026 nas 378 notas das emendas: pago menor que o do Tesouro em 4 (itens que não
-- chegam a "Pago"), liquidado menor em 18 (R$ 1,27 mi; itens que não chegam a "Recebido").
--
-- O que muda: com a nota no saldo contábil (v_empenho_saldo_contabil, migrations 128/135/195), pago = pago total e
-- liquidado = pago total + liquidado a pagar (exercício e restos a pagar), a mesma regra do Financeiro → Empenhos e da
-- aba Empenhos do Contrato 360. Nota fora do saldo do Tesouro segue com o número da fonte.
--
-- Troca só o trecho do INSERT, sobre a definição que está no banco (estilo das migrations 131/136): se o trecho não
-- estiver lá exatamente uma vez, para com erro. CREATE OR REPLACE mantém as permissões.
-- ==============================================================================

DO $migration$
DECLARE
  v_def text := pg_get_functiondef('public.emendas_ligar_notas()'::regprocedure);
  v_antes_valores constant text := 'e.valor_empenhado, e.valor_liquidado, e.valor_pago,';
  v_depois_valores constant text :=
    'e.valor_empenhado, COALESCE(tz.pago_total + tz.exercicio_liquidado_a_pagar + tz.rp_liquidado_a_pagar, e.valor_liquidado), COALESCE(tz.pago_total, e.valor_pago),';
  v_antes_join constant text := '    LEFT JOIN public.empenhos e ON e.id = t.empenho_id
';
  v_depois_join constant text := '    LEFT JOIN public.empenhos e ON e.id = t.empenho_id
    -- Migration 318: liquidado e pago pelo Tesouro (o Contratos.gov.br quase nunca atualiza esses campos).
    LEFT JOIN public.v_empenho_saldo_contabil tz ON tz.empenho_id = t.empenho_id
';
  v_conta int;
BEGIN
  IF position('v_empenho_saldo_contabil tz' IN v_def) > 0 THEN
    RAISE NOTICE 'emendas_ligar_notas já lê o Tesouro (migration 318)';
    RETURN;
  END IF;

  v_conta := (length(v_def) - length(replace(v_def, v_antes_valores, ''))) / length(v_antes_valores);
  IF v_conta <> 1 THEN
    RAISE EXCEPTION 'migration 318: trecho dos valores aparece % vezes em emendas_ligar_notas (esperado 1)', v_conta;
  END IF;
  v_conta := (length(v_def) - length(replace(v_def, v_antes_join, ''))) / length(v_antes_join);
  IF v_conta <> 1 THEN
    RAISE EXCEPTION 'migration 318: junção com empenhos aparece % vezes em emendas_ligar_notas (esperado 1)', v_conta;
  END IF;

  v_def := replace(replace(v_def, v_antes_valores, v_depois_valores), v_antes_join, v_depois_join);
  EXECUTE v_def;
END;
$migration$;

-- Regrava já as linhas das notas (o agendamento faria isso no minuto 58).
SELECT public.emendas_ligar_notas();
