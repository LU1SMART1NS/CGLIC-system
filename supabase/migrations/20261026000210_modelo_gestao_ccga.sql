-- ==============================================================================
-- Modelo de gestão da CCGA: plano do gestor, prazos projetados e 19 módulos
--
-- Protótipo aprovado pelo usuário em 26/10/2026 (versão 3, a partir dos roteiros
-- de procedimento da CCGA e de processos reais). Esta é a entrega 1 (banco e motor):
--
--   1. Tarefas dos modelos e dos planos ganham a AÇÃO do gestor (fazer, orientar,
--      conferir, disponibilizar para assinatura, lançar, acompanhar), com quem,
--      o que pedir/conferir, modelo SEI, esforço estimado e a REGRA DE PRAZO.
--   2. Cada aplicação de modelo vira um MÓDULO com linha própria (processo SEI,
--      data de partida, variante).
--   3. O PRAZO de cada tarefa é projetado pela regra e gravado no campo prazo que
--      já existe; assim os avisos de tarefa próxima/atrasada do Início funcionam
--      sem o gestor digitar data. Recalcula quando uma tarefa anda, quando o
--      gestor ajusta a data ou quando a vigência muda na fonte.
--   4. Orientar tem duas marcas: pedido enviado e resposta recebida.
--   5. Os 7 modelos genéricos de contrato ficam inativos; entram os 7 módulos de
--      ata e os 12 de contrato da CCGA (PAAR fica para depois).
--
-- Regras de prazo (prazo_ancora):
--   VIGENCIA_FIM  dias corridos a partir do fim da vigência (D−120 = -120)
--   INICIO        dias corridos a partir da assinatura do instrumento
--   APLICACAO     a partir da data de partida do módulo (pedido, leitura, data-base)
--   ANTERIOR      a partir do fim da tarefa anterior do módulo (conclusão real, ou
--                 a data projetada dela; para orientar, a resposta)
--   FIXO / NULL   sem projeção (o gestor informa)
-- Dias úteis usam a tabela holidays (feriados ativos de dia inteiro).
-- A data ajustada pelo gestor (prazo_ajustado) não é sobrescrita.
-- ==============================================================================

-- 1. Colunas dos modelos ---------------------------------------------------------
ALTER TABLE public.contract_task_templates
  ADD COLUMN IF NOT EXISTS gatilho VARCHAR(30),
  ADD COLUMN IF NOT EXISTS gatilho_dias INTEGER,
  ADD COLUMN IF NOT EXISTS quando TEXT,
  ADD COLUMN IF NOT EXISTS base TEXT,
  ADD COLUMN IF NOT EXISTS processo_tipo VARCHAR(60),
  ADD COLUMN IF NOT EXISTS variantes TEXT[],
  ADD COLUMN IF NOT EXISTS origem_modelo VARCHAR(20);
ALTER TABLE public.ata_task_templates
  ADD COLUMN IF NOT EXISTS gatilho VARCHAR(30),
  ADD COLUMN IF NOT EXISTS gatilho_dias INTEGER,
  ADD COLUMN IF NOT EXISTS quando TEXT,
  ADD COLUMN IF NOT EXISTS base TEXT,
  ADD COLUMN IF NOT EXISTS processo_tipo VARCHAR(60),
  ADD COLUMN IF NOT EXISTS variantes TEXT[],
  ADD COLUMN IF NOT EXISTS origem_modelo VARCHAR(20);

DO $$
DECLARE v_tab TEXT;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY['contract_task_template_tasks', 'ata_task_template_tasks', 'contract_tasks', 'ata_tasks'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS acao VARCHAR(12),
        ADD COLUMN IF NOT EXISTS com_quem VARCHAR(200),
        ADD COLUMN IF NOT EXISTS lista TEXT[],
        ADD COLUMN IF NOT EXISTS nota TEXT,
        ADD COLUMN IF NOT EXISTS modelo_sei VARCHAR(300),
        ADD COLUMN IF NOT EXISTS prazo_texto VARCHAR(120),
        ADD COLUMN IF NOT EXISTS prazo_ancora VARCHAR(20),
        ADD COLUMN IF NOT EXISTS prazo_dias INTEGER,
        ADD COLUMN IF NOT EXISTS prazo_uteis BOOLEAN,
        ADD COLUMN IF NOT EXISTS resposta_texto VARCHAR(120),
        ADD COLUMN IF NOT EXISTS resposta_dias INTEGER,
        ADD COLUMN IF NOT EXISTS resposta_uteis BOOLEAN,
        ADD COLUMN IF NOT EXISTS esforco_min INTEGER,
        ADD COLUMN IF NOT EXISTS do_pregao BOOLEAN NOT NULL DEFAULT FALSE
    $f$, v_tab);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tab, v_tab || '_acao_check');
    EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (acao IN ('FAZER', 'ORIENTAR', 'CONFERIR', 'ASSINAR', 'LANCAR', 'ACOMPANHAR'))$f$, v_tab, v_tab || '_acao_check');
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tab, v_tab || '_prazo_ancora_check');
    EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (prazo_ancora IN ('VIGENCIA_FIM', 'INICIO', 'APLICACAO', 'ANTERIOR', 'FIXO'))$f$, v_tab, v_tab || '_prazo_ancora_check');
  END LOOP;
END $$;

-- 2. Colunas das tarefas dos planos ----------------------------------------------
DO $$
DECLARE v_tab TEXT;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY['contract_tasks', 'ata_tasks'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS template_task_id VARCHAR(60),
        ADD COLUMN IF NOT EXISTS prazo_ajustado BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS prazo_minimo DATE,
        ADD COLUMN IF NOT EXISTS prazo_resposta DATE,
        ADD COLUMN IF NOT EXISTS pedido_enviado_em DATE,
        ADD COLUMN IF NOT EXISTS pedido_sei VARCHAR(25),
        ADD COLUMN IF NOT EXISTS resposta_em DATE,
        ADD COLUMN IF NOT EXISTS resposta_sei VARCHAR(25)
    $f$, v_tab);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tab, v_tab || '_pedido_sei_formato');
    EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (pedido_sei ~ '^(\d{7,10}|\d{5}\.\d{6}/\d{4}-\d{2})$')$f$, v_tab, v_tab || '_pedido_sei_formato');
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tab, v_tab || '_resposta_sei_formato');
    EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (resposta_sei ~ '^(\d{7,10}|\d{5}\.\d{6}/\d{4}-\d{2})$')$f$, v_tab, v_tab || '_resposta_sei_formato');
  END LOOP;
END $$;

COMMENT ON COLUMN public.contract_tasks.acao IS 'Ação do gestor: FAZER, ORIENTAR, CONFERIR, ASSINAR (disponibilizar para assinatura), LANCAR (sistema estruturante) ou ACOMPANHAR (outra unidade faz).';
COMMENT ON COLUMN public.contract_tasks.prazo_ajustado IS 'TRUE quando o gestor mudou a data: a projeção pela regra não mexe mais nela.';
COMMENT ON COLUMN public.contract_tasks.prazo_minimo IS 'Piso da data: módulo aplicado tarde ganha hoje + 5 dias úteis nas datas que já passaram.';
COMMENT ON COLUMN public.contract_tasks.prazo_resposta IS 'Orientar: data esperada da resposta (pedido enviado, ou data projetada, + resposta_dias).';

-- 3. Módulos (uma linha por aplicação de modelo) ---------------------------------
CREATE TABLE IF NOT EXISTS public.contract_task_modulos (
  modulo_id VARCHAR(60) PRIMARY KEY,
  plan_id VARCHAR(60) NOT NULL REFERENCES public.contract_task_plans(id) ON DELETE CASCADE,
  template_id VARCHAR(60),
  nome VARCHAR(200) NOT NULL,
  processo_tipo VARCHAR(60),
  processo_sei VARCHAR(25) CHECK (processo_sei ~ '^\d{5}\.\d{6}/\d{4}-\d{2}$'),
  variante TEXT,
  ancora_data DATE NOT NULL DEFAULT CURRENT_DATE,
  aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aplicado_por_user_id UUID
);
CREATE TABLE IF NOT EXISTS public.ata_task_modulos (
  modulo_id VARCHAR(60) PRIMARY KEY,
  plan_id VARCHAR(60) NOT NULL REFERENCES public.ata_task_plans(id) ON DELETE CASCADE,
  template_id VARCHAR(60),
  nome VARCHAR(200) NOT NULL,
  processo_tipo VARCHAR(60),
  processo_sei VARCHAR(25) CHECK (processo_sei ~ '^\d{5}\.\d{6}/\d{4}-\d{2}$'),
  variante TEXT,
  ancora_data DATE NOT NULL DEFAULT CURRENT_DATE,
  aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aplicado_por_user_id UUID
);
CREATE INDEX IF NOT EXISTS idx_contract_task_modulos_plan ON public.contract_task_modulos(plan_id);
CREATE INDEX IF NOT EXISTS idx_ata_task_modulos_plan ON public.ata_task_modulos(plan_id);

ALTER TABLE public.contract_task_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_task_modulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura autenticada: contract_task_modulos" ON public.contract_task_modulos;
CREATE POLICY "Leitura autenticada: contract_task_modulos" ON public.contract_task_modulos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada: ata_task_modulos" ON public.ata_task_modulos;
CREATE POLICY "Leitura autenticada: ata_task_modulos" ON public.ata_task_modulos FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.contract_task_modulos, public.ata_task_modulos FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.contract_task_modulos, public.ata_task_modulos FROM authenticated;
GRANT SELECT ON public.contract_task_modulos, public.ata_task_modulos TO authenticated;
GRANT ALL ON public.contract_task_modulos, public.ata_task_modulos TO service_role;

DROP TRIGGER IF EXISTS trg_audit_contract_task_modulos ON public.contract_task_modulos;
CREATE TRIGGER trg_audit_contract_task_modulos AFTER INSERT OR UPDATE OR DELETE ON public.contract_task_modulos
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
DROP TRIGGER IF EXISTS trg_audit_ata_task_modulos ON public.ata_task_modulos;
CREATE TRIGGER trg_audit_ata_task_modulos AFTER INSERT OR UPDATE OR DELETE ON public.ata_task_modulos
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- 4. Datas de partida ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.somar_dias_uteis(p_data DATE, p_dias INTEGER)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_data DATE := p_data;
  v_resta INTEGER := COALESCE(p_dias, 0);
BEGIN
  IF p_data IS NULL THEN
    RETURN NULL;
  END IF;
  WHILE v_resta > 0 LOOP
    v_data := v_data + 1;
    IF EXTRACT(ISODOW FROM v_data) < 6
       AND NOT EXISTS (
         SELECT 1 FROM public.holidays h
          WHERE h.data = v_data AND h.ativo AND NOT COALESCE(h.meio_expediente, FALSE)
       ) THEN
      v_resta := v_resta - 1;
    END IF;
  END LOOP;
  RETURN v_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.hoje_brasilia()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- Vigência do contrato: assinatura (ou início da vigência) e fim.
