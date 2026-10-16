-- ==============================================================================
-- MIGRATION 130: SALDO CONTÁBIL NÃO ACEITA RESPOSTA INCOMPLETA DO TESOURO
-- Versão: 20261014000130_saldo_contabil_resposta_parcial.sql
--
-- Contexto (carga inicial de 14/10/2026): enquanto o Tesouro publica a atualização do dia, a API devolve contas
-- vazias ou incompletas. Na carga feita às 17:55 UTC, a conta de pago em restos a pagar de 2026 da UG 200330 veio
-- vazia e a de "em liquidação" veio com 4 de 45 linhas. gravar_saldo_contabil (migration 128) só recusava a lista
-- vazia; uma lista incompleta substituía a conta inteira até a próxima leitura (6 horas depois).
--
-- O que muda em gravar_saldo_contabil:
--   1) recusa, sem apagar nada, a lista com menos da metade das linhas que a conta já tem (a lista vazia continua
--      recusada). As contas correntes de um ano não somem durante o ano, ficam com saldo zero; por isso uma queda
--      dessas é resposta incompleta. A sincronização registra a conta como "mantida" e lê de novo na seguinte;
--   2) não regrava linha igual à gravada. Na primeira execução no servidor, algumas gravações passaram do limite de
--      8 s da API do banco com o banco carregado; as execuções do mesmo dia (de 6 em 6 horas) passam a só conferir;
--   3) a carga registra quantas linhas a conta tem (antes, quantas foram gravadas).
-- ==============================================================================

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

  v_recebidas := jsonb_array_length(p_linhas);
  SELECT COUNT(*) INTO v_existentes FROM public.empenho_saldo_contabil WHERE ug = v_ug AND ano = p_ano AND conta = v_conta;

  -- Lista vazia ou com menos da metade das linhas que a conta já tem não substitui o que existe. As contas
  -- correntes de um ano não somem durante o ano (ficam com saldo zero); uma queda assim é resposta incompleta,
  -- como as do Tesouro durante a atualização diária (14/10/2026: contas vazias e 4 de 45 linhas).
  IF v_existentes > 0 AND v_recebidas < v_existentes * 0.5 THEN
    RETURN jsonb_build_object('gravadas', 0, 'removidas', 0, 'bloqueada', true, 'recebidas', v_recebidas, 'existentes', v_existentes);
  END IF;

  WITH linhas AS (
    SELECT DISTINCT ON (x->>'conta_corrente')
           x->>'conta_corrente' AS conta_corrente,
           COALESCE(NULLIF(x->>'saldo', '')::NUMERIC, 0) AS saldo,
           COALESCE(NULLIF(x->>'debito_mensal', '')::NUMERIC, 0) AS debito_mensal,
           COALESCE(NULLIF(x->>'credito_mensal', '')::NUMERIC, 0) AS credito_mensal,
           NULLIF(x->>'atualizado_tesouro', '')::TIMESTAMP AS atualizado_tesouro
      FROM jsonb_array_elements(p_linhas) x
     WHERE x->>'conta_corrente' ~ '^[0-9]{4}NE[0-9]{8}$'
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
