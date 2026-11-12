-- ==============================================================================
-- Notas das emendas ligadas ao contrato pelo pedido (origem EMENDA)
-- ==============================================================================
-- Caso de 04/11/2026: a 2026NE000237 (UG 200330, CESKA ZBROJOVKA) está em empenhos (gravada pelo Tesouro, migration
-- 184) e ligada à linha do pedido de emenda, que aponta o contrato 00238/2026. Mas o Contratos.gov.br não lista
-- nenhuma nota nesse contrato (o gestor não a incluiu lá), então não há linha em contrato_empenhos e a nota some da
-- Carteira › Empenhos, do Contrato 360 e do consumo do contrato. Em produção: 278 notas da 200330 sem contrato, 140
-- com o contrato conhecido pelo pedido (138 com o credor igual ao fornecedor do contrato).
--
-- Regra: a nota sem nenhum vínculo da fonte, ligada pelas linhas dos pedidos a um contrato só, e cujo credor é o
-- fornecedor do contrato, ganha o vínculo com origem EMENDA (valor = empenhado da nota). A fonte continua mandando:
--   * o Contratos.gov.br passa a listar a nota no mesmo contrato → o vínculo vira FONTE (como o MANUAL, migration 85);
--   * a fonte liga a nota a outro contrato, o pedido muda de contrato ou a nota sai do pedido → o EMENDA sai, salvo
--     se o gestor já trabalhou nele (divisão entre os itens ou quantidade informada), como na migration 113.
-- A sincronização da fonte só conta e apaga vínculos FONTE, então o EMENDA não é apagado por ela nem gera o aviso
-- "a fonte não listou nenhum empenho".
-- Roda a cada hora no minuto 59, logo depois de emendas_ligar_notas (minuto 58).
-- ==============================================================================

-- 1. Origem nova --------------------------------------------------------------------------------------------------
DO $$
DECLARE v_nome TEXT;
BEGIN
  -- O nome da restrição antiga pode variar; apaga a que testa origem.
  FOR v_nome IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.contrato_empenhos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%origem%'
  LOOP
    EXECUTE format('ALTER TABLE public.contrato_empenhos DROP CONSTRAINT %I', v_nome);
  END LOOP;
END $$;
ALTER TABLE public.contrato_empenhos
  ADD CONSTRAINT contrato_empenhos_origem_check CHECK (origem IN ('FONTE', 'MANUAL', 'EMENDA'));

COMMENT ON COLUMN public.contrato_empenhos.origem IS
  'FONTE: listado pelo Contratos.gov.br. MANUAL: vínculo à mão (sem uso desde a migration 117). EMENDA: contrato do pedido de emenda, enquanto a fonte não lista a nota (migration 255).';

-- 2. A fonte confirma o vínculo EMENDA: vira FONTE ------------------------------------------------------------------
DO $$
DECLARE
  v_def TEXT := pg_get_functiondef('public.sync_contract_empenhos_atomic(character varying, jsonb, boolean)'::regprocedure);
  v_novo TEXT;
BEGIN
  v_novo := replace(v_def, 'IF v_existing.origem = ''MANUAL'' THEN',
                    'IF v_existing.origem IN (''MANUAL'', ''EMENDA'') THEN  -- (migration 255) EMENDA também vira FONTE');
  IF v_novo = v_def THEN
    RAISE EXCEPTION 'migration 255: trecho da promoção a FONTE não encontrado em sync_contract_empenhos_atomic';
  END IF;
  EXECUTE v_novo;  -- CREATE OR REPLACE mantém as permissões
END $$;