CREATE OR REPLACE FUNCTION public.vigencia_do_contrato(p_contract_key TEXT)
RETURNS TABLE (inicio DATE, fim DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN c.registro->>'dataAssinatura' ~ '^\d{4}-\d{2}-\d{2}' THEN left(c.registro->>'dataAssinatura', 10)::date
           WHEN c.registro->>'dataVigenciaInicio' ~ '^\d{4}-\d{2}-\d{2}' THEN left(c.registro->>'dataVigenciaInicio', 10)::date
         END,
         c.data_vigencia_fim::date
    FROM public.contratos_oficiais c
   WHERE c.contract_key = p_contract_key
      OR c.contract_key = regexp_replace(btrim(COALESCE(p_contract_key, '')), '^(\d{6})-0*(\d{1,5})-(\d{4})$', '\1-') ||
                          lpad(substring(btrim(COALESCE(p_contract_key, '')) FROM '^\d{6}-0*(\d{1,5})-\d{4}$'), 5, '0') ||
                          '-' || substring(btrim(COALESCE(p_contract_key, '')) FROM '-(\d{4})$')
   ORDER BY (c.contract_key = p_contract_key) DESC
   LIMIT 1;
$$;

-- Vigência da ata: a chave é "NNNNN/AAAA" (UASG da CGLIC) ou "NNNNN/AAAA-UASG".
CREATE OR REPLACE FUNCTION public.vigencia_da_ata(p_ata_key TEXT)
RETURNS TABLE (inicio DATE, fim DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.data_vigencia_inicial::date, a.data_vigencia_final::date
    FROM public.atas_registro_preco a
   WHERE a.numero_ata = regexp_replace(btrim(COALESCE(p_ata_key, '')), '-\d{6}$', '')
     AND (
           (substring(btrim(COALESCE(p_ata_key, '')) FROM '-(\d{6})$') IS NOT NULL
             AND a.codigo_uasg = substring(btrim(p_ata_key) FROM '-(\d{6})$'))
        OR (substring(btrim(COALESCE(p_ata_key, '')) FROM '-(\d{6})$') IS NULL
             AND a.codigo_uasg IN ('200331', '200330'))
         )
   ORDER BY (a.codigo_uasg = '200331') DESC, a.data_vigencia_final DESC NULLS LAST
   LIMIT 1;
$$;

-- 5. Cálculo puro dos prazos de um módulo ----------------------------------------
-- Recebe as tarefas do módulo na ordem e devolve [{id, prazo, prazo_resposta}].
CREATE OR REPLACE FUNCTION public.calcular_prazos_modulo(
  p_tarefas JSONB,
  p_vig_fim DATE,
  p_inicio DATE,
  p_ancora DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_t JSONB;
  v_out JSONB := '[]'::jsonb;
  v_prev DATE := NULL;
  v_base DATE;
  v_d DATE;
  v_resp DATE;
  v_fim DATE;
  v_anc TEXT;
  v_dias INTEGER;
  v_status TEXT;
  v_min DATE;
  v_ped DATE;
  v_partida DATE;
BEGIN
  FOR v_t IN
    SELECT x.v FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) WITH ORDINALITY AS x(v, n) ORDER BY x.n
  LOOP
    v_status := v_t->>'status';
    v_anc := v_t->>'prazo_ancora';
    v_dias := (v_t->>'prazo_dias')::INTEGER;
    v_min := (v_t->>'prazo_minimo')::DATE;
    v_ped := (v_t->>'pedido_enviado_em')::DATE;

    v_base := CASE v_anc
                WHEN 'VIGENCIA_FIM' THEN p_vig_fim
                WHEN 'INICIO' THEN p_inicio
                WHEN 'APLICACAO' THEN p_ancora
                WHEN 'ANTERIOR' THEN COALESCE(v_prev, p_ancora)
                ELSE NULL
              END;

    IF COALESCE((v_t->>'prazo_ajustado')::BOOLEAN, FALSE) OR v_base IS NULL OR v_dias IS NULL THEN
      v_d := (v_t->>'prazo')::DATE;
    ELSE
      v_d := CASE
               WHEN COALESCE((v_t->>'prazo_uteis')::BOOLEAN, TRUE) AND v_dias > 0 THEN public.somar_dias_uteis(v_base, v_dias)
               ELSE v_base + v_dias
             END;
      IF v_min IS NOT NULL AND v_d < v_min THEN
        v_d := v_min;
      END IF;
    END IF;

    v_resp := NULL;
    v_partida := COALESCE(v_ped, v_d);
    IF v_t->>'acao' = 'ORIENTAR' AND (v_t->>'resposta_dias') IS NOT NULL AND v_partida IS NOT NULL THEN
      IF v_anc = 'VIGENCIA_FIM' AND NOT COALESCE((v_t->>'resposta_uteis')::BOOLEAN, TRUE) AND p_vig_fim IS NOT NULL AND v_dias IS NOT NULL THEN
        -- "resposta até D−X": prazo fixo pela vigência; se já passou quando o pedido sai, 5 dias úteis.
        v_resp := p_vig_fim + v_dias + (v_t->>'resposta_dias')::INTEGER;
        IF v_resp <= v_partida THEN
          v_resp := public.somar_dias_uteis(v_partida, 5);
        END IF;
      ELSIF COALESCE((v_t->>'resposta_uteis')::BOOLEAN, TRUE) THEN
        v_resp := public.somar_dias_uteis(v_partida, (v_t->>'resposta_dias')::INTEGER);
      ELSE
        v_resp := v_partida + (v_t->>'resposta_dias')::INTEGER;
      END IF;
    END IF;

    IF v_status = 'CONCLUIDA' THEN
      v_fim := COALESCE((v_t->>'resposta_em')::DATE, (v_t->>'concluido_em')::DATE, v_d);
    ELSIF v_status = 'NAO_APLICAVEL' THEN
      v_fim := NULL;
    ELSE
      v_fim := COALESCE(v_resp, v_d);
    END IF;
    IF v_fim IS NOT NULL THEN
      v_prev := v_fim;
    END IF;

    v_out := v_out || jsonb_build_object(
      'id', v_t->>'id',
      'prazo', CASE WHEN v_status IN ('CONCLUIDA', 'NAO_APLICAVEL') THEN (v_t->>'prazo')::DATE ELSE v_d END,
      'prazo_resposta', v_resp
    );
  END LOOP;
  RETURN v_out;
END;
$$;

-- 6. Projeção nos planos ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_do_modulo_contrato(p_modulo_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'status', t.status, 'acao', t.acao,
           'prazo_ancora', t.prazo_ancora, 'prazo_dias', t.prazo_dias, 'prazo_uteis', t.prazo_uteis,
           'resposta_dias', t.resposta_dias, 'resposta_uteis', t.resposta_uteis,
           'prazo', t.prazo, 'prazo_ajustado', t.prazo_ajustado, 'prazo_minimo', t.prazo_minimo,
           'pedido_enviado_em', t.pedido_enviado_em, 'resposta_em', t.resposta_em,
           'concluido_em', (t.concluido_em AT TIME ZONE 'America/Sao_Paulo')::date
         ) ORDER BY m.ordem, t.ordem, t.criado_em), '[]'::jsonb)
    FROM public.contract_tasks t
    JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id
   WHERE m.modulo_id = p_modulo_id;
$$;

CREATE OR REPLACE FUNCTION public.tarefas_do_modulo_ata(p_modulo_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'status', t.status, 'acao', t.acao,
           'prazo_ancora', t.prazo_ancora, 'prazo_dias', t.prazo_dias, 'prazo_uteis', t.prazo_uteis,
           'resposta_dias', t.resposta_dias, 'resposta_uteis', t.resposta_uteis,
           'prazo', t.prazo, 'prazo_ajustado', t.prazo_ajustado, 'prazo_minimo', t.prazo_minimo,
           'pedido_enviado_em', t.pedido_enviado_em, 'resposta_em', t.resposta_em,
           'concluido_em', (t.concluido_em AT TIME ZONE 'America/Sao_Paulo')::date
         ) ORDER BY m.ordem, t.ordem, t.criado_em), '[]'::jsonb)
    FROM public.ata_tasks t
    JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
   WHERE m.modulo_id = p_modulo_id;
$$;

