-- ==============================================================================
-- MIGRATION 314: contrato com escopo cumprido ("Executado")
-- ==============================================================================
-- Protótipo aprovado em 16/11/2026. A vigência sozinha deixava contratos já
-- entregues e pagos em "Vigentes" e com avisos de prorrogação (127 de 444 em
-- 16/11/2026). Extinção ordinária pelo cumprimento do objeto (art. 140 da Lei
-- 14.133/2021): o sistema SUGERE pelos fatos das fontes e o gestor CONFIRMA com
-- o documento SEI do recebimento definitivo.
--
-- Sugestão (v_contrato_execucao), só em contrato vigente:
--   faturas pagas ou apropriadas (sem as canceladas) entre 99% e 101% do valor
--   global. Acima disso é serviço contínuo com valor anual (11 em 16/11/2026),
--   não escopo cumprido;
--   nenhuma fatura em aberto (Pendente, Aguardando SIAFI, apropriação em
--   andamento, Siafi Erro);
--   nenhum item da Fiscalização (SFC/CGLIC) ainda em curso.
-- Saldo de empenho (empenhado nas notas do contrato menos o faturado) não impede:
-- vira pendência de fechamento (anular o saldo).
--
-- A decisão do gestor guarda a "marca dos fatos" (valor global, nº de faturas e nº
-- de notas). Se a marca mudar (fatura, nota ou aditivo novos), a decisão deixa de
-- valer sozinha: o contrato volta a Vigentes, ou à sugestão se ainda cumpre a regra.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.contrato_execucao_decisoes (
  contract_key VARCHAR(80) PRIMARY KEY,
  decisao VARCHAR(15) NOT NULL CHECK (decisao IN ('EXECUTADO', 'NAO_TERMINOU')),
  documento_sei VARCHAR(20),
  data_recebimento DATE,
  observacao TEXT CHECK (observacao IS NULL OR char_length(observacao) <= 500),
  marca_dos_fatos TEXT NOT NULL,
  decidido_por UUID DEFAULT auth.uid(),
  decidido_por_nome TEXT,
  decidido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (decisao <> 'EXECUTADO' OR (documento_sei IS NOT NULL AND data_recebimento IS NOT NULL))
);

ALTER TABLE public.contrato_execucao_decisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura para logados: contrato_execucao_decisoes" ON public.contrato_execucao_decisoes;
CREATE POLICY "Leitura para logados: contrato_execucao_decisoes"
  ON public.contrato_execucao_decisoes FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.contrato_execucao_decisoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contrato_execucao_decisoes TO authenticated;
GRANT ALL ON public.contrato_execucao_decisoes TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_contrato_execucao_decisoes ON public.contrato_execucao_decisoes';
    EXECUTE 'CREATE TRIGGER trg_audit_contrato_execucao_decisoes AFTER INSERT OR UPDATE OR DELETE ON public.contrato_execucao_decisoes '
         || 'FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()';
  END IF;
END $$;