-- 2b. As emendas não leem de volta o vínculo EMENDA ------------------------------------------------------------------
-- O vínculo EMENDA nasce das linhas dos pedidos; se emendas_ligar_notas e a conferência do pedido o lessem, a nota
-- "confirmaria" a si mesma. No ensaio de 04/11/2026 isso mudou a nota de 4 linhas e fez o pedido 620 oscilar a cada
-- hora (as 2 notas do contrato 00299/2026 entravam e saíam). Com o filtro, as emendas ficam exatamente como antes.
DO $$
DECLARE
  v_def TEXT := pg_get_functiondef('public.emendas_ligar_notas()'::regprocedure);
  v_novo TEXT := v_def;
  v_trocas CONSTANT TEXT[][] := ARRAY[
    ['public.contrato_empenhos ce ON ce.empenho_id = e.id',
     'public.contrato_empenhos ce ON ce.empenho_id = e.id AND ce.origem <> ''EMENDA''', '3'],
    ['public.contrato_empenhos ce ON ce.empenho_id = s.empenho_id',
     'public.contrato_empenhos ce ON ce.empenho_id = s.empenho_id AND ce.origem <> ''EMENDA''', '1'],
    ['public.contrato_empenhos ce WHERE ce.contract_key = co.contract_key',
     'public.contrato_empenhos ce WHERE ce.contract_key = co.contract_key AND ce.origem <> ''EMENDA''', '1']];
  v_vezes INTEGER;
  i INTEGER;
BEGIN
  FOR i IN 1 .. array_length(v_trocas, 1) LOOP
    v_vezes := (length(v_novo) - length(replace(v_novo, v_trocas[i][1], ''))) / length(v_trocas[i][1]);
    IF v_vezes <> v_trocas[i][3]::INTEGER THEN
      RAISE EXCEPTION 'migration 255: emendas_ligar_notas tem % ocorrência(s) de "%", esperava %', v_vezes, v_trocas[i][1], v_trocas[i][3];
    END IF;
    v_novo := replace(v_novo, v_trocas[i][1], v_trocas[i][2]);
  END LOOP;
  EXECUTE v_novo;
END $$;

DO $$
DECLARE
  v_def TEXT := pg_get_viewdef('public.v_emendas_empenho_x_pedido'::regclass);
  v_antes CONSTANT TEXT := 'WHERE (ce.empenho_id IN ( SELECT ne.id';
  v_novo TEXT;