CREATE OR REPLACE FUNCTION public.projetar_prazos_contrato(
  p_plan_id TEXT,
  p_modulo_id TEXT DEFAULT NULL,
  p_entrada BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_ini DATE;
  v_fim DATE;
  v_mod RECORD;
  v_res JSONB;
  v_min DATE;
  v_n INTEGER;
  v_total INTEGER := 0;
  v_flag TEXT := COALESCE(current_setting('cglic.projetando', true), '');
BEGIN
  SELECT contract_key INTO v_key FROM public.contract_task_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT v.inicio, v.fim INTO v_ini, v_fim FROM public.vigencia_do_contrato(v_key) v;

  PERFORM set_config('cglic.projetando', '1', true);
  FOR v_mod IN
    SELECT mo.modulo_id, mo.ancora_data FROM public.contract_task_modulos mo
     WHERE mo.plan_id = p_plan_id AND (p_modulo_id IS NULL OR mo.modulo_id = p_modulo_id)
  LOOP
    v_res := public.calcular_prazos_modulo(public.tarefas_do_modulo_contrato(v_mod.modulo_id), v_fim, v_ini, v_mod.ancora_data);
    IF p_entrada THEN
      v_min := public.somar_dias_uteis(public.hoje_brasilia(), 5);
      UPDATE public.contract_tasks t
         SET prazo_minimo = v_min
        FROM jsonb_array_elements(v_res) AS x(v)
       WHERE t.id = x.v->>'id'
         AND (x.v->>'prazo')::DATE < public.hoje_brasilia()
         AND t.status IN ('PENDENTE', 'EM_ANDAMENTO')
         AND NOT t.prazo_ajustado;
      v_res := public.calcular_prazos_modulo(public.tarefas_do_modulo_contrato(v_mod.modulo_id), v_fim, v_ini, v_mod.ancora_data);
    END IF;
    UPDATE public.contract_tasks t
       SET prazo = (x.v->>'prazo')::DATE,
           prazo_resposta = (x.v->>'prazo_resposta')::DATE
      FROM jsonb_array_elements(v_res) AS x(v)
     WHERE t.id = x.v->>'id'
       AND (t.prazo IS DISTINCT FROM (x.v->>'prazo')::DATE
            OR t.prazo_resposta IS DISTINCT FROM (x.v->>'prazo_resposta')::DATE);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;
  PERFORM set_config('cglic.projetando', v_flag, true);
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.projetar_prazos_ata(
  p_plan_id TEXT,
  p_modulo_id TEXT DEFAULT NULL,
  p_entrada BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_ini DATE;
  v_fim DATE;
  v_mod RECORD;
  v_res JSONB;
  v_min DATE;
  v_n INTEGER;
  v_total INTEGER := 0;
  v_flag TEXT := COALESCE(current_setting('cglic.projetando', true), '');
BEGIN
  SELECT ata_key INTO v_key FROM public.ata_task_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT v.inicio, v.fim INTO v_ini, v_fim FROM public.vigencia_da_ata(v_key) v;

  PERFORM set_config('cglic.projetando', '1', true);
  FOR v_mod IN
    SELECT mo.modulo_id, mo.ancora_data FROM public.ata_task_modulos mo
     WHERE mo.plan_id = p_plan_id AND (p_modulo_id IS NULL OR mo.modulo_id = p_modulo_id)
  LOOP
    v_res := public.calcular_prazos_modulo(public.tarefas_do_modulo_ata(v_mod.modulo_id), v_fim, v_ini, v_mod.ancora_data);
    IF p_entrada THEN
      v_min := public.somar_dias_uteis(public.hoje_brasilia(), 5);
      UPDATE public.ata_tasks t
         SET prazo_minimo = v_min
        FROM jsonb_array_elements(v_res) AS x(v)
       WHERE t.id = x.v->>'id'
         AND (x.v->>'prazo')::DATE < public.hoje_brasilia()
         AND t.status IN ('PENDENTE', 'EM_ANDAMENTO')
         AND NOT t.prazo_ajustado;
      v_res := public.calcular_prazos_modulo(public.tarefas_do_modulo_ata(v_mod.modulo_id), v_fim, v_ini, v_mod.ancora_data);
    END IF;
    UPDATE public.ata_tasks t
       SET prazo = (x.v->>'prazo')::DATE,
           prazo_resposta = (x.v->>'prazo_resposta')::DATE
      FROM jsonb_array_elements(v_res) AS x(v)
     WHERE t.id = x.v->>'id'
       AND (t.prazo IS DISTINCT FROM (x.v->>'prazo')::DATE
            OR t.prazo_resposta IS DISTINCT FROM (x.v->>'prazo_resposta')::DATE);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;
  PERFORM set_config('cglic.projetando', v_flag, true);
  RETURN v_total;
END;
$$;

-- 7. Gatilhos: ajuste do gestor e recálculo em cascata ---------------------------
-- Data mudada fora da projeção (tela "Editar prazo") vira data ajustada.
CREATE OR REPLACE FUNCTION public.trg_tarefa_prazo_ajustado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.prazo IS DISTINCT FROM OLD.prazo
     AND NEW.prazo_ajustado = OLD.prazo_ajustado
     AND NEW.prazo_ancora IS NOT NULL
     AND COALESCE(current_setting('cglic.projetando', true), '') <> '1' THEN
    NEW.prazo_ajustado := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_tarefa_contrato_reprojetar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan TEXT;
  v_mod TEXT;
BEGIN
  IF pg_trigger_depth() > 1 OR COALESCE(current_setting('cglic.projetando', true), '') = '1' THEN
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.concluido_em IS DISTINCT FROM OLD.concluido_em
     OR NEW.pedido_enviado_em IS DISTINCT FROM OLD.pedido_enviado_em
     OR NEW.resposta_em IS DISTINCT FROM OLD.resposta_em
     OR NEW.prazo IS DISTINCT FROM OLD.prazo
     OR NEW.prazo_ajustado IS DISTINCT FROM OLD.prazo_ajustado THEN
    SELECT m.plan_id, m.modulo_id INTO v_plan, v_mod FROM public.contract_task_macrotasks m WHERE m.id = NEW.macrotask_id;
    IF v_mod IS NOT NULL THEN
      PERFORM public.projetar_prazos_contrato(v_plan, v_mod, FALSE);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_tarefa_ata_reprojetar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan TEXT;
  v_mod TEXT;
BEGIN
  IF pg_trigger_depth() > 1 OR COALESCE(current_setting('cglic.projetando', true), '') = '1' THEN
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.concluido_em IS DISTINCT FROM OLD.concluido_em
     OR NEW.pedido_enviado_em IS DISTINCT FROM OLD.pedido_enviado_em
     OR NEW.resposta_em IS DISTINCT FROM OLD.resposta_em
     OR NEW.prazo IS DISTINCT FROM OLD.prazo
     OR NEW.prazo_ajustado IS DISTINCT FROM OLD.prazo_ajustado THEN
    SELECT m.plan_id, m.modulo_id INTO v_plan, v_mod FROM public.ata_task_macrotasks m WHERE m.id = NEW.macrotask_id;
    IF v_mod IS NOT NULL THEN
      PERFORM public.projetar_prazos_ata(v_plan, v_mod, FALSE);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_tasks_prazo_ajustado ON public.contract_tasks;
CREATE TRIGGER trg_contract_tasks_prazo_ajustado BEFORE UPDATE ON public.contract_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_prazo_ajustado();
DROP TRIGGER IF EXISTS trg_ata_tasks_prazo_ajustado ON public.ata_tasks;
CREATE TRIGGER trg_ata_tasks_prazo_ajustado BEFORE UPDATE ON public.ata_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_prazo_ajustado();

DROP TRIGGER IF EXISTS trg_contract_tasks_reprojetar ON public.contract_tasks;
CREATE TRIGGER trg_contract_tasks_reprojetar AFTER UPDATE ON public.contract_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_contrato_reprojetar();
DROP TRIGGER IF EXISTS trg_ata_tasks_reprojetar ON public.ata_tasks;
CREATE TRIGGER trg_ata_tasks_reprojetar AFTER UPDATE ON public.ata_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_ata_reprojetar();

-- Módulo apagado (delete_*_task_module_atomic apaga as etapas): some a linha do módulo.
CREATE OR REPLACE FUNCTION public.trg_macrotask_limpar_modulo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.modulo_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'contract_task_macrotasks' THEN
    IF NOT EXISTS (SELECT 1 FROM public.contract_task_macrotasks WHERE modulo_id = OLD.modulo_id) THEN
      DELETE FROM public.contract_task_modulos WHERE modulo_id = OLD.modulo_id;
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.ata_task_macrotasks WHERE modulo_id = OLD.modulo_id) THEN
      DELETE FROM public.ata_task_modulos WHERE modulo_id = OLD.modulo_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_contract_macrotasks_limpar_modulo ON public.contract_task_macrotasks;
CREATE TRIGGER trg_contract_macrotasks_limpar_modulo AFTER DELETE ON public.contract_task_macrotasks
FOR EACH ROW EXECUTE FUNCTION public.trg_macrotask_limpar_modulo();
DROP TRIGGER IF EXISTS trg_ata_macrotasks_limpar_modulo ON public.ata_task_macrotasks;
CREATE TRIGGER trg_ata_macrotasks_limpar_modulo AFTER DELETE ON public.ata_task_macrotasks
FOR EACH ROW EXECUTE FUNCTION public.trg_macrotask_limpar_modulo();

-- Vigência mudou na fonte (aditivo lido): reprojeta os planos.
CREATE OR REPLACE FUNCTION public.trg_contrato_vigencia_reprojetar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT id INTO v_plan FROM public.contract_task_plans WHERE contract_key = NEW.contract_key;
  IF FOUND THEN
    PERFORM public.projetar_prazos_contrato(v_plan, NULL, FALSE);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_ata_vigencia_reprojetar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan RECORD;
BEGIN
  FOR v_plan IN
    SELECT id FROM public.ata_task_plans
     WHERE ata_key = NEW.numero_ata || '-' || NEW.codigo_uasg
        OR (NEW.codigo_uasg IN ('200331', '200330') AND ata_key = NEW.numero_ata)
  LOOP
    PERFORM public.projetar_prazos_ata(v_plan.id, NULL, FALSE);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_contratos_oficiais_vigencia_plano ON public.contratos_oficiais;
CREATE TRIGGER trg_contratos_oficiais_vigencia_plano AFTER UPDATE OF data_vigencia_fim ON public.contratos_oficiais
FOR EACH ROW WHEN (OLD.data_vigencia_fim IS DISTINCT FROM NEW.data_vigencia_fim)
EXECUTE FUNCTION public.trg_contrato_vigencia_reprojetar();
DROP TRIGGER IF EXISTS trg_atas_vigencia_plano ON public.atas_registro_preco;
CREATE TRIGGER trg_atas_vigencia_plano AFTER UPDATE OF data_vigencia_final ON public.atas_registro_preco
FOR EACH ROW WHEN (OLD.data_vigencia_final IS DISTINCT FROM NEW.data_vigencia_final)
EXECUTE FUNCTION public.trg_ata_vigencia_reprojetar();

-- 8. Aplicar modelo: copia a ação e a regra, grava o módulo e projeta ----------
-- Mesma assinatura e mesma conferência do gestor (migration 126) das versões de produção.
CREATE OR REPLACE FUNCTION public.apply_contract_task_template_atomic(p_uasg character varying, p_numero character varying, p_ano integer, p_template_id character varying, p_modulo_nome character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract_key VARCHAR(100);
  v_uasg VARCHAR(10);
  v_numero VARCHAR(50);
  v_template RECORD;
  v_plan_id VARCHAR(60);
  v_plan_exists BOOLEAN;
  v_ordem_base INTEGER := 0;
  v_macrotask RECORD;
  v_new_macrotask_id VARCHAR(60);
  v_modulo_id VARCHAR(60) := 'mod-' || gen_random_uuid()::text;
  v_modulo_nome VARCHAR(200);
  v_task RECORD;
  v_macrotasks_count INTEGER := 0;
  v_tasks_count INTEGER := 0;
BEGIN
  PERFORM public.exigir_alcance_do_gestor((CASE WHEN btrim(COALESCE(p_uasg, '')) <> '' AND btrim(COALESCE(p_numero, '')) <> '' AND p_ano BETWEEN 2000 AND 2100 THEN public.normalize_contract_key(btrim(p_uasg), btrim(p_numero), p_ano) END)::text, NULL);  -- alcance do gestor (migration 126)
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_uasg := TRIM(COALESCE(p_uasg, ''));
  v_numero := TRIM(COALESCE(p_numero, ''));

  IF v_uasg = '' OR v_numero = '' OR p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UASG, número e ano do contrato são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_template FROM public.contract_task_templates WHERE id = TRIM(COALESCE(p_template_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', p_template_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_template.ativo THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" está desativado e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_macrotasks WHERE template_id = v_template.id) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" não possui nenhuma macrotarefa e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  v_contract_key := public.normalize_contract_key(v_uasg, v_numero, p_ano);

  v_modulo_nome := COALESCE(NULLIF(TRIM(COALESCE(p_modulo_nome, '')), ''), v_template.nome);

  SELECT id INTO v_plan_id FROM public.contract_task_plans WHERE contract_key = v_contract_key;
  v_plan_exists := FOUND;

  IF v_plan_exists THEN
    SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_ordem_base
    FROM public.contract_task_macrotasks WHERE plan_id = v_plan_id;
  ELSE
    v_plan_id := 'plan-' || gen_random_uuid()::text;
    INSERT INTO public.contract_task_plans (id, contract_key, uasg, numero, ano, template_id, template_nome, applied_at)
    VALUES (v_plan_id, v_contract_key, v_uasg, v_numero, p_ano, v_template.id, v_template.nome, NOW());
  END IF;

  INSERT INTO public.contract_task_modulos (modulo_id, plan_id, template_id, nome, processo_tipo, ancora_data, aplicado_em, aplicado_por_user_id)
  VALUES (v_modulo_id, v_plan_id, v_template.id, v_modulo_nome, v_template.processo_tipo, public.hoje_brasilia(), NOW(), auth.uid());

  FOR v_macrotask IN
    SELECT * FROM public.contract_task_template_macrotasks
    WHERE template_id = v_template.id
    ORDER BY ordem ASC, created_at ASC
  LOOP
    v_new_macrotask_id := 'ctmt-' || gen_random_uuid()::text;

    INSERT INTO public.contract_task_macrotasks (id, plan_id, nome, ordem, modulo_id, modulo_template_id, modulo_nome, modulo_applied_at)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_ordem_base + v_macrotask.ordem, v_modulo_id, v_template.id, v_modulo_nome, NOW());

    v_macrotasks_count := v_macrotasks_count + 1;

    FOR v_task IN
      SELECT * FROM public.contract_task_template_tasks
      WHERE macrotask_id = v_macrotask.id
      ORDER BY ordem ASC, created_at ASC
    LOOP
      INSERT INTO public.contract_tasks (
        id, macrotask_id, nome, ordem, status, execution_mode, criado_em, atualizado_em,
        template_task_id, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis,
        resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao
      )
      VALUES (
        'ctt-' || gen_random_uuid()::text, v_new_macrotask_id, v_task.nome, v_task.ordem, 'PENDENTE', v_task.execution_mode, NOW(), NOW(),
        v_task.id, v_task.acao, v_task.com_quem, v_task.lista, v_task.nota, v_task.modelo_sei, v_task.prazo_texto, v_task.prazo_ancora, v_task.prazo_dias, v_task.prazo_uteis,
        v_task.resposta_texto, v_task.resposta_dias, v_task.resposta_uteis, v_task.esforco_min, v_task.do_pregao
      );

      v_tasks_count := v_tasks_count + 1;
    END LOOP;
  END LOOP;

  PERFORM public.projetar_prazos_contrato(v_plan_id, v_modulo_id, TRUE);

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'contract_key', v_contract_key,
    'template_id', v_template.id,
    'template_nome', v_template.nome,
    'macrotasks_count', v_macrotasks_count,
    'tasks_count', v_tasks_count,
    'appended', v_plan_exists,
    'modulo_id', v_modulo_id,
    'timestamp', NOW()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_ata_task_template_atomic(p_ata_key character varying, p_template_id character varying, p_modulo_nome character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ata_key VARCHAR(50);
  v_template RECORD;
  v_plan_id VARCHAR(60);
  v_plan_exists BOOLEAN;
  v_ordem_base INTEGER := 0;
  v_macrotask RECORD;
  v_new_macrotask_id VARCHAR(60);
  v_modulo_id VARCHAR(60) := 'mod-' || gen_random_uuid()::text;
  v_modulo_nome VARCHAR(200);
  v_task RECORD;
  v_macrotasks_count INTEGER := 0;
  v_tasks_count INTEGER := 0;
BEGIN
  PERFORM public.exigir_alcance_do_gestor(NULL, (p_ata_key)::text);  -- alcance do gestor (migration 126)
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_ata_key := TRIM(COALESCE(p_ata_key, ''));
  IF v_ata_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número da Ata é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_template FROM public.ata_task_templates WHERE id = TRIM(COALESCE(p_template_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', p_template_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_template.ativo THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" está desativado e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ata_task_template_macrotasks WHERE template_id = v_template.id) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" não possui nenhuma macrotarefa e não pode ser aplicado.', v_template.nome
      USING ERRCODE = '22023';
  END IF;

  v_modulo_nome := COALESCE(NULLIF(TRIM(COALESCE(p_modulo_nome, '')), ''), v_template.nome);

  SELECT id INTO v_plan_id FROM public.ata_task_plans WHERE ata_key = v_ata_key;
  v_plan_exists := FOUND;

  IF v_plan_exists THEN
    SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_ordem_base
    FROM public.ata_task_macrotasks WHERE plan_id = v_plan_id;
  ELSE
    v_plan_id := 'ataplan-' || gen_random_uuid()::text;
    INSERT INTO public.ata_task_plans (id, ata_key, template_id, template_nome, applied_at)
    VALUES (v_plan_id, v_ata_key, v_template.id, v_template.nome, NOW());
  END IF;

  INSERT INTO public.ata_task_modulos (modulo_id, plan_id, template_id, nome, processo_tipo, ancora_data, aplicado_em, aplicado_por_user_id)
  VALUES (v_modulo_id, v_plan_id, v_template.id, v_modulo_nome, v_template.processo_tipo, public.hoje_brasilia(), NOW(), auth.uid());

  FOR v_macrotask IN
    SELECT * FROM public.ata_task_template_macrotasks
    WHERE template_id = v_template.id
    ORDER BY ordem ASC, created_at ASC
  LOOP
    v_new_macrotask_id := 'atmt-' || gen_random_uuid()::text;

    INSERT INTO public.ata_task_macrotasks (id, plan_id, nome, ordem, modulo_id, modulo_template_id, modulo_nome, modulo_applied_at)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_ordem_base + v_macrotask.ordem, v_modulo_id, v_template.id, v_modulo_nome, NOW());

    v_macrotasks_count := v_macrotasks_count + 1;

    FOR v_task IN
      SELECT * FROM public.ata_task_template_tasks
      WHERE macrotask_id = v_macrotask.id
      ORDER BY ordem ASC, created_at ASC
    LOOP
      INSERT INTO public.ata_tasks (
        id, macrotask_id, nome, ordem, status, execution_mode, criado_em, atualizado_em,
        template_task_id, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis,
        resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao
      )
      VALUES (
        'at-' || gen_random_uuid()::text, v_new_macrotask_id, v_task.nome, v_task.ordem, 'PENDENTE', v_task.execution_mode, NOW(), NOW(),
        v_task.id, v_task.acao, v_task.com_quem, v_task.lista, v_task.nota, v_task.modelo_sei, v_task.prazo_texto, v_task.prazo_ancora, v_task.prazo_dias, v_task.prazo_uteis,
        v_task.resposta_texto, v_task.resposta_dias, v_task.resposta_uteis, v_task.esforco_min, v_task.do_pregao
      );

      v_tasks_count := v_tasks_count + 1;
    END LOOP;
  END LOOP;

  PERFORM public.projetar_prazos_ata(v_plan_id, v_modulo_id, TRUE);

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'ata_key', v_ata_key,
    'template_id', v_template.id,
    'template_nome', v_template.nome,
    'macrotasks_count', v_macrotasks_count,
    'tasks_count', v_tasks_count,
    'appended', v_plan_exists,
    'modulo_id', v_modulo_id,
    'timestamp', NOW()
  );
END;
$function$;

-- 9. RPCs do gestor: pedido, resposta, ajuste de data e dados do módulo ---------
CREATE OR REPLACE FUNCTION public.marcar_pedido_tarefa_contrato(p_task_id VARCHAR(60), p_sei TEXT DEFAULT NULL, p_data DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_status TEXT;
  v_record public.contract_tasks%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.contract_key, t.status INTO v_key, v_status
    FROM public.contract_tasks t
    JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.contract_task_plans p ON p.id = m.plan_id
   WHERE t.id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_task_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_key, NULL);

  UPDATE public.contract_tasks
     SET pedido_enviado_em = COALESCE(p_data, public.hoje_brasilia()),
         pedido_sei = public.normalizar_numero_sei(p_sei),
         atualizado_em = NOW()
   WHERE id = v_id;
  IF v_status = 'PENDENTE' THEN
    PERFORM public.update_contract_task_atomic(p_task_id => v_id, p_status => 'EM_ANDAMENTO');
  END IF;

  SELECT * INTO v_record FROM public.contract_tasks WHERE id = v_id;
  RETURN jsonb_build_object('success', true, 'task', to_jsonb(v_record));
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_resposta_tarefa_contrato(p_task_id VARCHAR(60), p_sei TEXT DEFAULT NULL, p_data DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_sei TEXT;
  v_record public.contract_tasks%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.contract_key INTO v_key
    FROM public.contract_tasks t
    JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.contract_task_plans p ON p.id = m.plan_id
   WHERE t.id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_task_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_key, NULL);

  v_sei := public.normalizar_numero_sei(p_sei);
  UPDATE public.contract_tasks
     SET resposta_em = COALESCE(p_data, public.hoje_brasilia()),
         resposta_sei = v_sei,
         sei_numero = COALESCE(v_sei, sei_numero),
         atualizado_em = NOW()
   WHERE id = v_id;
  PERFORM public.update_contract_task_atomic(p_task_id => v_id, p_status => 'CONCLUIDA');

  SELECT * INTO v_record FROM public.contract_tasks WHERE id = v_id;
  RETURN jsonb_build_object('success', true, 'task', to_jsonb(v_record));
END;
$$;

CREATE OR REPLACE FUNCTION public.ajustar_prazo_tarefa_contrato(p_task_id VARCHAR(60), p_prazo DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_plan TEXT;
  v_mod TEXT;
  v_record public.contract_tasks%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.contract_key, p.id, m.modulo_id INTO v_key, v_plan, v_mod
    FROM public.contract_tasks t
    JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.contract_task_plans p ON p.id = m.plan_id
   WHERE t.id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_task_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_key, NULL);

  IF p_prazo IS NULL THEN
    -- Voltar à regra
    UPDATE public.contract_tasks SET prazo_ajustado = FALSE, atualizado_em = NOW() WHERE id = v_id;
    IF v_mod IS NOT NULL THEN
      PERFORM public.projetar_prazos_contrato(v_plan, v_mod, FALSE);
    END IF;
  ELSE
    UPDATE public.contract_tasks SET prazo = p_prazo, prazo_ajustado = TRUE, atualizado_em = NOW() WHERE id = v_id;
  END IF;

  SELECT * INTO v_record FROM public.contract_tasks WHERE id = v_id;
  RETURN jsonb_build_object('success', true, 'task', to_jsonb(v_record));
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_modulo_contrato(p_modulo_id VARCHAR(60), p_ancora DATE DEFAULT NULL, p_processo_sei TEXT DEFAULT NULL, p_variante TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_plan TEXT;
  v_proc TEXT;
  v_record public.contract_task_modulos%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.contract_key, p.id INTO v_key, v_plan
    FROM public.contract_task_modulos mo
    JOIN public.contract_task_plans p ON p.id = mo.plan_id
   WHERE mo.modulo_id = btrim(COALESCE(p_modulo_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODULO_NOT_FOUND: Módulo "%" não encontrado.', p_modulo_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_key, NULL);

  v_proc := public.normalizar_numero_sei(p_processo_sei);
  IF v_proc IS NOT NULL AND v_proc !~ '^\d{5}\.\d{6}/\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do processo SEI (NNNNN.NNNNNN/AAAA-DD), não de um documento.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contract_task_modulos
     SET ancora_data = COALESCE(p_ancora, ancora_data),
         processo_sei = COALESCE(v_proc, processo_sei),
         variante = COALESCE(NULLIF(btrim(COALESCE(p_variante, '')), ''), variante)
   WHERE modulo_id = btrim(p_modulo_id)
  RETURNING * INTO v_record;

  PERFORM public.projetar_prazos_contrato(v_plan, v_record.modulo_id, FALSE);
  RETURN jsonb_build_object('success', true, 'modulo', to_jsonb(v_record));
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_pedido_tarefa_ata(p_task_id VARCHAR(60), p_sei TEXT DEFAULT NULL, p_data DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_status TEXT;
  v_record public.ata_tasks%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.ata_key, t.status INTO v_key, v_status
    FROM public.ata_tasks t
    JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.ata_task_plans p ON p.id = m.plan_id
   WHERE t.id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_task_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, v_key);

  UPDATE public.ata_tasks
     SET pedido_enviado_em = COALESCE(p_data, public.hoje_brasilia()),
         pedido_sei = public.normalizar_numero_sei(p_sei),
         atualizado_em = NOW()
   WHERE id = v_id;
  IF v_status = 'PENDENTE' THEN
    PERFORM public.update_ata_task_atomic(p_task_id => v_id, p_status => 'EM_ANDAMENTO');
  END IF;

  SELECT * INTO v_record FROM public.ata_tasks WHERE id = v_id;
  RETURN jsonb_build_object('success', true, 'task', to_jsonb(v_record));
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_resposta_tarefa_ata(p_task_id VARCHAR(60), p_sei TEXT DEFAULT NULL, p_data DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_sei TEXT;
  v_record public.ata_tasks%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.ata_key INTO v_key
    FROM public.ata_tasks t
    JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.ata_task_plans p ON p.id = m.plan_id
   WHERE t.id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_task_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, v_key);

  v_sei := public.normalizar_numero_sei(p_sei);
  UPDATE public.ata_tasks
     SET resposta_em = COALESCE(p_data, public.hoje_brasilia()),
         resposta_sei = v_sei,
         sei_numero = COALESCE(v_sei, sei_numero),
         atualizado_em = NOW()
   WHERE id = v_id;
  PERFORM public.update_ata_task_atomic(p_task_id => v_id, p_status => 'CONCLUIDA');

  SELECT * INTO v_record FROM public.ata_tasks WHERE id = v_id;
  RETURN jsonb_build_object('success', true, 'task', to_jsonb(v_record));
END;
$$;

CREATE OR REPLACE FUNCTION public.ajustar_prazo_tarefa_ata(p_task_id VARCHAR(60), p_prazo DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_plan TEXT;
  v_mod TEXT;
  v_record public.ata_tasks%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.ata_key, p.id, m.modulo_id INTO v_key, v_plan, v_mod
    FROM public.ata_tasks t
    JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.ata_task_plans p ON p.id = m.plan_id
   WHERE t.id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_task_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, v_key);

  IF p_prazo IS NULL THEN
    UPDATE public.ata_tasks SET prazo_ajustado = FALSE, atualizado_em = NOW() WHERE id = v_id;
    IF v_mod IS NOT NULL THEN
      PERFORM public.projetar_prazos_ata(v_plan, v_mod, FALSE);
    END IF;
  ELSE
    UPDATE public.ata_tasks SET prazo = p_prazo, prazo_ajustado = TRUE, atualizado_em = NOW() WHERE id = v_id;
  END IF;

  SELECT * INTO v_record FROM public.ata_tasks WHERE id = v_id;
  RETURN jsonb_build_object('success', true, 'task', to_jsonb(v_record));
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_modulo_ata(p_modulo_id VARCHAR(60), p_ancora DATE DEFAULT NULL, p_processo_sei TEXT DEFAULT NULL, p_variante TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_plan TEXT;
  v_proc TEXT;
  v_record public.ata_task_modulos%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.ata_key, p.id INTO v_key, v_plan
    FROM public.ata_task_modulos mo
    JOIN public.ata_task_plans p ON p.id = mo.plan_id
   WHERE mo.modulo_id = btrim(COALESCE(p_modulo_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODULO_NOT_FOUND: Módulo "%" não encontrado.', p_modulo_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, v_key);

  v_proc := public.normalizar_numero_sei(p_processo_sei);
  IF v_proc IS NOT NULL AND v_proc !~ '^\d{5}\.\d{6}/\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do processo SEI (NNNNN.NNNNNN/AAAA-DD), não de um documento.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ata_task_modulos
     SET ancora_data = COALESCE(p_ancora, ancora_data),
         processo_sei = COALESCE(v_proc, processo_sei),
         variante = COALESCE(NULLIF(btrim(COALESCE(p_variante, '')), ''), variante)
   WHERE modulo_id = btrim(p_modulo_id)
  RETURNING * INTO v_record;

  PERFORM public.projetar_prazos_ata(v_plan, v_record.modulo_id, FALSE);
  RETURN jsonb_build_object('success', true, 'modulo', to_jsonb(v_record));
END;
$$;

-- 10. Permissões ------------------------------------------------------------------
-- Internas: só o dono (as RPCs SECURITY DEFINER chamam).
REVOKE ALL ON FUNCTION public.somar_dias_uteis(DATE, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hoje_brasilia() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vigencia_do_contrato(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vigencia_da_ata(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calcular_prazos_modulo(JSONB, DATE, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tarefas_do_modulo_contrato(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tarefas_do_modulo_ata(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.projetar_prazos_contrato(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.projetar_prazos_ata(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_tarefa_prazo_ajustado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_tarefa_contrato_reprojetar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_tarefa_ata_reprojetar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_macrotask_limpar_modulo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_contrato_vigencia_reprojetar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_ata_vigencia_reprojetar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.projetar_prazos_contrato(TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.projetar_prazos_ata(TEXT, TEXT, BOOLEAN) TO service_role;

-- RPCs do gestor.
REVOKE ALL ON FUNCTION public.marcar_pedido_tarefa_contrato(VARCHAR, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_resposta_tarefa_contrato(VARCHAR, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ajustar_prazo_tarefa_contrato(VARCHAR, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_modulo_contrato(VARCHAR, DATE, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_pedido_tarefa_ata(VARCHAR, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_resposta_tarefa_ata(VARCHAR, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ajustar_prazo_tarefa_ata(VARCHAR, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_modulo_ata(VARCHAR, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_pedido_tarefa_contrato(VARCHAR, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_resposta_tarefa_contrato(VARCHAR, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ajustar_prazo_tarefa_contrato(VARCHAR, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_modulo_contrato(VARCHAR, DATE, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marcar_pedido_tarefa_ata(VARCHAR, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_resposta_tarefa_ata(VARCHAR, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ajustar_prazo_tarefa_ata(VARCHAR, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_modulo_ata(VARCHAR, DATE, TEXT, TEXT) TO authenticated, service_role;

-- 11. Modelos genéricos antigos ficam inativos (0 tarefas em produção) ----------
UPDATE public.contract_task_templates
   SET ativo = FALSE, updated_at = NOW()
 WHERE id IN ('tpl-prorrogacao-padrao-14133', 'tpl-acrescimo-padrao-14133', 'tpl-supressao-padrao-14133',
              'tpl-reajuste-padrao-14133', 'tpl-alteracao-geral-14133', 'tpl-encerramento-padrao-14133',
              'tpl-rescisao-padrao-14133')
   AND ativo;

-- 12. Módulos da CCGA (gerados do protótipo v3) ------------------------------------
INSERT INTO public.ata_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ata-formalizacao', 'Formalização da ata', 'Da homologação à publicação: conferir os artefatos, minutar, colher as assinaturas e publicar.', TRUE, 'MANUAL', NULL, 'Ao receber da CPL o pregão homologado', 'Estudo da CGLIC (Anexo I, seção CCGA) · Orientação 001/2025', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e1', 'ccga-ata-formalizacao', 'Preparação', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e1-t1', 'ccga-ata-formalizacao-e1', 'Registrar o processo do pregão no módulo', 0, 'INTERNA', 'FAZER', NULL, NULL, 'Na prática é o processo da compra', NULL, '2 d.u. após receber da CPL', 'APLICACAO', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e1-t2', 'ccga-ata-formalizacao-e1', 'Conferir os artefatos do registro de preços', 1, 'INTERNA', 'CONFERIR', 'CPL', ARRAY['Edital e anexos', 'Documentos de habilitação', 'Termo de homologação', 'Proposta comercial', 'Estatuto ou contrato social e procuração']::text[], NULL, NULL, '3 d.u. após a anterior', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e1-t3', 'ccga-ata-formalizacao-e1', 'Minutar a ARP conforme a fase preparatória', 2, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, 120, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e2', 'ccga-ata-formalizacao', 'Assinatura', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e2-t1', 'ccga-ata-formalizacao-e2', 'Disponibilizar a minuta para a Assessoria da DGFNSP', 0, 'INTERNA', 'ASSINAR', 'Assessoria DGFNSP', NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e2-t2', 'ccga-ata-formalizacao-e2', 'Pedir ao fornecedor o cadastro da assinatura eletrônica do preposto', 1, 'EXTERNA', 'ORIENTAR', 'Fornecedor', ARRAY['Cadastro de usuário externo no SEI', 'Representação legal e procuração em dia']::text[], NULL, NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, 'resposta em 5 d.u.', 5, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e2-t3', 'ccga-ata-formalizacao-e2', 'Elaborar a versão definitiva da ARP', 2, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '2 d.u. após a revisão', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, 120, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e2-t4', 'ccga-ata-formalizacao-e2', 'Disponibilizar a ARP para assinatura da Diretora e do fornecedor', 3, 'INTERNA', 'ASSINAR', 'DGFNSP · Fornecedor', NULL, NULL, NULL, '1 d.u. após a anterior', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e3', 'ccga-ata-formalizacao', 'Publicação', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e3-t1', 'ccga-ata-formalizacao-e3', 'Publicar a ARP no PNCP', 0, 'INTERNA', 'LANCAR', 'PNCP · Gestão de Atas', NULL, 'Publicar logo após a assinatura (Orientação 001/2025)', NULL, '1 d.u. após a assinatura', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-formalizacao-e3-t2', 'ccga-ata-formalizacao-e3', 'Ata lida pelo sistema', 1, 'AUTOMATICA', 'ACOMPANHAR', 'PNCP', NULL, 'Ao chegar, a ata ganha o módulo “Ata publicada”', NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ata-publicada', 'Ata publicada', 'Conferir a vigência, juntar o extrato, avisar os partícipes e registrar as quantidades.', TRUE, 'ATA_PUBLICADA', NULL, 'Ao ler a ata no PNCP', 'Orientação 001/2025 (32923305) · Plano 01', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-publicada-e1', 'ccga-ata-publicada', 'Publicação', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-publicada-e1-t1', 'ccga-ata-publicada-e1', 'Conferir a vigência contada da divulgação no PNCP', 0, 'INTERNA', 'CONFERIR', 'PNCP', ARRAY['1 ano a partir do 1º dia útil seguinte à divulgação', 'Se o cadastro usou a data da assinatura, retificar']::text[], NULL, NULL, '5 d.u. após a leitura', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-publicada-e1-t2', 'ccga-ata-publicada-e1', 'Retificar a publicação no Gestão de Atas ou registrar a falha (chamado no MGI)', 1, 'INTERNA', 'LANCAR', 'Gestão de Atas · PNCP', NULL, 'Só se a vigência estiver errada', 'Informação 51 (32931719)', '5 d.u. após a anterior', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-publicada-e1-t3', 'ccga-ata-publicada-e1', 'Juntar o extrato do PNCP ao processo', 2, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '5 d.u. após a leitura', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-publicada-e2', 'ccga-ata-publicada', 'Partícipes e quantidades', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-publicada-e2-t1', 'ccga-ata-publicada-e2', 'Avisar os partícipes que a ata está assinada e publicada', 0, 'EXTERNA', 'ORIENTAR', 'Partícipes', ARRAY['Número da ata, vigência e fornecedor', 'Como pedir liberação de saldo, se precisarem']::text[], NULL, NULL, '5 d.u. após a leitura', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-publicada-e2-t2', 'ccga-ata-publicada-e2', 'Pedir às unidades da SENASP as quantidades de cada uma', 1, 'EXTERNA', 'ORIENTAR', 'Unidades requisitantes', ARRAY['Itens e quantidades por unidade', 'Prazo de resposta']::text[], NULL, 'Despacho de rotina nº 2 do Plano 01', '10 d.u. após a leitura', 'APLICACAO', 10, TRUE, 'resposta em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-publicada-e2-t3', 'ccga-ata-publicada-e2', 'Registrar a quantidade da ata assinada por órgão', 2, 'INTERNA', 'FAZER', NULL, NULL, 'Aba Itens › Órgãos e quantitativos', NULL, '5 d.u. após a anterior', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ata-empenho', 'Empenho e contrato', 'O ciclo que se repete a cada pedido: conferir, autorizar, empenhar e contratar.', TRUE, 'MANUAL', NULL, 'Por pedido de empenho · automático para pedido de emenda autorizado', 'Plano 02 (30347651) · processos 003516/2025 e 007537/2024', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-empenho-e1', 'ccga-ata-empenho', 'Autorização', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e1-t1', 'ccga-ata-empenho-e1', 'Conferir o pedido da requisitante', 0, 'INTERNA', 'CONFERIR', 'Requisitante', ARRAY['Quantidades para contratar', 'Referência do objeto (item da ata, descrição)', 'Dados orçamentários detalhados (ação, PO, fonte, PTRES, PI, UGR, natureza)', 'Fornecedor da ata e valores unitário e total']::text[], NULL, NULL, '3 d.u. após o pedido', 'APLICACAO', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e1-t2', 'ccga-ata-empenho-e1', 'Minutar a autorização de DDO e nota de empenho', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, '30347872 · 30563569 · 30562670 (emenda)', '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, 30, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e1-t3', 'ccga-ata-empenho-e1', 'Disponibilizar a autorização para a assessoria e para assinatura da Diretora do FNSP', 2, 'INTERNA', 'ASSINAR', 'DGFNSP', NULL, NULL, NULL, '5 d.u. após a anterior', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-empenho-e2', 'ccga-ata-empenho', 'Empenho', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e2-t1', 'ccga-ata-empenho-e2', 'Encaminhar à CGOFI para a DDO e a nota de empenho', 0, 'EXTERNA', 'ORIENTAR', 'CGOFI', ARRAY['Autorização assinada', 'Dados orçamentários e fornecedor']::text[], NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, 'nota em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e2-t2', 'ccga-ata-empenho-e2', 'Nota de empenho emitida', 1, 'AUTOMATICA', 'ACOMPANHAR', 'Contratos.gov.br / SIAFI', NULL, NULL, NULL, 'resposta do pedido acima', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-empenho-e3', 'ccga-ata-empenho', 'Contrato', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e3-t1', 'ccga-ata-empenho-e3', 'Conferir a nota de empenho e a proposta antes do contrato', 0, 'INTERNA', 'CONFERIR', 'CGOFI · Fornecedor', ARRAY['Nota confere com itens, quantidades e valores', 'Validade da proposta (menos de 60 dias: confirmar com o fornecedor)', 'Interesse do fornecedor em continuar', 'Certidões de regularidade fiscal e trabalhista']::text[], NULL, NULL, '3 d.u. após a nota', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e3-t2', 'ccga-ata-empenho-e3', 'Pedir a carta de crédito', 1, 'EXTERNA', 'ORIENTAR', 'CGOFI · Fornecedor', NULL, 'Só nas compras internacionais', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e3-t3', 'ccga-ata-empenho-e3', 'Minutar o contrato', 2, 'INTERNA', 'FAZER', NULL, NULL, 'Quando o pedido pede contrato (“solicita contratação”)', NULL, '3 d.u. após a anterior', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, 90, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e3-t4', 'ccga-ata-empenho-e3', 'Disponibilizar o contrato para assinatura da Diretora e do fornecedor', 3, 'INTERNA', 'ASSINAR', 'DGFNSP · Fornecedor', NULL, NULL, NULL, '10 d.u. após a anterior', 'ANTERIOR', 10, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-empenho-e3-t5', 'ccga-ata-empenho-e3', 'Lançar o contrato no Contratos.gov.br e publicar no PNCP', 4, 'INTERNA', 'LANCAR', 'Contratos.gov.br · PNCP', NULL, 'Lido da fonte, o contrato ganha o módulo “Contrato assinado”', NULL, '2 d.u. após a assinatura', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ata-adesao', 'Adesão e remanejamento', 'Processo SEI próprio por ata, conferência no Gestão de Atas e autorização da CGLIC.', TRUE, 'MANUAL', NULL, 'Quando chega pedido de órgão', 'Plano 04 (30476031)', 'Adesão e Remanejamento (próprio)', ARRAY['Adesão (carona)', 'Remanejamento entre partícipes', 'Partícipe para não partícipe', 'Termo de liberação de saldo', 'Prorrogação do prazo de adesão (+90 dias, 32749758)']::text[], 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-adesao-e1', 'ccga-ata-adesao', 'Abertura', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-adesao-e1-t1', 'ccga-ata-adesao-e1', 'Abrir o processo “Adesão e Remanejamento ARP nº…” e relacionar ao principal', 0, 'INTERNA', 'FAZER', NULL, NULL, NULL, 'Termo de Autuação (30484700)', '2 d.u. após o pedido', 'APLICACAO', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-adesao-e2', 'ccga-ata-adesao', 'Análise', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-adesao-e2-t1', 'ccga-ata-adesao-e2', 'Conferir o pedido no Gestão de Atas', 0, 'INTERNA', 'CONFERIR', 'Órgão solicitante', ARRAY['Órgão não consta como partícipe', 'Itens do pedido batem com os da ata', 'Justificativa da vantagem da adesão', 'Compatibilidade dos preços com o mercado', 'Aceite do fornecedor']::text[], NULL, NULL, '3 d.u. após a anterior', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, 40, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-adesao-e2-t2', 'ccga-ata-adesao-e2', 'Limites de 50% por órgão e 200% no total', 1, 'AUTOMATICA', 'ACOMPANHAR', 'Sistema', NULL, 'Aba Itens › Adesões calcula', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-adesao-e3', 'ccga-ata-adesao', 'Decisão', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-adesao-e3-t1', 'ccga-ata-adesao-e3', 'Minutar a autorização', 0, 'INTERNA', 'FAZER', NULL, NULL, NULL, 'Adesão 30476449 · remanejamentos 30591958, 32438415, 30591567 · liberação de saldo 30455516', '1 d.u. após a anterior', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-adesao-e3-t2', 'ccga-ata-adesao-e3', 'Disponibilizar a autorização para assinatura do Coordenador-Geral', 1, 'INTERNA', 'ASSINAR', 'CGLIC', NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-adesao-e3-t3', 'ccga-ata-adesao-e3', 'Aceitar ou recusar no Gestão de Atas e juntar o print ao processo', 2, 'INTERNA', 'LANCAR', 'Gestão de Atas (Compras.gov.br)', NULL, NULL, NULL, '1 d.u. após a assinatura', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-adesao-e3-t4', 'ccga-ata-adesao-e3', 'Avisar o órgão solicitante da decisão', 3, 'EXTERNA', 'ORIENTAR', 'Órgão solicitante', ARRAY['Autorização assinada', 'Prazo de 90 dias para contratar (adesão)']::text[], NULL, NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ata-prorrog', 'Prorrogação e reajuste', 'Consultar o fornecedor, pedir e conferir a vantajosidade, instruir, levar à assinatura e registrar o reajuste.', TRUE, 'DIAS_ANTES_FIM', 180, '180 dias antes do fim (se a ata ainda pode ser prorrogada)', 'NT 67 (33239311) · Orientação 002/2025 · Despacho 106 · Parecer Referencial 5/2025', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-prorrog-e1', 'ccga-ata-prorrog', 'Consulta ao fornecedor', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e1-t1', 'ccga-ata-prorrog-e1', 'Consultar o fornecedor sobre a renovação', 0, 'EXTERNA', 'ORIENTAR', 'Fornecedor', ARRAY['Anuência expressa à prorrogação por 12 meses', 'Se mantém os preços ou aplica o reajuste pelo índice da ata', 'Representante legal e procuração em dia']::text[], NULL, 'Ofício da CGLIC', 'D−120', 'VIGENCIA_FIM', -120, FALSE, 'resposta em 15 d.u.', 15, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-prorrog-e2', 'ccga-ata-prorrog', 'Vantajosidade', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e2-t1', 'ccga-ata-prorrog-e2', 'Conferir o índice IPCA por item', 0, 'INTERNA', 'CONFERIR', 'Sistema', ARRAY['Data-base: Termo de Conformidade da pesquisa', 'Período de 12 meses e percentual do IBGE']::text[], 'Aba Reajuste', NULL, 'D−100', 'VIGENCIA_FIM', -100, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e2-t2', 'ccga-ata-prorrog-e2', 'Pedir ao ComprasSusp a pesquisa de vantajosidade', 1, 'EXTERNA', 'ORIENTAR', 'ComprasSusp', ARRAY['Itens, valor registrado e valor reajustado', 'Prazo: retorno 45 dias antes do fim']::text[], NULL, 'Despacho 106 (34328539)', 'D−90', 'VIGENCIA_FIM', -90, FALSE, 'resposta até D−45', 45, FALSE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e2-t3', 'ccga-ata-prorrog-e2', 'Conferir a pesquisa de mercado e o Termo de Conformidade', 2, 'INTERNA', 'CONFERIR', 'ComprasSusp', ARRAY['Cesta de preços pela IN 65/2021', 'Termo de Conformidade (Portaria SE/MJSP 1606/2024)', 'Conclusão: preço registrado vantajoso']::text[], NULL, NULL, '3 d.u. após a resposta', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-prorrog-e3', 'ccga-ata-prorrog', 'Instrução', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e3-t1', 'ccga-ata-prorrog-e3', 'Emitir e juntar as certidões do fornecedor', 0, 'INTERNA', 'FAZER', NULL, NULL, 'SICAF, CADIN, Consulta Consolidada TCU, CNDT', NULL, 'D−40', 'VIGENCIA_FIM', -40, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e3-t2', 'ccga-ata-prorrog-e3', 'Redigir a Nota Técnica de vigência', 1, 'INTERNA', 'FAZER', NULL, NULL, 'Tarefa do pregão: concluída numa ata, conclui nas outras do mesmo pregão', 'NT 67 (33239311)', 'D−35', 'VIGENCIA_FIM', -35, FALSE, NULL, NULL, NULL, NULL, TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e3-t3', 'ccga-ata-prorrog-e3', 'Preparar o atestado de adequação ao Parecer Referencial 5/2025', 2, 'INTERNA', 'FAZER', NULL, NULL, 'Tarefa do pregão', '34104843', 'D−35', 'VIGENCIA_FIM', -35, FALSE, NULL, NULL, NULL, NULL, TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e3-t4', 'ccga-ata-prorrog-e3', 'Disponibilizar a nota e o atestado para a CGLIC e a Diretora do FNSP', 3, 'INTERNA', 'ASSINAR', 'CGLIC · DGFNSP', NULL, NULL, NULL, 'D−30', 'VIGENCIA_FIM', -30, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-prorrog-e4', 'ccga-ata-prorrog', 'Formalização', 3, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e4-t1', 'ccga-ata-prorrog-e4', 'Minutar o termo aditivo', 0, 'INTERNA', 'FAZER', NULL, NULL, 'Vigência começa no dia seguinte ao fim da ata', NULL, 'D−15', 'VIGENCIA_FIM', -15, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e4-t2', 'ccga-ata-prorrog-e4', 'Disponibilizar o termo aditivo para assinatura da Diretora e do fornecedor', 1, 'INTERNA', 'ASSINAR', 'DGFNSP · Fornecedor', NULL, NULL, NULL, 'D−10', 'VIGENCIA_FIM', -10, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e4-t3', 'ccga-ata-prorrog-e4', 'Publicar o termo aditivo no PNCP e no Gestão de Atas', 2, 'INTERNA', 'LANCAR', 'PNCP · Gestão de Atas', NULL, NULL, NULL, '1 d.u. após a assinatura (até D−1)', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e4-t4', 'ccga-ata-prorrog-e4', 'Registrar o termo de apostilamento do reajuste no sistema', 3, 'INTERNA', 'FAZER', NULL, NULL, 'Aba Reajuste › Informar termo', NULL, '5 d.u. após a publicação', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-prorrog-e4-t5', 'ccga-ata-prorrog-e4', 'Publicar a apostila do reajuste no PNCP', 4, 'INTERNA', 'LANCAR', 'PNCP', NULL, NULL, NULL, '2 d.u. após a assinatura', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ata-reequilibrio-ata', 'Reequilíbrio da ata', 'Analisar o pedido, decidir se procede e, se proceder, formalizar por termo aditivo.', TRUE, 'MANUAL', NULL, 'Quando o fornecedor pede reequilíbrio dos preços', 'Estudo da CGLIC (Anexo I) · caso Renault, ARP 20/2025', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e1', 'ccga-ata-reequilibrio-ata', 'Análise inicial', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e1-t1', 'ccga-ata-reequilibrio-ata-e1', 'Conferir o pedido de reequilíbrio e a documentação do fornecedor', 0, 'INTERNA', 'CONFERIR', 'Fornecedor', ARRAY['Fato novo e imprevisível ou extraordinário', 'Comprovação do aumento de custo', 'Itens e valores pedidos']::text[], 'Procedente ou improcedente: improcedente pede Nota Técnica de indeferimento e o módulo fecha', NULL, '5 d.u. após o pedido', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, 90, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e1-t2', 'ccga-ata-reequilibrio-ata-e1', 'Pedir à área técnica a análise da planilha de custos', 1, 'EXTERNA', 'ORIENTAR', 'Área técnica', NULL, 'Só quando há planilha de custos e formação de preços', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, 'resposta em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e2', 'ccga-ata-reequilibrio-ata', 'Instrução', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e2-t1', 'ccga-ata-reequilibrio-ata-e2', 'Redigir a Nota Técnica e as planilhas de reequilíbrio', 0, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '5 d.u. após a análise', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, 90, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e2-t2', 'ccga-ata-reequilibrio-ata-e2', 'Minutar o termo aditivo de reequilíbrio', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e2-t3', 'ccga-ata-reequilibrio-ata-e2', 'Enviar o processo à CONJUR e atender o despacho saneador', 2, 'EXTERNA', 'ORIENTAR', 'CONJUR', ARRAY['Parecer jurídico', 'Recomendações atendidas no despacho saneador']::text[], NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, 'parecer da CONJUR', NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e3', 'ccga-ata-reequilibrio-ata', 'Formalização', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e3-t1', 'ccga-ata-reequilibrio-ata-e3', 'Disponibilizar o termo aditivo para assinatura da Diretora e do fornecedor', 0, 'INTERNA', 'ASSINAR', 'DGFNSP · Fornecedor', NULL, NULL, NULL, '5 d.u. após o parecer', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e3-t2', 'ccga-ata-reequilibrio-ata-e3', 'Publicar o termo aditivo no PNCP e no Gestão de Atas', 1, 'INTERNA', 'LANCAR', 'PNCP · Gestão de Atas', NULL, NULL, NULL, '1 d.u. após a assinatura', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-reequilibrio-ata-e3-t3', 'ccga-ata-reequilibrio-ata-e3', 'Responder ao fornecedor', 2, 'EXTERNA', 'ORIENTAR', 'Fornecedor', NULL, 'Deferimento ou indeferimento', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ata-cancel', 'Cancelamento da ata', 'Despacho motivador, assinaturas, termo e aviso aos partícipes.', TRUE, 'MANUAL', NULL, 'Quando a ata precisa ser cancelada', 'Plano 04, itens 6 e 7', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-cancel-e1', 'ccga-ata-cancel', 'Decisão', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-cancel-e1-t1', 'ccga-ata-cancel-e1', 'Redigir o despacho motivador', 0, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '5 d.u. após aplicar', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-cancel-e1-t2', 'ccga-ata-cancel-e1', 'Disponibilizar o despacho para assinatura da CCGA, da CGLIC e da Diretora', 1, 'INTERNA', 'ASSINAR', 'CCGA · CGLIC · DGFNSP', NULL, NULL, NULL, '5 d.u. após a anterior', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-cancel-e1-t3', 'ccga-ata-cancel-e1', 'Disponibilizar o termo de cancelamento para assinatura da Diretora', 2, 'INTERNA', 'ASSINAR', 'DGFNSP', NULL, NULL, NULL, '5 d.u. após a anterior', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ata-cancel-e2', 'ccga-ata-cancel', 'Eficácia', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-cancel-e2-t1', 'ccga-ata-cancel-e2', 'Lançar o cancelamento no Gestão de Atas e publicar no PNCP', 0, 'INTERNA', 'LANCAR', 'Gestão de Atas · PNCP', NULL, NULL, NULL, '2 d.u. após a assinatura', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.ata_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ata-cancel-e2-t2', 'ccga-ata-cancel-e2', 'Avisar os partícipes do cancelamento', 1, 'EXTERNA', 'ORIENTAR', 'Partícipes', NULL, NULL, NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-assinado', 'Contrato assinado', 'Cobrar e conferir a garantia, apropriar no SIAFI, pedir e designar os fiscais.', TRUE, 'CONTRATO_LIDO', NULL, 'Ao ler o contrato no Contratos.gov.br', 'Despachos 107 e 130 · Minuta de Portaria (30521462)', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-assinado-e1', 'ccga-ct-assinado', 'Publicação', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e1-t1', 'ccga-ct-assinado-e1', 'Lançar o contrato e publicar no PNCP', 0, 'INTERNA', 'LANCAR', 'Contratos.gov.br · PNCP', NULL, NULL, NULL, 'D+10 da assinatura', 'INICIO', 10, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e1-t2', 'ccga-ct-assinado-e1', 'Publicar o extrato no DOU e juntar ao processo', 1, 'INTERNA', 'LANCAR', 'DOU', NULL, 'Quando houver', NULL, 'D+10 da assinatura', 'INICIO', 10, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-assinado-e2', 'ccga-ct-assinado', 'Garantia', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e2-t1', 'ccga-ct-assinado-e2', 'Cobrar a garantia do fornecedor', 0, 'EXTERNA', 'ORIENTAR', 'Fornecedor', ARRAY['Modalidade e valor pedidos no TR', 'Prazo do contrato para entregar']::text[], 'Só quando o TR exige', NULL, 'D+5 da assinatura', 'INICIO', 5, FALSE, 'resposta em 15 d.u.', 15, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e2-t2', 'ccga-ct-assinado-e2', 'Conferir a apólice ou carta fiança', 1, 'INTERNA', 'CONFERIR', 'Fornecedor', ARRAY['Valor e vigência pedidos no TR', 'Segurado: SENASP', 'Consulta da apólice na SUSEP']::text[], NULL, NULL, '3 d.u. após a resposta', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e2-t3', 'ccga-ct-assinado-e2', 'Lançar a garantia no Contratos.gov.br', 2, 'INTERNA', 'LANCAR', 'Contratos.gov.br', NULL, NULL, NULL, '2 d.u. após a conferência', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e2-t4', 'ccga-ct-assinado-e2', 'Encaminhar à CGOFI a apropriação do contrato e da garantia', 3, 'EXTERNA', 'ORIENTAR', 'CGOFI', ARRAY['Contratos, apostilas e garantias']::text[], NULL, 'Despacho 107 (34329651)', '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, 'nota de sistema em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-assinado-e3', 'ccga-ct-assinado', 'Fiscais', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e3-t1', 'ccga-ct-assinado-e3', 'Pedir à requisitante a indicação de gestor e fiscais', 0, 'EXTERNA', 'ORIENTAR', 'Requisitante', ARRAY['Gestor e substituto', 'Fiscais técnicos ou comissão', 'Fiscal administrativo da CGLIC (obrigatório)', 'Nome, CPF, ramal e e-mail']::text[], NULL, 'Despacho 130 (30522196)', 'D+5 da assinatura', 'INICIO', 5, FALSE, 'resposta em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e3-t2', 'ccga-ct-assinado-e3', 'Minutar a portaria de designação', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, 'Minuta 30521462', '3 d.u. após a resposta', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e3-t3', 'ccga-ct-assinado-e3', 'Disponibilizar a portaria para assinatura da Diretora do FNSP', 2, 'INTERNA', 'ASSINAR', 'DGFNSP', NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e3-t4', 'ccga-ct-assinado-e3', 'Lançar gestor e fiscais no Contratos.gov.br', 3, 'INTERNA', 'LANCAR', 'Contratos.gov.br', NULL, NULL, NULL, '2 d.u. após a assinatura', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e3-t5', 'ccga-ct-assinado-e3', 'Notificar gestor e fiscais da portaria', 4, 'EXTERNA', 'ORIENTAR', 'Gestor e fiscais do contrato', NULL, NULL, NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-assinado-e3-t6', 'ccga-ct-assinado-e3', 'Registrar o processo de fiscalização no contrato', 5, 'INTERNA', 'FAZER', NULL, NULL, 'Campo novo no topo do Contrato 360', NULL, '5 d.u. após a assinatura', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-empenho-ct', 'Empenho do contrato', 'Conferir o pedido, minutar, levar à assinatura e encaminhar à CGOFI.', TRUE, 'MANUAL', NULL, 'Reforço ou nova nota em contrato assinado', 'Modelo 30564685', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-empenho-ct-e1', 'ccga-ct-empenho-ct', 'Autorização', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-empenho-ct-e1-t1', 'ccga-ct-empenho-ct-e1', 'Conferir o pedido da requisitante', 0, 'INTERNA', 'CONFERIR', 'Requisitante', ARRAY['Novo empenho ou reforço do empenho atual', 'Quantidades e valores por item', 'Dados orçamentários']::text[], NULL, NULL, '3 d.u. após o pedido', 'APLICACAO', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-empenho-ct-e1-t2', 'ccga-ct-empenho-ct-e1', 'Minutar a autorização de DDO/NE para contrato formalizado', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, '30564685', '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, 30, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-empenho-ct-e1-t3', 'ccga-ct-empenho-ct-e1', 'Disponibilizar a autorização para assinatura da Diretora do FNSP', 2, 'INTERNA', 'ASSINAR', 'DGFNSP', NULL, NULL, NULL, '5 d.u. após a anterior', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-empenho-ct-e2', 'ccga-ct-empenho-ct', 'Empenho', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-empenho-ct-e2-t1', 'ccga-ct-empenho-ct-e2', 'Encaminhar à CGOFI', 0, 'EXTERNA', 'ORIENTAR', 'CGOFI', NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, 'nota em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-empenho-ct-e2-t2', 'ccga-ct-empenho-ct-e2', 'Nota de empenho emitida', 1, 'AUTOMATICA', 'ACOMPANHAR', 'Contratos.gov.br / SIAFI', NULL, NULL, NULL, 'resposta do pedido acima', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-pagamento', 'Pagamento', 'O que o gestor faz em cada ciclo; o detalhe continua na aba Pagamentos.', TRUE, 'FATURA', NULL, 'Cada fatura abre um ciclo (já existe, Portaria 50)', 'Plano 03 (30302195) · Portaria 50/2025', 'Pagamento (um por ciclo)', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-pagamento-e1', 'ccga-ct-pagamento', 'Por ciclo', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-pagamento-e1-t1', 'ccga-ct-pagamento-e1', 'Conferir os documentos do fiscal', 0, 'INTERNA', 'CONFERIR', 'Fiscal', ARRAY['Nota fiscal (não nota de remessa), CNPJ, datas e valores', 'Termo de Recebimento Provisório e Definitivo', 'Atesto com nota e valor', 'Relatório de acompanhamento com saldo do contrato e do empenho', 'Certidões: SICAF, CADIN, TCU, CNDT, Simples', 'Invoice proforma em moeda estrangeira, nas importações']::text[], 'Checklist do Anexo I', NULL, '5 d.u. após receber', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, 90, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-pagamento-e1-t2', 'ccga-ct-pagamento-e1', 'Devolver ao fiscal o que estiver pendente', 1, 'EXTERNA', 'ORIENTAR', 'Fiscal', NULL, 'Só se houver pendência', NULL, 'no mesmo dia', 'ANTERIOR', 0, TRUE, 'resposta em 5 d.u.', 5, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-pagamento-e1-t3', 'ccga-ct-pagamento-e1', 'Fazer o despacho de conformidade', 2, 'INTERNA', 'FAZER', NULL, NULL, NULL, 'Despacho 28 (30307552)', '2 d.u. após conferir', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-pagamento-e1-t4', 'ccga-ct-pagamento-e1', 'Inserir a nota fiscal nos instrumentos de cobrança do contrato', 3, 'INTERNA', 'LANCAR', 'Contratos.gov.br', NULL, 'O comprovante vai citado no despacho', NULL, '2 d.u. após conferir', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-pagamento-e1-t5', 'ccga-ct-pagamento-e1', 'Incluir o empenho no Contratos.gov.br, se não constar', 4, 'INTERNA', 'LANCAR', 'Contratos.gov.br', NULL, 'Corrige na fonte o que a fila Vínculos › Empenhos ao contrato aponta', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-pagamento-e1-t6', 'ccga-ct-pagamento-e1', 'Encaminhar à CGOFI para liquidar e pagar', 5, 'EXTERNA', 'ORIENTAR', 'CGOFI', NULL, NULL, NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, 'prazo da Portaria 50', NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-pagamento-e1-t7', 'ccga-ct-pagamento-e1', 'Liquidado e pago', 6, 'AUTOMATICA', 'ACOMPANHAR', 'SIAFI · Tesouro', NULL, NULL, NULL, 'vencimento da fatura', 'FIXO', NULL, NULL, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-aditivo', 'Prorrogação do contrato', 'Pedir a justificativa e a anuência, conferir a vantajosidade, instruir e levar à assinatura.', TRUE, 'DIAS_ANTES_FIM', 180, '180 dias antes do fim da vigência', 'Plano 05 (30642280) · NT 13 e 126 · check list 31269012', 'Processo do pregão', ARRAY['Serviço contínuo (NT 13 · Parecer Referencial 4/2024)', 'A termo ou por escopo (NT 126 · Parecer Referencial 7/2025)', 'Com CONJUR, quando não cabe parecer referencial']::text[], 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-aditivo-e1', 'ccga-ct-aditivo', 'Início', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e1-t1', 'ccga-ct-aditivo-e1', 'Pedir à requisitante a manifestação sobre a prorrogação', 0, 'EXTERNA', 'ORIENTAR', 'Requisitante', ARRAY['Justificativa e motivação da prorrogação', 'Comprovação da vantajosidade do valor', 'Mapa de gerenciamento de riscos', 'Objeto prestado regularmente', 'Prazos e quantidades adicionais', 'Objeto permanece inalterado']::text[], NULL, 'Despacho 177 (30600299)', 'D−180', 'VIGENCIA_FIM', -180, FALSE, 'resposta até D−150', 30, FALSE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e1-t2', 'ccga-ct-aditivo-e1', 'Pedir a anuência da contratada', 1, 'EXTERNA', 'ORIENTAR', 'Fornecedor', ARRAY['Interesse em prorrogar', 'Manutenção ou reajuste dos preços']::text[], NULL, 'Ofício da CGLIC', 'D−150', 'VIGENCIA_FIM', -150, FALSE, 'resposta até D−120', 30, FALSE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-aditivo-e2', 'ccga-ct-aditivo', 'Requisitos', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e2-t1', 'ccga-ct-aditivo-e2', 'Pedir ao ComprasSusp a pesquisa de preços', 0, 'EXTERNA', 'ORIENTAR', 'ComprasSusp', NULL, NULL, NULL, 'D−120', 'VIGENCIA_FIM', -120, FALSE, 'resposta até D−90', 30, FALSE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e2-t2', 'ccga-ct-aditivo-e2', 'Conferir a pesquisa e a vantajosidade', 1, 'INTERNA', 'CONFERIR', 'ComprasSusp', ARRAY['Cesta de preços e metodologia', 'Conclusão de vantajosidade']::text[], NULL, NULL, '3 d.u. após a resposta', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e2-t3', 'ccga-ct-aditivo-e2', 'Emitir e juntar as certidões da contratada', 2, 'INTERNA', 'FAZER', NULL, NULL, 'SICAF, CADIN, TCU, CNDT', NULL, 'D−60', 'VIGENCIA_FIM', -60, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e2-t4', 'ccga-ct-aditivo-e2', 'Cobrar a renovação da garantia', 3, 'EXTERNA', 'ORIENTAR', 'Fornecedor', NULL, 'Quando houver garantia', NULL, 'D−45', 'VIGENCIA_FIM', -45, FALSE, 'resposta até D−20', 25, FALSE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-aditivo-e3', 'ccga-ct-aditivo', 'Análise', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e3-t1', 'ccga-ct-aditivo-e3', 'Redigir a Nota Técnica e o check list', 0, 'INTERNA', 'FAZER', NULL, NULL, 'Variante escolhida ao aplicar', 'NT 126 (34076821) · check list 31269012', 'D−60', 'VIGENCIA_FIM', -60, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e3-t2', 'ccga-ct-aditivo-e3', 'Disponibilizar para autorização: Diretora do FNSP até R$ 10 milhões, Secretário Nacional acima', 1, 'INTERNA', 'ASSINAR', 'DGFNSP ou SENASP', NULL, 'O sistema indica pelo valor global', NULL, 'D−45', 'VIGENCIA_FIM', -45, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e3-t3', 'ccga-ct-aditivo-e3', 'Preparar o atestado do parecer referencial, ou o ofício à CONJUR', 2, 'INTERNA', 'FAZER', NULL, NULL, NULL, 'Atestado 34104843', 'D−40', 'VIGENCIA_FIM', -40, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e3-t4', 'ccga-ct-aditivo-e3', 'Enviar o processo à CONJUR e atender o despacho saneador', 3, 'EXTERNA', 'ORIENTAR', 'CONJUR', ARRAY['Parecer jurídico', 'Recomendações atendidas no despacho saneador']::text[], 'Só quando não cabe parecer referencial', NULL, 'D−30', 'VIGENCIA_FIM', -30, FALSE, 'parecer da CONJUR', NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-aditivo-e4', 'ccga-ct-aditivo', 'Formalização', 3, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e4-t1', 'ccga-ct-aditivo-e4', 'Minutar o termo aditivo', 0, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, 'D−15', 'VIGENCIA_FIM', -15, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e4-t2', 'ccga-ct-aditivo-e4', 'Disponibilizar o termo aditivo para assinatura da Diretora e do fornecedor', 1, 'INTERNA', 'ASSINAR', 'DGFNSP · Fornecedor', NULL, NULL, NULL, 'D−10', 'VIGENCIA_FIM', -10, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e4-t3', 'ccga-ct-aditivo-e4', 'Lançar o termo aditivo no Contratos.gov.br e publicar no PNCP', 2, 'INTERNA', 'LANCAR', 'Contratos.gov.br · PNCP', NULL, NULL, NULL, '1 d.u. após a assinatura (até D−1)', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-aditivo-e4-t4', 'ccga-ct-aditivo-e4', 'Pedir à CGOFI a DDO do exercício seguinte', 3, 'EXTERNA', 'ORIENTAR', 'CGOFI', NULL, 'Quando passar do ano', NULL, 'D+30', 'VIGENCIA_FIM', 30, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-alteracao', 'Alteração contratual', 'Instrução inicial com decisão de procedência, planilha, nota técnica, autorização, CONJUR e termo aditivo.', TRUE, 'MANUAL', NULL, 'Quando a área demandante pede acréscimo, supressão ou alteração qualitativa', 'Plano 05 (30642280) · estudo da CGLIC (Anexo I)', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-alteracao-e1', 'ccga-ct-alteracao', 'Análise inicial', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e1-t1', 'ccga-ct-alteracao-e1', 'Conferir o pedido de alteração da área demandante', 0, 'INTERNA', 'CONFERIR', 'Área demandante', ARRAY['Justificativa e fato novo', 'Documentação nos autos', 'Limite de 25% do art. 125 para acréscimo ou supressão', 'Objeto não muda']::text[], 'Procedente ou improcedente: improcedente pede Nota Técnica de indeferimento e o módulo fecha', NULL, '5 d.u. após o pedido', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, 90, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-alteracao-e2', 'ccga-ct-alteracao', 'Instrução', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e2-t1', 'ccga-ct-alteracao-e2', 'Elaborar a planilha de alteração e a Nota Técnica', 0, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '5 d.u. após a análise', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, 60, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e2-t2', 'ccga-ct-alteracao-e2', 'Minutar o termo aditivo e o check list', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, 'Check list 31269012', '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e2-t3', 'ccga-ct-alteracao-e2', 'Pedir à CGOFI a DDO do valor adicional', 2, 'EXTERNA', 'ORIENTAR', 'CGOFI', NULL, 'Só no acréscimo', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, 'resposta em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e2-t4', 'ccga-ct-alteracao-e2', 'Disponibilizar para autorização: Diretora do FNSP até R$ 10 milhões, Secretário Nacional acima', 3, 'INTERNA', 'ASSINAR', 'DGFNSP ou SENASP', NULL, 'O sistema indica pelo valor global', NULL, '3 d.u. após a anterior', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e2-t5', 'ccga-ct-alteracao-e2', 'Enviar o processo à CONJUR e atender o despacho saneador', 4, 'EXTERNA', 'ORIENTAR', 'CONJUR', ARRAY['Parecer jurídico', 'Recomendações atendidas no despacho saneador']::text[], NULL, NULL, '2 d.u. após a autorização', 'ANTERIOR', 2, TRUE, 'parecer da CONJUR', NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-alteracao-e3', 'ccga-ct-alteracao', 'Formalização', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e3-t1', 'ccga-ct-alteracao-e3', 'Emitir e juntar as certidões da contratada', 0, 'INTERNA', 'FAZER', NULL, NULL, 'SICAF, CADIN, TCU, CNDT', NULL, '2 d.u. após o parecer', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e3-t2', 'ccga-ct-alteracao-e3', 'Disponibilizar o termo aditivo para assinatura da Diretora e do fornecedor', 1, 'INTERNA', 'ASSINAR', 'DGFNSP · Fornecedor', NULL, NULL, NULL, '3 d.u. após a anterior', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-alteracao-e3-t3', 'ccga-ct-alteracao-e3', 'Lançar o termo aditivo no Contratos.gov.br e publicar no PNCP', 2, 'INTERNA', 'LANCAR', 'Contratos.gov.br · PNCP', NULL, NULL, NULL, '1 d.u. após a assinatura', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-reajuste-ct', 'Reajuste por apostila', 'Conferir o índice, redigir a nota, levar à CGLIC e lavrar a apostila.', TRUE, 'DATA_BASE', NULL, 'Na data-base do contrato (radar que já existe)', 'NT 16 (30942580)', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-reajuste-ct-e1', 'ccga-ct-reajuste-ct', 'Cálculo', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reajuste-ct-e1-t1', 'ccga-ct-reajuste-ct-e1', 'Conferir o índice e o período de apuração', 0, 'INTERNA', 'CONFERIR', 'Sistema', ARRAY['Data-base: Termo de Conformidade', '12 meses e percentual do índice do contrato']::text[], NULL, NULL, 'D+15 da data-base', 'APLICACAO', 15, FALSE, NULL, NULL, NULL, 40, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reajuste-ct-e1-t2', 'ccga-ct-reajuste-ct-e1', 'Redigir a Nota Técnica de reajuste', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, 'NT 16 (30942580)', 'D+30 da data-base', 'APLICACAO', 30, FALSE, NULL, NULL, NULL, 60, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-reajuste-ct-e2', 'ccga-ct-reajuste-ct', 'Formalização', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reajuste-ct-e2-t1', 'ccga-ct-reajuste-ct-e2', 'Disponibilizar a nota para o Coordenador-Geral', 0, 'INTERNA', 'ASSINAR', 'CGLIC', NULL, NULL, NULL, '3 d.u. após a anterior', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reajuste-ct-e2-t2', 'ccga-ct-reajuste-ct-e2', 'Lavrar a apostila', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '5 d.u. após a anterior', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reajuste-ct-e2-t3', 'ccga-ct-reajuste-ct-e2', 'Pedir reforço de empenho à requisitante, se faltar', 2, 'EXTERNA', 'ORIENTAR', 'Requisitante', NULL, NULL, NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reajuste-ct-e2-t4', 'ccga-ct-reajuste-ct-e2', 'Lançar a apostila no Contratos.gov.br e publicar no PNCP', 3, 'INTERNA', 'LANCAR', 'Contratos.gov.br · PNCP', NULL, NULL, NULL, '2 d.u. após a assinatura', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-reequilibrio-ct', 'Reequilíbrio do contrato', 'Analisar o pedido, decidir se procede e, se proceder, formalizar por termo aditivo.', TRUE, 'MANUAL', NULL, 'Quando a contratada pede reequilíbrio econômico-financeiro', 'Estudo da CGLIC (Anexo I)', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e1', 'ccga-ct-reequilibrio-ct', 'Análise inicial', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e1-t1', 'ccga-ct-reequilibrio-ct-e1', 'Conferir o pedido de reequilíbrio e a documentação do fornecedor', 0, 'INTERNA', 'CONFERIR', 'Fornecedor', ARRAY['Fato novo e imprevisível ou extraordinário', 'Comprovação do aumento de custo', 'Itens e valores pedidos']::text[], 'Procedente ou improcedente: improcedente pede Nota Técnica de indeferimento e o módulo fecha', NULL, '5 d.u. após o pedido', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, 90, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e1-t2', 'ccga-ct-reequilibrio-ct-e1', 'Pedir à área técnica a análise da planilha de custos', 1, 'EXTERNA', 'ORIENTAR', 'Área técnica', NULL, 'Só quando há planilha de custos e formação de preços', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, 'resposta em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e2', 'ccga-ct-reequilibrio-ct', 'Instrução', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e2-t1', 'ccga-ct-reequilibrio-ct-e2', 'Redigir a Nota Técnica e as planilhas de reequilíbrio', 0, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '5 d.u. após a análise', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, 90, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e2-t2', 'ccga-ct-reequilibrio-ct-e2', 'Minutar o termo aditivo de reequilíbrio', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e2-t3', 'ccga-ct-reequilibrio-ct-e2', 'Pedir à CGOFI a DDO do valor adicional', 2, 'EXTERNA', 'ORIENTAR', 'CGOFI', NULL, NULL, NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, 'resposta em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e2-t4', 'ccga-ct-reequilibrio-ct-e2', 'Enviar o processo à CONJUR e atender o despacho saneador', 3, 'EXTERNA', 'ORIENTAR', 'CONJUR', ARRAY['Parecer jurídico', 'Recomendações atendidas no despacho saneador']::text[], NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, 'parecer da CONJUR', NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e3', 'ccga-ct-reequilibrio-ct', 'Formalização', 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e3-t1', 'ccga-ct-reequilibrio-ct-e3', 'Emitir e juntar as certidões da contratada', 0, 'INTERNA', 'FAZER', NULL, NULL, 'SICAF, CADIN, TCU, CNDT', NULL, '2 d.u. após o parecer', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e3-t2', 'ccga-ct-reequilibrio-ct-e3', 'Disponibilizar o termo aditivo para assinatura da Diretora e do fornecedor', 1, 'INTERNA', 'ASSINAR', 'DGFNSP · Fornecedor', NULL, NULL, NULL, '3 d.u. após a anterior', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e3-t3', 'ccga-ct-reequilibrio-ct-e3', 'Lançar o termo aditivo no Contratos.gov.br e publicar no PNCP', 2, 'INTERNA', 'LANCAR', 'Contratos.gov.br · PNCP', NULL, NULL, NULL, '1 d.u. após a assinatura', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-reequilibrio-ct-e3-t4', 'ccga-ct-reequilibrio-ct-e3', 'Responder à contratada', 3, 'EXTERNA', 'ORIENTAR', 'Fornecedor', NULL, 'Deferimento ou indeferimento', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-prazo-entrega', 'Prazo de entrega', 'Registrar o atraso, notificar, analisar o pedido de prorrogação e responder à empresa.', TRUE, 'ENTREGA_ATRASADA', NULL, 'Quando a entrega prevista atrasa ou chega pedido de prorrogação da entrega', 'Estudo da CGLIC (Anexo I) · contrato 87/2024 (carta de prorrogação)', 'Fiscalização', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e1', 'ccga-ct-prazo-entrega', 'Atraso', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e1-t1', 'ccga-ct-prazo-entrega-e1', 'Conferir o atraso com o fiscal', 0, 'INTERNA', 'CONFERIR', 'Fiscal', ARRAY['Itens e quantidades não entregues', 'Beneficiários afetados']::text[], NULL, NULL, '2 d.u. após a data prevista', 'APLICACAO', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e1-t2', 'ccga-ct-prazo-entrega-e1', 'Notificar a empresa do atraso', 1, 'EXTERNA', 'ORIENTAR', 'Fornecedor', ARRAY['Itens atrasados e prazo contratual', 'Prazo para regularizar ou justificar']::text[], NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, 'resposta em 5 d.u.', 5, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e2', 'ccga-ct-prazo-entrega', 'Pedido de prorrogação', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e2-t1', 'ccga-ct-prazo-entrega-e2', 'Analisar o pedido de prorrogação da entrega', 0, 'INTERNA', 'CONFERIR', 'Fornecedor', ARRAY['Motivo e comprovação', 'Novo prazo pedido', 'Impacto para os beneficiários']::text[], 'Procedente ou improcedente', NULL, '5 d.u. após o pedido', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, 120, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e2-t2', 'ccga-ct-prazo-entrega-e2', 'Redigir a informação à chefia com a análise', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e2-t3', 'ccga-ct-prazo-entrega-e2', 'Disponibilizar a informação para decisão da CGLIC', 2, 'INTERNA', 'ASSINAR', 'CGLIC', NULL, NULL, NULL, '1 d.u. após a anterior', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e2-t4', 'ccga-ct-prazo-entrega-e2', 'Notificar a empresa do deferimento ou indeferimento', 3, 'EXTERNA', 'ORIENTAR', 'Fornecedor', NULL, NULL, NULL, '1 d.u. após a decisão', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-prazo-entrega-e2-t5', 'ccga-ct-prazo-entrega-e2', 'Atualizar o cronograma de entregas no sistema', 4, 'INTERNA', 'FAZER', NULL, NULL, 'Entregas previstas do contrato', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-encerra', 'Encerramento', 'Pedir ao fiscal o fechamento, conferir, anular saldo e liberar a garantia.', TRUE, 'FIM_VIGENCIA', NULL, 'No fim da vigência ou quando tudo foi entregue e pago', 'Informação 21 (34540423)', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-encerra-e1', 'ccga-ct-encerra', 'Execução', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-encerra-e1-t1', 'ccga-ct-encerra-e1', 'Pedir ao fiscal o recebimento definitivo final e a informação de extinção', 0, 'EXTERNA', 'ORIENTAR', 'Fiscal', ARRAY['Termo de Recebimento Definitivo final', 'Informação de extinção pelo cumprimento do objeto']::text[], NULL, 'Informação 21 (34540423)', 'D+5 do fim', 'VIGENCIA_FIM', 5, FALSE, 'resposta em 10 d.u.', 10, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-encerra-e1-t2', 'ccga-ct-encerra-e1', 'Conferir o encerramento', 1, 'INTERNA', 'CONFERIR', 'Fiscal', ARRAY['Todo o objeto entregue e pago', 'Nenhum descumprimento pendente']::text[], NULL, NULL, '3 d.u. após a resposta', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-encerra-e1-t3', 'ccga-ct-encerra-e1', 'Inserir o termo de encerramento da gestão do contrato', 2, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-encerra-e2', 'ccga-ct-encerra', 'Saldos', 1, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-encerra-e2-t1', 'ccga-ct-encerra-e2', 'Pedir à CGOFI a anulação do saldo de empenho', 0, 'EXTERNA', 'ORIENTAR', 'CGOFI', NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-encerra-e2-t2', 'ccga-ct-encerra-e2', 'Pedir ao banco ou à seguradora a liberação da garantia', 1, 'EXTERNA', 'ORIENTAR', 'Banco · seguradora', NULL, 'Caução ou depósito: ofício com os dados do contrato', NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, 'resposta em 10 d.u.', 10, TRUE, 30, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-encerra-e2-t3', 'ccga-ct-encerra-e2', 'Lançar o encerramento no Contratos.gov.br', 2, 'INTERNA', 'LANCAR', 'Contratos.gov.br', NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-fisc', 'Fiscalização da entrega', 'O gestor acompanha com o fiscal os marcos do processo de fiscalização.', TRUE, 'MANUAL', NULL, 'Opcional: entrega com protótipo ou várias unidades', 'Processo 08020.000263/2026-30', 'Fiscalização', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-fisc-e1', 'ccga-ct-fisc', 'Marcos com o fiscal', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-fisc-e1-t1', 'ccga-ct-fisc-e1', 'Confirmar com o fiscal a ordem de fornecimento', 0, 'EXTERNA', 'ORIENTAR', 'Fiscal', NULL, NULL, NULL, 'D+10 da assinatura', 'INICIO', 10, FALSE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-fisc-e1-t2', 'ccga-ct-fisc-e1', 'Confirmar a aprovação do protótipo', 1, 'EXTERNA', 'ORIENTAR', 'Fiscal', NULL, NULL, NULL, 'data do TR (informada ao aplicar)', 'FIXO', NULL, NULL, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-fisc-e1-t3', 'ccga-ct-fisc-e1', 'Pedir o cronograma de entregas e os locais', 2, 'EXTERNA', 'ORIENTAR', 'Fiscal · Fornecedor', NULL, NULL, NULL, '5 d.u. após a anterior', 'ANTERIOR', 5, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-fisc-e1-t4', 'ccga-ct-fisc-e1', 'Acompanhar os recebimentos provisórios por beneficiário', 3, 'INTERNA', 'CONFERIR', 'Fiscal', NULL, NULL, NULL, 'datas do cronograma', 'FIXO', NULL, NULL, NULL, NULL, NULL, 80, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-act', 'Atestado de Capacidade Técnica', 'Pedir o ateste à área demandante, elaborar, colher as assinaturas e enviar.', TRUE, 'MANUAL', NULL, 'Quando a contratada pede atestado', 'Estudo da CGLIC (Anexo I)', 'Processo do pregão', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-act-e1', 'ccga-ct-act', 'Atestado', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-act-e1-t1', 'ccga-ct-act-e1', 'Pedir à área demandante o ateste do fornecimento', 0, 'EXTERNA', 'ORIENTAR', 'Área demandante', ARRAY['Itens, quantidades e período', 'Execução satisfatória']::text[], NULL, NULL, '2 d.u. após o pedido', 'APLICACAO', 2, TRUE, 'resposta em 5 d.u.', 5, TRUE, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-act-e1-t2', 'ccga-ct-act-e1', 'Elaborar o atestado de capacidade técnica', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '2 d.u. após a resposta', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, 30, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-act-e1-t3', 'ccga-ct-act-e1', 'Disponibilizar para assinatura da área demandante e da CCGA', 2, 'INTERNA', 'ASSINAR', 'Área demandante · CCGA', NULL, NULL, NULL, '1 d.u. após a anterior', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-act-e1-t4', 'ccga-ct-act-e1', 'Enviar o atestado à contratada', 3, 'EXTERNA', 'ORIENTAR', 'Fornecedor', NULL, NULL, NULL, '1 d.u. após a assinatura', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, gatilho, gatilho_dias, quando, base, processo_tipo, variantes, origem_modelo, created_at, updated_at)
VALUES ('ccga-ct-compartilhada', 'Contrato de compra compartilhada', 'Processo próprio, nota técnica de continuidade e assinaturas do coordenador e do ordenador.', TRUE, 'MANUAL', NULL, 'Quando a SENASP contrata por compra compartilhada de outro órgão', 'Estudo da CGLIC (Anexo I)', 'Processo próprio', NULL, 'CCGA', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ativo = TRUE, gatilho = EXCLUDED.gatilho, gatilho_dias = EXCLUDED.gatilho_dias, quando = EXCLUDED.quando, base = EXCLUDED.base, processo_tipo = EXCLUDED.processo_tipo, variantes = EXCLUDED.variantes, origem_modelo = 'CCGA', updated_at = NOW();
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at) VALUES ('ccga-ct-compartilhada-e1', 'ccga-ct-compartilhada', 'Instrução', 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-compartilhada-e1-t1', 'ccga-ct-compartilhada-e1', 'Abrir o processo SEI e juntar os principais documentos da licitação', 0, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '2 d.u. após aplicar', 'APLICACAO', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-compartilhada-e1-t2', 'ccga-ct-compartilhada-e1', 'Redigir a Nota Técnica de continuidade da contratação', 1, 'INTERNA', 'FAZER', NULL, NULL, NULL, NULL, '3 d.u. após a anterior', 'ANTERIOR', 3, TRUE, NULL, NULL, NULL, 120, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-compartilhada-e1-t3', 'ccga-ct-compartilhada-e1', 'Disponibilizar para assinatura do Coordenador e do Ordenador de Despesas', 2, 'INTERNA', 'ASSINAR', 'CGLIC · DGFNSP', NULL, NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, created_at, updated_at) VALUES ('ccga-ct-compartilhada-e1-t4', 'ccga-ct-compartilhada-e1', 'Comunicar a unidade de formalização de contratos', 3, 'EXTERNA', 'ORIENTAR', 'Unidade de formalização', NULL, NULL, NULL, '1 d.u. após a assinatura', 'ANTERIOR', 1, TRUE, NULL, NULL, NULL, NULL, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei, prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis, resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis, esforco_min = EXCLUDED.esforco_min, do_pregao = EXCLUDED.do_pregao, updated_at = NOW();
