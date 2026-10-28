-- ==============================================================================
-- Feriados do ano importados sozinhos (aprovado pelo usuário em 28/10/2026)
--
-- A conta dos prazos do plano em dias úteis (somar_dias_uteis, migration 210) só
-- enxerga a tabela holidays: ano não importado era ano sem feriado, sem aviso. As
-- telas já tinham o calendário calculado como plano B (src/config/holidayCalendar.ts).
--
--   1. feriados_calculados(ano): as mesmas regras do botão "Importar" da tela Feriados
--      (nacionais e do DF pela Páscoa + pontos facultativos de costume). Não depende da
--      BrasilAPI: a lista nacional dela é a mesma que o sistema calcula.
--   2. garantir_feriados(): todo dia, o ano corrente e o seguinte. Só importa o ano que
--      ainda não tem NENHUMA data cadastrada; ano com cadastro não é tocado (o que o
--      administrador apagou, desativou ou marcou como meio expediente continua valendo).
--   3. Feriado cadastrado, mudado ou apagado: os prazos dos planos se recalculam.
-- A portaria anual de pontos facultativos do MGI continua conferida na tela Feriados.
-- ==============================================================================

-- 1. Calendário calculado -----------------------------------------------------------
-- Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), igual a easterSunday() das telas.
CREATE OR REPLACE FUNCTION public.domingo_de_pascoa(p_ano INTEGER)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  a INTEGER := p_ano % 19;
  b INTEGER := p_ano / 100;
  c INTEGER := p_ano % 100;
  d INTEGER := b / 4;
  e INTEGER := b % 4;
  f INTEGER := (b + 8) / 25;
  g INTEGER := (b - f + 1) / 3;
  h INTEGER := (19 * a + b - d - g + 15) % 30;
  i INTEGER := c / 4;
  k INTEGER := c % 4;
  l INTEGER := (32 + 2 * e + 2 * i - h - k) % 7;
  m INTEGER := (a + 11 * h + 22 * l) / 451;
