-- ==============================================================================
-- MIGRATION 119: FATURA PAGA POR OB DA OUTRA UG DA CGLIC
-- Versão: 20261014000119_ob_paga_pela_outra_ug.sql
--
-- Contexto (conferência das faturas "Erro no SIAFI" em 14/10/2026): a fatura do Contratos.gov.br só informa a
-- UG contratante, e a sincronização procurava a OB da NP só nessa UG. Mas a NP pode ter sido emitida e paga pela
-- outra UG da CGLIC (200330 ↔ 200331). Medição: 36 NPs de 82 faturas (R$ 14,4 mi, 19 contratos) tinham OB válida
-- na outra UG com a observação citando o número da fatura; o sistema as mostrava aguardando OB ou com erro.
-- Exemplo: NF 50.961-0 do contrato 00020/2020, UG contratante 200330, paga pela OB 2024OB040837 da UG 200331.
--
-- Cuidado: o mesmo número de NP nas duas UGs pode ser documento distinto (como as NEs, migration 80). Por isso a
-- OB da outra UG só vale para a fatura cujo número a observação da OB cita.
--
-- O que entra
-- 1) ob_cita_fatura(observacao, numero): o número da fatura aparece como palavra inteira na observação,
--    separado por espaço, vírgula, ponto e vírgula, dois-pontos ou ponto final; número com menos de 4
--    caracteres não conta. Mesma regra de obCitaFatura em src/services/faturasService.ts.
-- 2) v_contrato_faturas: a OB da fatura é a OB válida da NP na UG da fatura (como antes) ou na outra UG quando
--    a observação cita a fatura. Mesmas colunas, na mesma ordem; o resto da view não muda.
-- 3) Índice de ordens_bancarias por NP (a ligação deixa de usar a UG).
-- 4) gravar_ordens_bancarias ganha p_registrar_consulta (padrão TRUE). A sincronização grava a OB achada na
--    outra UG com FALSE: assim a NP de mesmo número daquela UG não fica marcada como consultada sem ter sido.
--
-- O que não muda: as tabelas, a ligação pela própria UG, a regra de "paga" (OB válida ou situação "Pago"), a
-- conciliação dos ciclos (lê a view e passa a ver o pagamento sozinha). As OBs da outra UG entram pela
-- sincronização de ordens bancárias depois de publicada a função.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) A observação da OB cita a fatura?
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ob_cita_fatura(p_observacao TEXT, p_numero TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_observacao IS NULL OR p_numero IS NULL OR length(btrim(p_numero)) < 4 THEN FALSE
    ELSE upper(p_observacao) ~ (
      '(^|[[:space:],;:])'
      || regexp_replace(upper(btrim(p_numero)), '([^[:alnum:]])', '\\\1', 'g')
      || '($|[[:space:],;:]|\.([[:space:]]|$))'
    )
  END
$$;

COMMENT ON FUNCTION public.ob_cita_fatura(TEXT, TEXT) IS
  'A observação da OB cita o número da fatura como palavra inteira (mínimo 4 caracteres). Liga a fatura à OB da outra UG da CGLIC.';

GRANT EXECUTE ON FUNCTION public.ob_cita_fatura(TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Índice por NP
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ordens_bancarias_np_so_idx ON public.ordens_bancarias (np);

-- ------------------------------------------------------------------------------
-- 3) View das faturas: OB da própria UG ou da outra UG que cita a fatura
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_contrato_faturas
WITH (security_invoker = true)
AS
WITH np_contratos AS (
  SELECT ug_np, np, COUNT(DISTINCT contract_key) AS contratos
    FROM public.contrato_faturas
   WHERE np IS NOT NULL
   GROUP BY ug_np, np
),
nes AS (
  SELECT fe.id_fatura,
         string_agg(COALESCE(fe.numero_empenho, fe.id_empenho_gov), ', ' ORDER BY fe.numero_empenho) AS empenhos,
         COUNT(*) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
               FROM public.empenhos e
               JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
              WHERE e.identificador_fonte = fe.id_empenho_gov
                AND ce.contract_key = f.contract_key
           )
         ) AS empenhos_sem_vinculo,
         string_agg(fe.numero_empenho, ', ' ORDER BY fe.numero_empenho) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
               FROM public.empenhos e
               JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
              WHERE e.identificador_fonte = fe.id_empenho_gov
                AND ce.contract_key = f.contract_key
           )
         ) AS empenhos_sem_vinculo_numeros
    FROM public.fatura_empenhos fe
    JOIN public.contrato_faturas f ON f.id_fatura = fe.id_fatura
   GROUP BY fe.id_fatura
)
SELECT
  f.id_fatura,
  f.contract_key,
  f.numero,
  f.tipo,
  f.emissao,
  f.vencimento,
  f.valor,
  f.glosa,
  f.valor_liquido,
  f.data_liquidacao,
  f.situacao,
  f.cancelada,
  f.np,
  f.ug_np,
  f.referencia,
  ob.obs AS ordens_bancarias,
  ob.ob_emissao,
  ob.ob_valor,
  (NOT f.cancelada AND (ob.obs IS NOT NULL OR f.situacao = 'Pago')) AS paga,
  COALESCE(npc.contratos, 0) AS np_contratos,
  n.empenhos,
  COALESCE(n.empenhos_sem_vinculo, 0) AS empenhos_sem_vinculo,
  n.empenhos_sem_vinculo_numeros,
  f.sincronizado_em