-- Fatos de cada contrato vigente e o estado da execução --------------------------
CREATE OR REPLACE VIEW public.v_contrato_execucao
WITH (security_invoker = true) AS
WITH contratos AS (
  SELECT c.contract_key,
         NULLIF(c.registro->>'valorGlobal', '')::NUMERIC AS valor_global,
         c.data_vigencia_fim
    FROM public.contratos_oficiais c
   WHERE c.data_vigencia_fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
), faturas AS (
  SELECT f.contract_key,
         COALESCE(SUM(f.valor) FILTER (WHERE f.situacao IN ('Pago', 'Siafi Apropriado')), 0) AS faturado,
         COUNT(*) FILTER (WHERE f.situacao IN ('Pendente', 'Aguardando SIAFI', 'Aproriação em Andamento', 'Apropriação em Andamento', 'Siafi Erro')) AS faturas_abertas,
         COUNT(*) AS faturas
    FROM public.contrato_faturas f
   WHERE NOT COALESCE(f.cancelada, false)
     AND f.situacao IS DISTINCT FROM 'Siafi Cancelado'
   GROUP BY f.contract_key
), notas AS (
  SELECT ce.contract_key, COALESCE(SUM(e.valor_empenhado), 0) AS empenhado, COUNT(*) AS notas
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   GROUP BY ce.contract_key
), fiscalizacao AS (
  SELECT fe.contract_key,
         bool_or(NOT (fe.etapa IN ('SAL', 'FINALIZADO') OR fe.encerrada_em IS NOT NULL)) AS em_curso
    FROM public.fisc_entregas fe
   WHERE fe.responsavel = 'SFC' AND fe.contract_key IS NOT NULL
   GROUP BY fe.contract_key
), fatos AS (
  SELECT c.contract_key,
         c.valor_global,
         COALESCE(f.faturado, 0) AS faturado,
         COALESCE(f.faturas_abertas, 0)::INT AS faturas_abertas,
         GREATEST(COALESCE(n.empenhado, 0) - COALESCE(f.faturado, 0), 0) AS saldo_empenho,
         CASE WHEN fi.contract_key IS NULL THEN 'SEM' WHEN fi.em_curso THEN 'EM_CURSO' ELSE 'FINALIZADA' END AS fiscalizacao,
         COALESCE(c.valor_global, 0)::TEXT || '|' || COALESCE(f.faturas, 0)::TEXT || '|' || COALESCE(n.notas, 0)::TEXT AS marca_dos_fatos
    FROM contratos c
    LEFT JOIN faturas f ON f.contract_key = c.contract_key
    LEFT JOIN notas n ON n.contract_key = c.contract_key
    LEFT JOIN fiscalizacao fi ON fi.contract_key = c.contract_key
), avaliado AS (
  SELECT ft.*,
         (ft.valor_global > 0
           AND ft.faturado >= ft.valor_global * 0.99
           AND ft.faturado <= ft.valor_global * 1.01
           AND ft.faturas_abertas = 0
           AND ft.fiscalizacao <> 'EM_CURSO') AS cumpre_regra,
         d.decisao,
         (d.contract_key IS NOT NULL AND d.marca_dos_fatos = ft.marca_dos_fatos) AS decisao_vale,
         d.documento_sei, d.data_recebimento, d.observacao, d.decidido_por_nome, d.decidido_em
    FROM fatos ft
    LEFT JOIN public.contrato_execucao_decisoes d ON d.contract_key = ft.contract_key
)
SELECT a.contract_key,
       a.valor_global,
       a.faturado,
       a.faturas_abertas,
       a.saldo_empenho,
       a.fiscalizacao,
       CASE
         WHEN a.decisao_vale AND a.decisao = 'EXECUTADO' THEN 'EXECUTADO'
         WHEN a.decisao_vale AND a.decisao = 'NAO_TERMINOU' THEN NULL
         WHEN a.cumpre_regra THEN 'SUGERIDO'
       END AS estado,
       -- Decisão gravada que deixou de valer porque chegou fato novo (fatura, nota ou aditivo).
       (a.decisao IS NOT NULL AND NOT a.decisao_vale) AS decisao_superada,
       a.marca_dos_fatos,
       a.documento_sei,
       a.data_recebimento,
       a.decidido_por_nome,
       a.decidido_em
  FROM avaliado a
 WHERE a.cumpre_regra OR a.decisao IS NOT NULL;

REVOKE ALL ON public.v_contrato_execucao FROM PUBLIC, anon;
GRANT SELECT ON public.v_contrato_execucao TO authenticated, service_role;