BEGIN
  RETURN make_date(p_ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
END;
$$;

-- Mesmas datas de computeBaselineHolidays() + computeUsualPontosFacultativos().
CREATE OR REPLACE FUNCTION public.feriados_calculados(p_ano INTEGER)
RETURNS TABLE (data DATE, nome TEXT, tipo TEXT, meio_expediente BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH p AS (SELECT public.domingo_de_pascoa(p_ano) AS pascoa)
  SELECT x.data, x.nome, x.tipo, x.meio_expediente
    FROM p, LATERAL (VALUES
      (make_date(p_ano, 1, 1), 'Confraternização Universal', 'NACIONAL', FALSE),
      (p.pascoa - 48, 'Carnaval', 'NACIONAL', FALSE),
      (p.pascoa - 47, 'Carnaval', 'NACIONAL', FALSE),
      (p.pascoa - 46, 'Quarta-feira de Cinzas (até 14h)', 'PONTO_FACULTATIVO', TRUE),
      (p.pascoa - 2, 'Sexta-feira Santa', 'NACIONAL', FALSE),
      (make_date(p_ano, 4, 21), 'Tiradentes / Fundação de Brasília', 'NACIONAL', FALSE),
      (make_date(p_ano, 5, 1), 'Dia do Trabalho', 'NACIONAL', FALSE),
      (p.pascoa + 60, 'Corpus Christi', 'NACIONAL', FALSE),
      (make_date(p_ano, 9, 7), 'Independência do Brasil', 'NACIONAL', FALSE),
      (make_date(p_ano, 10, 12), 'Nossa Senhora Aparecida', 'NACIONAL', FALSE),
      (make_date(p_ano, 10, 28), 'Dia do Servidor Público', 'PONTO_FACULTATIVO', FALSE),
      (make_date(p_ano, 11, 2), 'Finados', 'NACIONAL', FALSE),
      (make_date(p_ano, 11, 15), 'Proclamação da República', 'NACIONAL', FALSE),
      (make_date(p_ano, 11, 30), 'Dia do Evangélico (DF)', 'DISTRITAL', FALSE),
      (make_date(p_ano, 12, 24), 'Véspera de Natal (após 14h)', 'PONTO_FACULTATIVO', TRUE),
      (make_date(p_ano, 12, 25), 'Natal', 'NACIONAL', FALSE),
      (make_date(p_ano, 12, 31), 'Véspera de Ano Novo (após 14h)', 'PONTO_FACULTATIVO', TRUE)
    ) AS x(data, nome, tipo, meio_expediente)
  UNION ALL
  -- Consciência Negra é feriado nacional desde a Lei 14.759/2023.
  SELECT make_date(p_ano, 11, 20), 'Dia da Consciência Negra', 'NACIONAL', FALSE WHERE p_ano >= 2024
  ORDER BY 1;
$$;

-- 2. Importação do ano -------------------------------------------------------------
-- Só o ano sem nenhuma data cadastrada. Devolve quantas datas entraram.
CREATE OR REPLACE FUNCTION public.garantir_feriados_do_ano(p_ano INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n INTEGER := 0;
BEGIN
  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RETURN 0;
  END IF;
  IF EXISTS (SELECT 1 FROM public.holidays h WHERE h.data BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)) THEN
    RETURN 0;
  END IF;

  WITH novos AS (
    INSERT INTO public.holidays (data, nome, tipo, origem, ativo, meio_expediente, updated_by, updated_at)
    SELECT f.data, f.nome, f.tipo, 'CALCULADO', TRUE, f.meio_expediente, NULL, NOW()
      FROM public.feriados_calculados(p_ano) f
    ON CONFLICT (data) DO NOTHING
    RETURNING *
  ), auditoria AS (
    INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
    SELECT 'holidays', n.data::TEXT, 'INSERT', NULL, to_jsonb(n), NULL FROM novos n
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM auditoria;
  RETURN v_n;
END;
$$;

-- Rotina diária: o ano corrente e o seguinte (prazos de prorrogação já caem no ano seguinte
-- desde o meio do ano).
CREATE OR REPLACE FUNCTION public.garantir_feriados()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ano INTEGER := EXTRACT(YEAR FROM public.hoje_brasilia())::INTEGER;
BEGIN
  RETURN jsonb_build_object(
    v_ano::TEXT, public.garantir_feriados_do_ano(v_ano),
    (v_ano + 1)::TEXT, public.garantir_feriados_do_ano(v_ano + 1)
  );
END;
$$;

-- 3. Feriado mudou: os prazos dos planos se recalculam ------------------------------
CREATE OR REPLACE FUNCTION public.trg_feriados_reprojetar_planos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan RECORD;
BEGIN
  FOR v_plan IN
    SELECT DISTINCT m.plan_id
      FROM public.contract_task_macrotasks m
      JOIN public.contract_tasks t ON t.macrotask_id = m.id
     WHERE m.modulo_id IS NOT NULL AND t.status IN ('PENDENTE', 'EM_ANDAMENTO')
  LOOP
    PERFORM public.projetar_prazos_contrato(v_plan.plan_id, NULL, FALSE);
  END LOOP;
  FOR v_plan IN
    SELECT DISTINCT m.plan_id
      FROM public.ata_task_macrotasks m
      JOIN public.ata_tasks t ON t.macrotask_id = m.id
     WHERE m.modulo_id IS NOT NULL AND t.status IN ('PENDENTE', 'EM_ANDAMENTO')
  LOOP
    PERFORM public.projetar_prazos_ata(v_plan.plan_id, NULL, FALSE);
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_holidays_reprojetar_planos ON public.holidays;
CREATE TRIGGER trg_holidays_reprojetar_planos AFTER INSERT OR UPDATE OR DELETE ON public.holidays
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_feriados_reprojetar_planos();

-- 4. Permissões ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.domingo_de_pascoa(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.feriados_calculados(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.garantir_feriados_do_ano(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.garantir_feriados() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_feriados_reprojetar_planos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.domingo_de_pascoa(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.feriados_calculados(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.garantir_feriados() TO service_role;

-- 5. Agenda: todo dia às 06:13 de Brasília (minuto livre, antes do plano automático) --
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'garantir-feriados';
    PERFORM cron.schedule('garantir-feriados', '13 9 * * *', 'SELECT public.garantir_feriados()');
  END IF;
END $$;