FROM public.contrato_faturas f
LEFT JOIN LATERAL (
  SELECT string_agg(o.numero, ', ' ORDER BY o.emissao, o.numero) AS obs,
         MAX(o.emissao) AS ob_emissao,
         SUM(o.valor) AS ob_valor
    FROM public.ordens_bancarias o
   WHERE NOT o.cancelada
     AND o.np = f.np
     AND (o.ug = f.ug_np OR public.ob_cita_fatura(o.observacao, f.numero))
) ob ON TRUE
LEFT JOIN np_contratos npc ON npc.ug_np = f.ug_np AND npc.np = f.np
LEFT JOIN nes n ON n.id_fatura = f.id_fatura;

COMMENT ON VIEW public.v_contrato_faturas IS
  'Faturas dos contratos com OB válida da NP (na UG da fatura ou, se a observação cita a fatura, na outra UG da CGLIC), situação de pagamento, NP compartilhada entre contratos e NEs citadas sem vínculo com o contrato.';

-- ------------------------------------------------------------------------------
-- 4) gravar_ordens_bancarias com p_registrar_consulta
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gravar_ordens_bancarias(VARCHAR, VARCHAR, JSONB);

CREATE OR REPLACE FUNCTION public.gravar_ordens_bancarias(
  p_ug VARCHAR,
  p_np VARCHAR,
  p_ordens JSONB,
  p_registrar_consulta BOOLEAN DEFAULT TRUE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ug VARCHAR(6) := TRIM(COALESCE(p_ug, ''));
  v_np VARCHAR(20) := UPPER(TRIM(COALESCE(p_np, '')));
  v_ob JSONB;
  v_total INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador grava ordens bancárias.' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_ug ~ '^[0-9]{6}$') OR NOT (v_np ~ '^[0-9]{4}NP[0-9]{6}$') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UG ou NP fora do formato (UG %, NP %).', v_ug, v_np USING ERRCODE = '22023';
  END IF;
  IF p_ordens IS NULL OR jsonb_typeof(p_ordens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de ordens bancárias deve ser um array.' USING ERRCODE = '22023';
  END IF;

  FOR v_ob IN SELECT * FROM jsonb_array_elements(p_ordens)
  LOOP
    IF COALESCE(v_ob->>'numero', '') !~ '^[0-9]{4}OB[0-9]{6}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Número de OB fora do formato: "%"', v_ob->>'numero' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.ordens_bancarias AS o (
      ug, gestao, numero, np, emissao, valor, cancelada, ob_cancelamento, tipo_ob, favorecido_documento,
      favorecido_nome, banco, agencia, conta, processo, observacao, empenhos, consultado_em
    ) VALUES (
      v_ug, COALESCE(NULLIF(v_ob->>'gestao', ''), '00001'), v_ob->>'numero', v_np,
      public.texto_para_data(v_ob->>'emissao'), COALESCE((v_ob->>'valor')::NUMERIC, 0),
      COALESCE((v_ob->>'cancelada')::BOOLEAN, FALSE), v_ob->>'ob_cancelamento', v_ob->>'tipo_ob',
      v_ob->>'favorecido_documento', v_ob->>'favorecido_nome', v_ob->>'banco', v_ob->>'agencia', v_ob->>'conta',
      v_ob->>'processo', v_ob->>'observacao',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_ob->'empenhos')), '{}'), NOW()
    )
    ON CONFLICT (ug, gestao, numero) DO UPDATE SET
      np = EXCLUDED.np, emissao = EXCLUDED.emissao, valor = EXCLUDED.valor, cancelada = EXCLUDED.cancelada,
      ob_cancelamento = EXCLUDED.ob_cancelamento, tipo_ob = EXCLUDED.tipo_ob,
      favorecido_documento = EXCLUDED.favorecido_documento, favorecido_nome = EXCLUDED.favorecido_nome,
      banco = EXCLUDED.banco, agencia = EXCLUDED.agencia, conta = EXCLUDED.conta, processo = EXCLUDED.processo,
      observacao = EXCLUDED.observacao, empenhos = EXCLUDED.empenhos, consultado_em = NOW();
    v_total := v_total + 1;
  END LOOP;

  IF COALESCE(p_registrar_consulta, TRUE) THEN
    INSERT INTO public.np_consultas AS c (ug, np, obs, consultado_em)
    VALUES (v_ug, v_np, v_total, NOW())
    ON CONFLICT (ug, np) DO UPDATE SET obs = EXCLUDED.obs, consultado_em = NOW();
  END IF;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_ordens_bancarias(VARCHAR, VARCHAR, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_ordens_bancarias(VARCHAR, VARCHAR, JSONB, BOOLEAN) TO authenticated, service_role;