BEGIN
  IF (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 THEN
    RAISE EXCEPTION 'migration 255: trecho do vínculo nota→contrato não encontrado em v_emendas_empenho_x_pedido';
  END IF;
  v_novo := replace(v_def, v_antes, 'WHERE ((ce.origem)::text <> ''EMENDA''::text) AND (ce.empenho_id IN ( SELECT ne.id');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_emendas_empenho_x_pedido AS ' || v_novo;  -- mantém colunas e permissões
END $$;

-- 3. Liga as notas das emendas aos contratos ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ligar_notas_das_emendas_aos_contratos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inseridos INTEGER := 0;
  v_atualizados INTEGER := 0;
  v_removidos INTEGER := 0;
  v_mantidos INTEGER := 0;
  v_r RECORD;
BEGIN
  -- Uma rodada por vez (cron e chamada à mão).
  IF NOT pg_try_advisory_xact_lock(hashtext('ligar_notas_das_emendas_aos_contratos')) THEN
    RETURN jsonb_build_object('ocupado', TRUE);
  END IF;

  DROP TABLE IF EXISTS tmp_nota_contrato;
  CREATE TEMP TABLE tmp_nota_contrato ON COMMIT DROP AS
  WITH c AS (
    SELECT DISTINCT l.empenho_id, l.contract_key
      FROM public.emenda_linha_notas l
      JOIN public.emenda_pedido_linhas pl ON pl.id = l.linha_id AND NOT pl.cancelada
      JOIN public.empenhos e ON e.id = l.empenho_id
      JOIN public.contratos_oficiais co ON co.contract_key = l.contract_key
     WHERE l.empenho_id IS NOT NULL AND l.contract_key IS NOT NULL
       AND COALESCE(e.valor_empenhado, 0) > 0
       -- O credor da nota é o fornecedor do contrato (mesmo documento, raiz do CNPJ ou, estrangeiro, pelo nome).
       AND (upper(btrim(COALESCE(e.credor_cnpj_cpf, ''))) = upper(btrim(COALESCE(co.fornecedor_cnpj_cpf, '-')))
            OR public.credor_e_fornecedor_da_ata(e.credor_cnpj_cpf, e.credor_nome, co.fornecedor_cnpj_cpf,
                                                 co.registro->'raw'->'fornecedor'->>'nome'))
       -- A fonte não liga a nota a contrato nenhum.
       AND NOT EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.empenho_id = l.empenho_id AND ce.origem <> 'EMENDA')
  )
  SELECT c.empenho_id, min(c.contract_key) AS contract_key
    FROM c GROUP BY c.empenho_id
  HAVING count(DISTINCT c.contract_key) = 1;

  -- Sai o EMENDA que não tem mais apoio (sem trabalho do gestor).
  FOR v_r IN
    SELECT ce.*
      FROM public.contrato_empenhos ce
     WHERE ce.origem = 'EMENDA'
       AND NOT EXISTS (SELECT 1 FROM tmp_nota_contrato t WHERE t.empenho_id = ce.empenho_id AND t.contract_key = ce.contract_key)
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtext('distribuir_empenho:' || v_r.id::TEXT)) THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.contrato_empenho_distribuicoes d WHERE d.contrato_empenho_id = v_r.id AND d.origem = 'USUARIO')
       OR EXISTS (SELECT 1 FROM public.contrato_empenho_itens i WHERE i.contrato_empenho_id = v_r.id AND i.quantidade_informada IS NOT NULL) THEN
      v_mantidos := v_mantidos + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.empenho_eventos_historico (empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados)
    VALUES (v_r.empenho_id, v_r.contract_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL', -COALESCE(v_r.valor_vinculado, 0),
            jsonb_build_object('evento', 'DESVINCULADO_CONTRATO', 'motivo', 'SEM_APOIO_DO_PEDIDO', 'link_id', v_r.id,
                               'valor_estornado', v_r.valor_vinculado, 'origem', 'EMENDA'));
    DELETE FROM public.contrato_empenhos WHERE id = v_r.id;
    v_removidos := v_removidos + 1;
  END LOOP;

  -- Valor acompanha o empenhado da nota (reforço, anulação parcial).
  WITH u AS (
    UPDATE public.contrato_empenhos ce
       SET valor_vinculado = e.valor_empenhado, updated_at = NOW()
      FROM public.empenhos e
     WHERE ce.origem = 'EMENDA' AND e.id = ce.empenho_id
       AND ce.valor_vinculado IS DISTINCT FROM e.valor_empenhado
    RETURNING 1)
  SELECT count(*) INTO v_atualizados FROM u;

  -- Entra o vínculo novo.
  FOR v_r IN
    SELECT t.empenho_id, t.contract_key, e.valor_empenhado
      FROM tmp_nota_contrato t
      JOIN public.empenhos e ON e.id = t.empenho_id
     WHERE NOT EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.empenho_id = t.empenho_id AND ce.contract_key = t.contract_key)
  LOOP
    INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado, origem)
    VALUES (v_r.contract_key, v_r.empenho_id, v_r.valor_empenhado, 'EMENDA');
    INSERT INTO public.empenho_eventos_historico (empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados)
    VALUES (v_r.empenho_id, v_r.contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_r.valor_empenhado,
            jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'contract_key', v_r.contract_key, 'origem', 'EMENDA'));
    v_inseridos := v_inseridos + 1;
  END LOOP;

  RETURN jsonb_build_object('inseridos', v_inseridos, 'atualizados', v_atualizados, 'removidos', v_removidos,
                            'mantidos_com_trabalho_do_gestor', v_mantidos,
                            'vinculos_emenda', (SELECT count(*) FROM public.contrato_empenhos WHERE origem = 'EMENDA'));
END;
$$;

REVOKE ALL ON FUNCTION public.ligar_notas_das_emendas_aos_contratos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ligar_notas_das_emendas_aos_contratos() TO service_role;

COMMENT ON FUNCTION public.ligar_notas_das_emendas_aos_contratos() IS
  'Liga ao contrato do pedido de emenda (origem EMENDA) a nota que a fonte não liga a contrato nenhum (migration 255).';

-- 4. Carga inicial e agenda ------------------------------------------------------------------------------------------
SELECT public.ligar_notas_das_emendas_aos_contratos();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ligar-notas-das-emendas-aos-contratos';
    PERFORM cron.schedule('ligar-notas-das-emendas-aos-contratos', '59 * * * *',
                          'SELECT public.ligar_notas_das_emendas_aos_contratos()');
  END IF;
END $$;