-- RPCs ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exigir_decisao_execucao(p_contract_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Faça login.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor do contrato ou o coordenador decidem sobre a execução.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(p_contract_key, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_execucao_contrato(
  p_contract_key TEXT,
  p_documento_sei TEXT,
  p_data_recebimento DATE,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT := btrim(COALESCE(p_contract_key, ''));
  v_sei TEXT := regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g');
  v_obs TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_fatos RECORD;
BEGIN
  PERFORM public.exigir_decisao_execucao(v_key);

  IF char_length(v_sei) < 7 OR char_length(v_sei) > 12 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do documento SEI (TRD ou termo de encerramento).' USING ERRCODE = '22023';
  END IF;
  IF p_data_recebimento IS NULL OR p_data_recebimento > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data do recebimento definitivo (até hoje).' USING ERRCODE = '22023';
  END IF;
  IF v_obs IS NOT NULL AND char_length(v_obs) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A observação pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  -- Confere de novo no servidor: a tela pode estar desatualizada.
  SELECT v.estado, v.marca_dos_fatos INTO v_fatos
    FROM public.v_contrato_execucao v
   WHERE v.contract_key = v_key;

  IF NOT FOUND OR v_fatos.estado IS DISTINCT FROM 'SUGERIDO' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O contrato não está com as faturas pagas somando o valor, sem fatura em aberto e com a fiscalização finalizada. Atualize a tela.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.contrato_execucao_decisoes AS d
    (contract_key, decisao, documento_sei, data_recebimento, observacao, marca_dos_fatos, decidido_por, decidido_por_nome, decidido_em)
  VALUES (v_key, 'EXECUTADO', v_sei, p_data_recebimento, v_obs, v_fatos.marca_dos_fatos, auth.uid(), left(public.nome_do_usuario_logado(), 200), NOW())
  ON CONFLICT (contract_key) DO UPDATE
    SET decisao = EXCLUDED.decisao, documento_sei = EXCLUDED.documento_sei, data_recebimento = EXCLUDED.data_recebimento,
        observacao = EXCLUDED.observacao, marca_dos_fatos = EXCLUDED.marca_dos_fatos, decidido_por = EXCLUDED.decidido_por,
        decidido_por_nome = EXCLUDED.decidido_por_nome, decidido_em = EXCLUDED.decidido_em;

  RETURN jsonb_build_object('contract_key', v_key, 'decisao', 'EXECUTADO');
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_contrato_nao_terminou(p_contract_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT := btrim(COALESCE(p_contract_key, ''));
  v_marca TEXT;
BEGIN
  PERFORM public.exigir_decisao_execucao(v_key);

  SELECT v.marca_dos_fatos
    INTO v_marca
    FROM public.v_contrato_execucao v
   WHERE v.contract_key = v_key AND v.estado = 'SUGERIDO';

  IF v_marca IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este contrato não tem sugestão de escopo cumprido. Atualize a tela.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.contrato_execucao_decisoes AS d
    (contract_key, decisao, marca_dos_fatos, decidido_por, decidido_por_nome, decidido_em)
  VALUES (v_key, 'NAO_TERMINOU', v_marca, auth.uid(), left(public.nome_do_usuario_logado(), 200), NOW())
  ON CONFLICT (contract_key) DO UPDATE
    SET decisao = EXCLUDED.decisao, documento_sei = NULL, data_recebimento = NULL, observacao = NULL,
        marca_dos_fatos = EXCLUDED.marca_dos_fatos, decidido_por = EXCLUDED.decidido_por,
        decidido_por_nome = EXCLUDED.decidido_por_nome, decidido_em = EXCLUDED.decidido_em;

  RETURN jsonb_build_object('contract_key', v_key, 'decisao', 'NAO_TERMINOU');
END;
$$;

CREATE OR REPLACE FUNCTION public.desfazer_decisao_execucao(p_contract_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT := btrim(COALESCE(p_contract_key, ''));
BEGIN
  PERFORM public.exigir_decisao_execucao(v_key);
  DELETE FROM public.contrato_execucao_decisoes WHERE contract_key = v_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Não há decisão gravada para este contrato.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('contract_key', v_key, 'desfeito', true);
END;
$$;

REVOKE ALL ON FUNCTION public.exigir_decisao_execucao(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_execucao_contrato(TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.marcar_contrato_nao_terminou(TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.desfazer_decisao_execucao(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.exigir_decisao_execucao(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_execucao_contrato(TEXT, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_contrato_nao_terminou(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desfazer_decisao_execucao(TEXT) TO authenticated;
