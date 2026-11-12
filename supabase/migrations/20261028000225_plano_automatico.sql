-- ==============================================================================
-- Plano automático do modelo de gestão da CCGA (entrega 3)
--
-- Protótipo aprovado pelo usuário em 28/10/2026 (decisões D1–D12, conferidas no SEI):
--   1. Módulos entram sozinhos no plano quando o fato acontece (todo dia de manhã):
--      Ata publicada, Contrato assinado e Encerramento só para fatos depois da
--      implantação; Prorrogação da ata (180 dias antes, se ainda pode prorrogar),
--      Prorrogação do contrato (serviços e TIC 180 dias antes; compras 60 dias antes,
--      se as faturas somam menos de 80% do valor) também para o que já está na janela.
--   2. A fonte fecha a tarefa que ela comprova (PNCP, Contratos.gov.br, Tesouro),
--      com o dado achado; o gestor pode reabrir e aí a fonte não fecha mais.
--   3. Dispensar módulo com justificativa; o sistema não põe o mesmo módulo de novo.
--   4. Tarefa do pregão: concluir numa ata conclui nas outras atas do mesmo pregão.
--   5. Garantia só quando o contrato exige: a etapa começa com a pergunta.
--   6. Encerramento vira módulo curto (Informação de extinção por cumprimento do objeto).
-- O "Cobrar resposta" do Início é calculado nas telas (pedido enviado + resposta vencida).
-- ==============================================================================

-- 1. Colunas novas -----------------------------------------------------------------
DO $$
DECLARE v_tab TEXT;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY['contract_task_modulos', 'ata_task_modulos'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS origem VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
        ADD COLUMN IF NOT EXISTS motivo_auto TEXT,
        ADD COLUMN IF NOT EXISTS ciclo VARCHAR(20),
        ADD COLUMN IF NOT EXISTS dispensado_em TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS dispensado_por_user_id UUID,
        ADD COLUMN IF NOT EXISTS dispensado_por_nome VARCHAR(150),
        ADD COLUMN IF NOT EXISTS dispensa_justificativa TEXT
    $f$, v_tab);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_tab, v_tab || '_origem_check');
    EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (origem IN ('MANUAL', 'AUTO'))$f$, v_tab, v_tab || '_origem_check');
  END LOOP;

  FOREACH v_tab IN ARRAY ARRAY['contract_task_template_tasks', 'ata_task_template_tasks', 'contract_tasks', 'ata_tasks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pergunta_etapa BOOLEAN NOT NULL DEFAULT FALSE', v_tab);
  END LOOP;

  FOREACH v_tab IN ARRAY ARRAY['contract_tasks', 'ata_tasks'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS fechada_pela_fonte TEXT,
        ADD COLUMN IF NOT EXISTS fonte_bloqueada BOOLEAN NOT NULL DEFAULT FALSE
    $f$, v_tab);
  END LOOP;
END $$;

COMMENT ON COLUMN public.contract_task_modulos.origem IS 'MANUAL (o gestor aplicou) ou AUTO (entrou sozinho pelo fato; motivo_auto diz qual).';
COMMENT ON COLUMN public.contract_task_modulos.ciclo IS 'Prorrogação e encerramento: fim da vigência que motivou o módulo (outra vigência = outro ciclo).';
COMMENT ON COLUMN public.contract_task_modulos.dispensa_justificativa IS 'Módulo dispensado pelo gestor ou coordenador: as tarefas abertas ficam "não se aplica".';
COMMENT ON COLUMN public.contract_tasks.pergunta_etapa IS 'Pergunta que decide a etapa (ex.: o contrato exige garantia?). "Não" deixa as outras tarefas da etapa como não se aplica.';
COMMENT ON COLUMN public.contract_tasks.fechada_pela_fonte IS 'O que a fonte mostrou ao fechar a tarefa sozinha (ex.: número de controle do PNCP).';
COMMENT ON COLUMN public.contract_tasks.fonte_bloqueada IS 'TRUE quando o gestor reabriu a tarefa fechada pela fonte: a fonte não fecha mais.';

-- 2. Implantação e registro do que entrou sozinho ---------------------------------
CREATE TABLE IF NOT EXISTS public.plano_automatico_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  implantado_em DATE NOT NULL
);
INSERT INTO public.plano_automatico_config (id, implantado_em)
VALUES (TRUE, public.hoje_brasilia())
ON CONFLICT (id) DO NOTHING;

-- Uma linha por módulo que o sistema pôs (ou tentou pôr): não põe de novo no mesmo ciclo,
-- mesmo que o gestor apague o módulo.
CREATE TABLE IF NOT EXISTS public.plano_automatico_registros (
  tipo VARCHAR(8) NOT NULL CHECK (tipo IN ('CONTRATO', 'ATA')),
  chave TEXT NOT NULL,
  template_id VARCHAR(60) NOT NULL,
  ciclo VARCHAR(20) NOT NULL DEFAULT '',
  modulo_id VARCHAR(60),
  motivo TEXT,
  aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tipo, chave, template_id, ciclo)
);

CREATE TABLE IF NOT EXISTS public.plano_automatico_execucoes (
  id BIGSERIAL PRIMARY KEY,
  rodou_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modulos_aplicados INTEGER NOT NULL DEFAULT 0,
  tarefas_fechadas INTEGER NOT NULL DEFAULT 0,
  erros JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.plano_automatico_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_automatico_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_automatico_execucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura autenticada: plano_automatico_config" ON public.plano_automatico_config;
CREATE POLICY "Leitura autenticada: plano_automatico_config" ON public.plano_automatico_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada: plano_automatico_registros" ON public.plano_automatico_registros;
CREATE POLICY "Leitura autenticada: plano_automatico_registros" ON public.plano_automatico_registros FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura autenticada: plano_automatico_execucoes" ON public.plano_automatico_execucoes;
CREATE POLICY "Leitura autenticada: plano_automatico_execucoes" ON public.plano_automatico_execucoes FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.plano_automatico_config, public.plano_automatico_registros, public.plano_automatico_execucoes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.plano_automatico_config, public.plano_automatico_registros, public.plano_automatico_execucoes FROM authenticated;
GRANT SELECT ON public.plano_automatico_config, public.plano_automatico_registros, public.plano_automatico_execucoes TO authenticated;
GRANT ALL ON public.plano_automatico_config, public.plano_automatico_registros, public.plano_automatico_execucoes TO service_role;

-- 3. Aplicar um módulo (gestor ou sistema) ------------------------------------------
-- O mesmo miolo das RPCs apply_*: o gestor chama pela RPC (com a conferência de papel e
-- de alcance); o plano automático chama direto, com origem AUTO, motivo e ciclo.
CREATE OR REPLACE FUNCTION public.aplicar_modulo_contrato(
  p_uasg TEXT,
  p_numero TEXT,
  p_ano INTEGER,
  p_template_id TEXT,
  p_modulo_nome TEXT DEFAULT NULL,
  p_origem TEXT DEFAULT 'MANUAL',
  p_motivo TEXT DEFAULT NULL,
  p_ciclo TEXT DEFAULT NULL,
  p_variante TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100);
  v_uasg VARCHAR(10) := btrim(COALESCE(p_uasg, ''));
  v_numero VARCHAR(50) := btrim(COALESCE(p_numero, ''));
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
  IF v_uasg = '' OR v_numero = '' OR p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UASG, número e ano do contrato são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_template FROM public.contract_task_templates WHERE id = btrim(COALESCE(p_template_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', p_template_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_template.ativo THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" está desativado e não pode ser aplicado.', v_template.nome USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contract_task_template_macrotasks WHERE template_id = v_template.id) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" não possui nenhuma macrotarefa e não pode ser aplicado.', v_template.nome USING ERRCODE = '22023';
  END IF;

  v_contract_key := public.normalize_contract_key(v_uasg, v_numero, p_ano);
  v_modulo_nome := COALESCE(NULLIF(btrim(COALESCE(p_modulo_nome, '')), ''), v_template.nome);

  SELECT id INTO v_plan_id FROM public.contract_task_plans WHERE contract_key = v_contract_key;
  v_plan_exists := FOUND;
  IF v_plan_exists THEN
    SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_ordem_base FROM public.contract_task_macrotasks WHERE plan_id = v_plan_id;
  ELSE
    v_plan_id := 'plan-' || gen_random_uuid()::text;
    INSERT INTO public.contract_task_plans (id, contract_key, uasg, numero, ano, template_id, template_nome, applied_at)
    VALUES (v_plan_id, v_contract_key, v_uasg, v_numero, p_ano, v_template.id, v_template.nome, NOW());
  END IF;

  INSERT INTO public.contract_task_modulos (modulo_id, plan_id, template_id, nome, processo_tipo, variante, ancora_data, aplicado_em, aplicado_por_user_id, origem, motivo_auto, ciclo)
  VALUES (v_modulo_id, v_plan_id, v_template.id, v_modulo_nome, v_template.processo_tipo, NULLIF(btrim(COALESCE(p_variante, '')), ''),
          public.hoje_brasilia(), NOW(), auth.uid(), COALESCE(p_origem, 'MANUAL'), p_motivo, NULLIF(p_ciclo, ''));

  FOR v_macrotask IN
    SELECT * FROM public.contract_task_template_macrotasks WHERE template_id = v_template.id ORDER BY ordem ASC, created_at ASC
  LOOP
    v_new_macrotask_id := 'ctmt-' || gen_random_uuid()::text;
    INSERT INTO public.contract_task_macrotasks (id, plan_id, nome, ordem, modulo_id, modulo_template_id, modulo_nome, modulo_applied_at)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_ordem_base + v_macrotask.ordem, v_modulo_id, v_template.id, v_modulo_nome, NOW());
    v_macrotasks_count := v_macrotasks_count + 1;

    FOR v_task IN
      SELECT * FROM public.contract_task_template_tasks WHERE macrotask_id = v_macrotask.id ORDER BY ordem ASC, created_at ASC
    LOOP
      INSERT INTO public.contract_tasks (
        id, macrotask_id, nome, ordem, status, execution_mode, criado_em, atualizado_em,
        template_task_id, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis,
        resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, pergunta_etapa
      )
      VALUES (
        'ctt-' || gen_random_uuid()::text, v_new_macrotask_id, v_task.nome, v_task.ordem, 'PENDENTE', v_task.execution_mode, NOW(), NOW(),
        v_task.id, v_task.acao, v_task.com_quem, v_task.lista, v_task.nota, v_task.modelo_sei, v_task.prazo_texto, v_task.prazo_ancora, v_task.prazo_dias, v_task.prazo_uteis,
        v_task.resposta_texto, v_task.resposta_dias, v_task.resposta_uteis, v_task.esforco_min, v_task.do_pregao, v_task.pergunta_etapa
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
$$;

CREATE OR REPLACE FUNCTION public.aplicar_modulo_ata(
  p_ata_key TEXT,
  p_template_id TEXT,
  p_modulo_nome TEXT DEFAULT NULL,
  p_origem TEXT DEFAULT 'MANUAL',
  p_motivo TEXT DEFAULT NULL,
  p_ciclo TEXT DEFAULT NULL,
  p_variante TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata_key VARCHAR(50) := btrim(COALESCE(p_ata_key, ''));
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
  IF v_ata_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número da Ata é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_template FROM public.ata_task_templates WHERE id = btrim(COALESCE(p_template_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Template com ID "%" não encontrado.', p_template_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_template.ativo THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" está desativado e não pode ser aplicado.', v_template.nome USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ata_task_template_macrotasks WHERE template_id = v_template.id) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O template "%" não possui nenhuma macrotarefa e não pode ser aplicado.', v_template.nome USING ERRCODE = '22023';
  END IF;

  v_modulo_nome := COALESCE(NULLIF(btrim(COALESCE(p_modulo_nome, '')), ''), v_template.nome);

  SELECT id INTO v_plan_id FROM public.ata_task_plans WHERE ata_key = v_ata_key;
  v_plan_exists := FOUND;
  IF v_plan_exists THEN
    SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_ordem_base FROM public.ata_task_macrotasks WHERE plan_id = v_plan_id;
  ELSE
    v_plan_id := 'ataplan-' || gen_random_uuid()::text;
    INSERT INTO public.ata_task_plans (id, ata_key, template_id, template_nome, applied_at)
    VALUES (v_plan_id, v_ata_key, v_template.id, v_template.nome, NOW());
  END IF;

  INSERT INTO public.ata_task_modulos (modulo_id, plan_id, template_id, nome, processo_tipo, variante, ancora_data, aplicado_em, aplicado_por_user_id, origem, motivo_auto, ciclo)
  VALUES (v_modulo_id, v_plan_id, v_template.id, v_modulo_nome, v_template.processo_tipo, NULLIF(btrim(COALESCE(p_variante, '')), ''),
          public.hoje_brasilia(), NOW(), auth.uid(), COALESCE(p_origem, 'MANUAL'), p_motivo, NULLIF(p_ciclo, ''));

  FOR v_macrotask IN
    SELECT * FROM public.ata_task_template_macrotasks WHERE template_id = v_template.id ORDER BY ordem ASC, created_at ASC
  LOOP
    v_new_macrotask_id := 'atmt-' || gen_random_uuid()::text;
    INSERT INTO public.ata_task_macrotasks (id, plan_id, nome, ordem, modulo_id, modulo_template_id, modulo_nome, modulo_applied_at)
    VALUES (v_new_macrotask_id, v_plan_id, v_macrotask.nome, v_ordem_base + v_macrotask.ordem, v_modulo_id, v_template.id, v_modulo_nome, NOW());
    v_macrotasks_count := v_macrotasks_count + 1;

    FOR v_task IN
      SELECT * FROM public.ata_task_template_tasks WHERE macrotask_id = v_macrotask.id ORDER BY ordem ASC, created_at ASC
    LOOP
      INSERT INTO public.ata_tasks (
        id, macrotask_id, nome, ordem, status, execution_mode, criado_em, atualizado_em,
        template_task_id, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis,
        resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, pergunta_etapa
      )
      VALUES (
        'at-' || gen_random_uuid()::text, v_new_macrotask_id, v_task.nome, v_task.ordem, 'PENDENTE', v_task.execution_mode, NOW(), NOW(),
        v_task.id, v_task.acao, v_task.com_quem, v_task.lista, v_task.nota, v_task.modelo_sei, v_task.prazo_texto, v_task.prazo_ancora, v_task.prazo_dias, v_task.prazo_uteis,
        v_task.resposta_texto, v_task.resposta_dias, v_task.resposta_uteis, v_task.esforco_min, v_task.do_pregao, v_task.pergunta_etapa
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
$$;

-- As RPCs do gestor passam a usar o miolo (mesma assinatura e mesma conferência da 210).
CREATE OR REPLACE FUNCTION public.apply_contract_task_template_atomic(p_uasg character varying, p_numero character varying, p_ano integer, p_template_id character varying, p_modulo_nome character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.exigir_alcance_do_gestor((CASE WHEN btrim(COALESCE(p_uasg, '')) <> '' AND btrim(COALESCE(p_numero, '')) <> '' AND p_ano BETWEEN 2000 AND 2100 THEN public.normalize_contract_key(btrim(p_uasg), btrim(p_numero), p_ano) END)::text, NULL);  -- alcance do gestor (migration 126)
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;
  RETURN public.aplicar_modulo_contrato(p_uasg, p_numero, p_ano, p_template_id, p_modulo_nome);
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_ata_task_template_atomic(p_ata_key character varying, p_template_id character varying, p_modulo_nome character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.exigir_alcance_do_gestor(NULL, (p_ata_key)::text);  -- alcance do gestor (migration 126)
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;
  RETURN public.aplicar_modulo_ata(p_ata_key, p_template_id, p_modulo_nome);
END;
$function$;

-- 4. O que a fonte comprova -------------------------------------------------------
-- Devolve o texto do que a fonte mostrou, ou NULL. Fatos únicos do contrato (PNCP, DOU,
-- garantia, fiscal, inativo) valem sempre; fatos que se repetem (nota, termo, contrato da
-- ata) só valem com data a partir da entrada do módulo, para dado antigo não fechar tarefa nova.
CREATE OR REPLACE FUNCTION public.evidencia_da_fonte_contrato(p_template_task_id TEXT, p_contract_key TEXT, p_desde DATE)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_registro JSONB;
  v_pncp TEXT;
  v_hist JSONB;
  v_gar JSONB;
  v_resp JSONB;
  v_txt TEXT;
  v_num TEXT;
  v_data DATE;
  v_tipo TEXT;
  v_so_vigencia BOOLEAN := FALSE;
BEGIN
  SELECT c.registro, c.numero_controle_pncp INTO v_registro, v_pncp
    FROM public.contratos_oficiais c WHERE c.contract_key = p_contract_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT d.historico, d.garantias, d.responsaveis INTO v_hist, v_gar, v_resp
    FROM public.contratos_detalhes_copia d WHERE d.contract_key = p_contract_key;

  CASE p_template_task_id
    WHEN 'ccga-ct-assinado-e1-t1' THEN
      IF NULLIF(btrim(COALESCE(v_pncp, '')), '') IS NOT NULL THEN
        RETURN 'Publicado no PNCP (controle ' || btrim(v_pncp) || ')';
      END IF;
    WHEN 'ccga-ct-assinado-e1-t2' THEN
      v_txt := v_registro->'raw'->>'data_publicacao';
      IF v_txt ~ '^\d{4}-\d{2}-\d{2}' THEN
        RETURN 'Extrato publicado em ' || to_char(left(v_txt, 10)::date, 'DD/MM/YYYY') || ' (Contratos.gov.br)';
      END IF;
    WHEN 'ccga-ct-assinado-e2-t3' THEN
      IF jsonb_typeof(v_gar) = 'array' AND jsonb_array_length(v_gar) > 0 THEN
        RETURN 'Garantia lançada no Contratos.gov.br';
      END IF;
    WHEN 'ccga-ct-assinado-e3-t4' THEN
      IF jsonb_typeof(v_resp) = 'array' AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_resp) r
            WHERE COALESCE(r->>'funcao_id', r->>'funcao', '') ILIKE 'Fiscal%') THEN
        RETURN 'Fiscal lançado no Contratos.gov.br';
      END IF;
    WHEN 'ccga-ct-encerra-e2-t3' THEN
      IF v_registro->'raw'->>'situacao' = 'Inativo' THEN
        RETURN 'Contrato inativo no Contratos.gov.br';
      END IF;
    WHEN 'ccga-ct-empenho-ct-e2-t2' THEN
      SELECT e.numero_oficial, e.data_emissao INTO v_num, v_data
        FROM public.contrato_empenhos ce
        JOIN public.empenhos e ON e.id = ce.empenho_id
       WHERE ce.contract_key = p_contract_key AND e.data_emissao >= p_desde
       ORDER BY e.data_emissao, e.numero_oficial
       LIMIT 1;
      IF v_num IS NOT NULL THEN
        RETURN 'Nota de empenho ' || v_num || ' de ' || to_char(v_data, 'DD/MM/YYYY');
      END IF;
    WHEN 'ccga-ct-aditivo-e4-t3', 'ccga-ct-alteracao-e3-t3', 'ccga-ct-reequilibrio-ct-e3-t3', 'ccga-ct-reajuste-ct-e2-t4' THEN
      v_tipo := CASE WHEN p_template_task_id = 'ccga-ct-reajuste-ct-e2-t4' THEN 'Termo de Apostilamento' ELSE 'Termo Aditivo' END;
      v_so_vigencia := p_template_task_id = 'ccga-ct-aditivo-e4-t3';
      SELECT h->>'numero', left(h->>'data_assinatura', 10)::date INTO v_num, v_data
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_hist) = 'array' THEN v_hist ELSE '[]'::jsonb END) h
       WHERE h->>'tipo' = v_tipo
         AND h->>'data_assinatura' ~ '^\d{4}-\d{2}-\d{2}'
         AND left(h->>'data_assinatura', 10)::date >= p_desde
         AND (NOT v_so_vigencia OR COALESCE(h->'qualificacao_termo', '[]'::jsonb)::text ILIKE '%VIG%')
       ORDER BY 2, 1
       LIMIT 1;
      IF v_data IS NOT NULL THEN
        RETURN CASE WHEN v_tipo = 'Termo Aditivo' THEN 'Termo aditivo' ELSE 'Apostila' END
               || COALESCE(' nº ' || NULLIF(btrim(v_num), ''), '') || ' assinado em ' || to_char(v_data, 'DD/MM/YYYY') || ' (Contratos.gov.br)';
      END IF;
    ELSE
      NULL;
  END CASE;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.evidencia_da_fonte_ata(p_template_task_id TEXT, p_ata_key TEXT, p_desde DATE)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata RECORD;
  v_txt TEXT;
  v_data DATE;
BEGIN
  SELECT a.id, a.numero_ata, a.codigo_uasg INTO v_ata
    FROM public.atas_registro_preco a
   WHERE public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg) = btrim(COALESCE(p_ata_key, ''))
   ORDER BY (a.codigo_uasg = '200331') DESC, a.data_vigencia_final DESC NULLS LAST
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  CASE p_template_task_id
    WHEN 'ccga-ata-prorrog-e4-t3' THEN
      SELECT t.documento_titulo, t.documento_publicado_em INTO v_txt, v_data
        FROM public.ata_termos_prorrogacao t
       WHERE t.ata_id = v_ata.id AND t.documento_publicado_em >= p_desde
       ORDER BY t.documento_publicado_em
       LIMIT 1;
      IF v_data IS NOT NULL THEN
        RETURN COALESCE(NULLIF(btrim(v_txt), ''), 'Termo de prorrogação') || ' publicado no PNCP em ' || to_char(v_data, 'DD/MM/YYYY');
      END IF;
    WHEN 'ccga-ata-empenho-e3-t5' THEN
      SELECT c.numero, left(c.registro->>'dataAssinatura', 10)::date INTO v_txt, v_data
        FROM public.arp_item_contract_links l
        JOIN public.contratos_oficiais c ON c.contract_key = l.contract_key
       WHERE l.item_key LIKE v_ata.numero_ata || '-' || v_ata.codigo_uasg || '-%'
         AND c.registro->>'dataAssinatura' ~ '^\d{4}-\d{2}-\d{2}'
         AND left(c.registro->>'dataAssinatura', 10)::date >= p_desde
       ORDER BY 2, 1
       LIMIT 1;
      IF v_data IS NOT NULL THEN
        RETURN 'Contrato ' || v_txt || ' assinado em ' || to_char(v_data, 'DD/MM/YYYY') || ' e ligado à ata';
      END IF;
    ELSE
      NULL;
  END CASE;
  RETURN NULL;
END;
$$;

-- Fecha as tarefas abertas que a fonte comprova (não mexe nas reabertas pelo gestor).
CREATE OR REPLACE FUNCTION public.fechar_tarefas_pela_fonte()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_t RECORD;
  v_ev TEXT;
  v_n INTEGER := 0;
BEGIN
  FOR v_t IN
    SELECT t.id, t.template_task_id, p.contract_key, (mo.aplicado_em AT TIME ZONE 'America/Sao_Paulo')::date AS desde
      FROM public.contract_tasks t
      JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id
      JOIN public.contract_task_modulos mo ON mo.modulo_id = m.modulo_id
      JOIN public.contract_task_plans p ON p.id = m.plan_id
     WHERE t.status IN ('PENDENTE', 'EM_ANDAMENTO') AND NOT t.fonte_bloqueada AND mo.dispensado_em IS NULL
       AND t.template_task_id IN ('ccga-ct-assinado-e1-t1', 'ccga-ct-assinado-e1-t2', 'ccga-ct-assinado-e2-t3', 'ccga-ct-assinado-e3-t4',
                                  'ccga-ct-encerra-e2-t3', 'ccga-ct-empenho-ct-e2-t2', 'ccga-ct-aditivo-e4-t3', 'ccga-ct-alteracao-e3-t3',
                                  'ccga-ct-reequilibrio-ct-e3-t3', 'ccga-ct-reajuste-ct-e2-t4')
  LOOP
    v_ev := public.evidencia_da_fonte_contrato(v_t.template_task_id, v_t.contract_key, v_t.desde);
    IF v_ev IS NOT NULL THEN
      UPDATE public.contract_tasks
         SET status = 'CONCLUIDA', concluido_em = NOW(), concluido_por = NULL, fechada_pela_fonte = v_ev, atualizado_em = NOW()
       WHERE id = v_t.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  FOR v_t IN
    SELECT t.id, t.template_task_id, p.ata_key, (mo.aplicado_em AT TIME ZONE 'America/Sao_Paulo')::date AS desde
      FROM public.ata_tasks t
      JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
      JOIN public.ata_task_modulos mo ON mo.modulo_id = m.modulo_id
      JOIN public.ata_task_plans p ON p.id = m.plan_id
     WHERE t.status IN ('PENDENTE', 'EM_ANDAMENTO') AND NOT t.fonte_bloqueada AND mo.dispensado_em IS NULL
       AND t.template_task_id IN ('ccga-ata-prorrog-e4-t3', 'ccga-ata-empenho-e3-t5')
  LOOP
    v_ev := public.evidencia_da_fonte_ata(v_t.template_task_id, v_t.ata_key, v_t.desde);
    IF v_ev IS NOT NULL THEN
      UPDATE public.ata_tasks
         SET status = 'CONCLUIDA', concluido_em = NOW(), concluido_por = NULL, fechada_pela_fonte = v_ev, atualizado_em = NOW()
       WHERE id = v_t.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Reaberta pelo gestor (qualquer tela que tire o status de concluída): a fonte não fecha mais.
CREATE OR REPLACE FUNCTION public.trg_tarefa_reaberta_bloqueia_fonte()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.fechada_pela_fonte IS NOT NULL AND OLD.status = 'CONCLUIDA' AND NEW.status <> 'CONCLUIDA' THEN
    NEW.fonte_bloqueada := TRUE;
    NEW.fechada_pela_fonte := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_contract_tasks_reaberta_fonte ON public.contract_tasks;
CREATE TRIGGER trg_contract_tasks_reaberta_fonte BEFORE UPDATE ON public.contract_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_reaberta_bloqueia_fonte();
DROP TRIGGER IF EXISTS trg_ata_tasks_reaberta_fonte ON public.ata_tasks;
CREATE TRIGGER trg_ata_tasks_reaberta_fonte BEFORE UPDATE ON public.ata_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_reaberta_bloqueia_fonte();

-- 5. Quem entra sozinho (candidatos de hoje) ---------------------------------------
-- Uma linha por módulo a aplicar. Já aplicado (registro, ou módulo igual no plano no
-- mesmo ciclo, inclusive dispensado) fica de fora.
CREATE OR REPLACE FUNCTION public.candidatos_plano_automatico()
RETURNS TABLE (tipo TEXT, chave TEXT, uasg TEXT, numero TEXT, ano INTEGER, template_id TEXT, ciclo TEXT, variante TEXT, motivo TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH cfg AS (
    SELECT c.implantado_em AS impl, public.hoje_brasilia() AS hoje FROM public.plano_automatico_config c WHERE c.id
  ),
  ct AS (
    SELECT o.contract_key, o.uasg, o.numero, o.ano::int AS ano, o.data_vigencia_fim::date AS fim,
           CASE WHEN o.registro->>'dataAssinatura' ~ '^\d{4}-\d{2}-\d{2}' THEN left(o.registro->>'dataAssinatura', 10)::date END AS assinatura,
           COALESCE(o.registro->'raw'->>'categoria', '') AS categoria,
           COALESCE(o.registro->'raw'->>'prorrogavel', '') AS prorrogavel,
           COALESCE(o.registro->'raw'->>'situacao', 'Ativo') AS situacao,
           CASE WHEN o.registro->>'valorGlobal' ~ '^\d+(\.\d+)?$' THEN (o.registro->>'valorGlobal')::numeric END AS valor,
           f.faturado, f.ultima
      FROM public.contratos_oficiais o
      LEFT JOIN LATERAL (
        SELECT SUM(cf.valor) AS faturado, MAX(cf.emissao) AS ultima
          FROM public.contrato_faturas cf
         WHERE cf.contract_key = o.contract_key AND NOT COALESCE(cf.cancelada, FALSE)
      ) f ON TRUE
     WHERE o.ano ~ '^\d{4}$'
  ),
  cand AS (
    -- Contrato assinado: lido do Contratos.gov.br, assinado depois da implantação.
    SELECT 'CONTRATO'::text AS tipo, ct.contract_key AS chave, ct.uasg, ct.numero, ct.ano, 'ccga-ct-assinado'::text AS template_id, ''::text AS ciclo, NULL::text AS variante,
           'Contrato lido do Contratos.gov.br (assinado em ' || to_char(ct.assinatura, 'DD/MM/YYYY') || ')' AS motivo, NULL::date AS fim_ciclo
      FROM ct, cfg WHERE ct.assinatura >= cfg.impl AND ct.situacao = 'Ativo'
    UNION ALL
    -- Prorrogação de serviços e TIC: 180 dias antes do fim (na implantação, só com 45 dias ou mais).
    SELECT 'CONTRATO', ct.contract_key, ct.uasg, ct.numero, ct.ano, 'ccga-ct-aditivo', ct.fim::text,
           'Serviço contínuo (NT 13 · Parecer Referencial 4/2024)',
           'Faltam ' || (ct.fim - cfg.hoje) || ' dias para o fim da vigência (' || to_char(ct.fim, 'DD/MM/YYYY') || ')', ct.fim
      FROM ct, cfg
     WHERE ct.categoria <> 'Compras' AND ct.categoria <> '' AND ct.prorrogavel = 'Sim' AND ct.situacao = 'Ativo'
       AND ct.fim BETWEEN cfg.hoje AND cfg.hoje + 180
       AND (ct.fim - 180 >= cfg.impl OR ct.fim - cfg.impl >= 45)
    UNION ALL
    -- Prorrogação de compras: 60 dias antes do fim, se as faturas somam menos de 80% do valor.
    SELECT 'CONTRATO', ct.contract_key, ct.uasg, ct.numero, ct.ano, 'ccga-ct-aditivo', ct.fim::text,
           'A termo ou por escopo (NT 126 · Parecer Referencial 7/2025)',
           CASE WHEN COALESCE(ct.faturado, 0) = 0 THEN 'Sem fatura' ELSE 'Faturas somam ' || floor(100 * ct.faturado / ct.valor) || '% do valor' END
             || ' a ' || (ct.fim - cfg.hoje) || ' dias do fim da vigência (' || to_char(ct.fim, 'DD/MM/YYYY') || ')', ct.fim
      FROM ct, cfg
     WHERE ct.categoria = 'Compras' AND ct.situacao = 'Ativo' AND ct.valor > 0
       AND ct.fim BETWEEN cfg.hoje AND cfg.hoje + 60
       AND COALESCE(ct.faturado, 0) < 0.8 * ct.valor
    UNION ALL
    -- Encerramento: faturas somam o valor (depois da implantação) ou a vigência acabou sem prorrogação.
    SELECT 'CONTRATO', ct.contract_key, ct.uasg, ct.numero, ct.ano, 'ccga-ct-encerra', ct.fim::text, NULL,
           CASE WHEN ct.fim < cfg.hoje THEN 'Vigência terminou em ' || to_char(ct.fim, 'DD/MM/YYYY')
                ELSE 'Faturas somam o valor do contrato (última em ' || to_char(ct.ultima, 'DD/MM/YYYY') || ')' END, ct.fim
      FROM ct, cfg
     WHERE ct.fim IS NOT NULL
       AND ((ct.fim < cfg.hoje AND ct.fim >= cfg.impl)
            OR (ct.fim >= cfg.hoje AND ct.valor > 0 AND COALESCE(ct.faturado, 0) >= 0.999 * ct.valor AND ct.ultima >= cfg.impl))
    UNION ALL
    -- Ata publicada (SENASP gerenciadora), vigência iniciada depois da implantação.
    SELECT 'ATA', public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg), a.codigo_uasg, a.numero_ata, NULL, 'ccga-ata-publicada', '', NULL,
           'Ata lida do PNCP (vigência desde ' || to_char(a.data_vigencia_inicial, 'DD/MM/YYYY') || ')', NULL
      FROM public.atas_registro_preco a, cfg
     WHERE a.papel_senasp = 'GERENCIADORA' AND a.data_vigencia_inicial >= cfg.impl
    UNION ALL
    -- Prorrogação da ata: 180 dias antes do fim, se ainda pode prorrogar (vigência inicial de
    -- até 1 ano e nenhum termo de prorrogação no PNCP); na implantação, só com 45 dias ou mais.
    SELECT 'ATA', public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg), a.codigo_uasg, a.numero_ata, NULL, 'ccga-ata-prorrog', a.data_vigencia_final::text, NULL,
           'Faltam ' || (a.data_vigencia_final - cfg.hoje) || ' dias para o fim da vigência (' || to_char(a.data_vigencia_final, 'DD/MM/YYYY') || ')', a.data_vigencia_final
      FROM public.atas_registro_preco a, cfg
     WHERE a.papel_senasp = 'GERENCIADORA'
       AND a.data_vigencia_final BETWEEN cfg.hoje AND cfg.hoje + 180
       AND (a.data_vigencia_final - a.data_vigencia_inicial) <= 370
       AND NOT EXISTS (SELECT 1 FROM public.ata_termos_prorrogacao t WHERE t.ata_id = a.id)
       AND (a.data_vigencia_final - 180 >= cfg.impl OR a.data_vigencia_final - cfg.impl >= 45)
  )
  SELECT DISTINCT ON (c.tipo, c.chave, c.template_id, c.ciclo)
         c.tipo, c.chave, c.uasg, c.numero, c.ano, c.template_id, c.ciclo, c.variante, c.motivo
    FROM cand c
   WHERE c.chave IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.plano_automatico_registros r
                      WHERE r.tipo = c.tipo AND r.chave = c.chave AND r.template_id = c.template_id AND r.ciclo = c.ciclo)
     AND NOT EXISTS (
       SELECT 1 FROM public.contract_task_plans p JOIN public.contract_task_modulos mo ON mo.plan_id = p.id
        WHERE c.tipo = 'CONTRATO' AND p.contract_key = c.chave AND mo.template_id = c.template_id
          AND (c.fim_ciclo IS NULL OR mo.ciclo = c.ciclo OR mo.aplicado_em >= c.fim_ciclo - 240))
     AND NOT EXISTS (
       SELECT 1 FROM public.ata_task_plans p JOIN public.ata_task_modulos mo ON mo.plan_id = p.id
        WHERE c.tipo = 'ATA' AND p.ata_key = c.chave AND mo.template_id = c.template_id
          AND (c.fim_ciclo IS NULL OR mo.ciclo = c.ciclo OR mo.aplicado_em >= c.fim_ciclo - 240))
   ORDER BY c.tipo, c.chave, c.template_id, c.ciclo;
$$;

-- 6. Rotina diária -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.executar_plano_automatico()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c RECORD;
  v_res JSONB;
  v_mod TEXT;
  v_aplicados INTEGER := 0;
  v_fechadas INTEGER := 0;
  v_erros JSONB := '[]'::jsonb;
BEGIN
  FOR v_c IN SELECT * FROM public.candidatos_plano_automatico() LOOP
    BEGIN
      IF v_c.tipo = 'CONTRATO' THEN
        v_res := public.aplicar_modulo_contrato(v_c.uasg, v_c.numero, v_c.ano, v_c.template_id, NULL, 'AUTO', v_c.motivo, v_c.ciclo, v_c.variante);
        v_mod := v_res->>'modulo_id';
        -- Prorrogação a termo (compra): pesquisa de preços e vantajosidade não se aplicam (art. 107).
        IF v_c.template_id = 'ccga-ct-aditivo' AND v_c.variante LIKE 'A termo%' THEN
          UPDATE public.contract_tasks t
             SET status = 'NAO_APLICAVEL', observacao = 'Não se aplica à prorrogação a termo (compra).', atualizado_em = NOW()
            FROM public.contract_task_macrotasks m
           WHERE m.id = t.macrotask_id AND m.modulo_id = v_mod
             AND t.template_task_id IN ('ccga-ct-aditivo-e2-t1', 'ccga-ct-aditivo-e2-t2');
        END IF;
      ELSE
        v_res := public.aplicar_modulo_ata(v_c.chave, v_c.template_id, NULL, 'AUTO', v_c.motivo, v_c.ciclo, v_c.variante);
        v_mod := v_res->>'modulo_id';
      END IF;
      INSERT INTO public.plano_automatico_registros (tipo, chave, template_id, ciclo, modulo_id, motivo)
      VALUES (v_c.tipo, v_c.chave, v_c.template_id, v_c.ciclo, v_mod, v_c.motivo)
      ON CONFLICT DO NOTHING;
      v_aplicados := v_aplicados + 1;
    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros || jsonb_build_object('chave', v_c.chave, 'template_id', v_c.template_id, 'erro', SQLERRM);
    END;
  END LOOP;

  BEGIN
    v_fechadas := public.fechar_tarefas_pela_fonte();
  EXCEPTION WHEN OTHERS THEN
    v_erros := v_erros || jsonb_build_object('etapa', 'fonte', 'erro', SQLERRM);
  END;

  INSERT INTO public.plano_automatico_execucoes (modulos_aplicados, tarefas_fechadas, erros)
  VALUES (v_aplicados, v_fechadas, v_erros);
  RETURN jsonb_build_object('modulos_aplicados', v_aplicados, 'tarefas_fechadas', v_fechadas, 'erros', v_erros);
END;
$$;

-- 7. RPCs do gestor: dispensar módulo, pergunta da etapa, tarefa do pregão ---------
CREATE OR REPLACE FUNCTION public.dispensar_modulo_contrato(p_modulo_id VARCHAR(60), p_justificativa TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_record public.contract_task_modulos%ROWTYPE;
  v_n INTEGER;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.contract_key INTO v_key
    FROM public.contract_task_modulos mo JOIN public.contract_task_plans p ON p.id = mo.plan_id
   WHERE mo.modulo_id = btrim(COALESCE(p_modulo_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODULO_NOT_FOUND: Módulo "%" não encontrado.', p_modulo_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_key, NULL);
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 letras.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contract_task_modulos
     SET dispensado_em = NOW(), dispensado_por_user_id = auth.uid(), dispensado_por_nome = public.nome_do_usuario_logado(),
         dispensa_justificativa = left(v_just, 1000)
   WHERE modulo_id = btrim(p_modulo_id) AND dispensado_em IS NULL
  RETURNING * INTO v_record;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este módulo já foi dispensado.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contract_tasks t
     SET status = 'NAO_APLICAVEL', concluido_em = NULL, concluido_por = NULL,
         observacao = concat_ws(E'\n', NULLIF(btrim(COALESCE(t.observacao, '')), ''), 'Módulo dispensado: ' || left(v_just, 500)),
         atualizado_em = NOW()
    FROM public.contract_task_macrotasks m
   WHERE m.id = t.macrotask_id AND m.modulo_id = v_record.modulo_id AND t.status IN ('PENDENTE', 'EM_ANDAMENTO');
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'modulo', to_jsonb(v_record), 'tarefas_dispensadas', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.dispensar_modulo_ata(p_modulo_id VARCHAR(60), p_justificativa TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_record public.ata_task_modulos%ROWTYPE;
  v_n INTEGER;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.ata_key INTO v_key
    FROM public.ata_task_modulos mo JOIN public.ata_task_plans p ON p.id = mo.plan_id
   WHERE mo.modulo_id = btrim(COALESCE(p_modulo_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODULO_NOT_FOUND: Módulo "%" não encontrado.', p_modulo_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, v_key);
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 letras.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ata_task_modulos
     SET dispensado_em = NOW(), dispensado_por_user_id = auth.uid(), dispensado_por_nome = public.nome_do_usuario_logado(),
         dispensa_justificativa = left(v_just, 1000)
   WHERE modulo_id = btrim(p_modulo_id) AND dispensado_em IS NULL
  RETURNING * INTO v_record;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este módulo já foi dispensado.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ata_tasks t
     SET status = 'NAO_APLICAVEL', concluido_em = NULL, concluido_por = NULL,
         observacao = concat_ws(E'\n', NULLIF(btrim(COALESCE(t.observacao, '')), ''), 'Módulo dispensado: ' || left(v_just, 500)),
         atualizado_em = NOW()
    FROM public.ata_task_macrotasks m
   WHERE m.id = t.macrotask_id AND m.modulo_id = v_record.modulo_id AND t.status IN ('PENDENTE', 'EM_ANDAMENTO');
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'modulo', to_jsonb(v_record), 'tarefas_dispensadas', v_n);
END;
$$;

-- Pergunta que decide a etapa (D12): "Não" conclui a pergunta e deixa as outras tarefas
-- abertas da etapa como "não se aplica"; "Sim" só conclui a pergunta.
CREATE OR REPLACE FUNCTION public.responder_pergunta_etapa_contrato(p_task_id VARCHAR(60), p_aplica BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_macro TEXT;
  v_nome TEXT;
  v_n INTEGER := 0;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.contract_key, t.macrotask_id, t.nome INTO v_key, v_macro, v_nome
    FROM public.contract_tasks t
    JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.contract_task_plans p ON p.id = m.plan_id
   WHERE t.id = v_id AND t.pergunta_etapa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Pergunta com ID "%" não encontrada.', p_task_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_key, NULL);
  IF p_aplica IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Responda sim ou não.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contract_tasks
     SET status = 'CONCLUIDA', concluido_em = NOW(), concluido_por = public.nome_do_usuario_logado(),
         observacao = concat_ws(E'\n', NULLIF(btrim(COALESCE(observacao, '')), ''), 'Resposta: ' || CASE WHEN p_aplica THEN 'sim' ELSE 'não' END),
         atualizado_em = NOW()
   WHERE id = v_id;
  IF NOT p_aplica THEN
    UPDATE public.contract_tasks
       SET status = 'NAO_APLICAVEL',
           observacao = concat_ws(E'\n', NULLIF(btrim(COALESCE(observacao, '')), ''), 'Não se aplica (resposta "não" em: ' || v_nome || ')'),
           atualizado_em = NOW()
     WHERE macrotask_id = v_macro AND id <> v_id AND status IN ('PENDENTE', 'EM_ANDAMENTO');
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('success', true, 'tarefas_nao_aplicaveis', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.responder_pergunta_etapa_ata(p_task_id VARCHAR(60), p_aplica BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_macro TEXT;
  v_nome TEXT;
  v_n INTEGER := 0;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.' USING ERRCODE = '42501';
  END IF;
  SELECT p.ata_key, t.macrotask_id, t.nome INTO v_key, v_macro, v_nome
    FROM public.ata_tasks t
    JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.ata_task_plans p ON p.id = m.plan_id
   WHERE t.id = v_id AND t.pergunta_etapa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Pergunta com ID "%" não encontrada.', p_task_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, v_key);
  IF p_aplica IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Responda sim ou não.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ata_tasks
     SET status = 'CONCLUIDA', concluido_em = NOW(), concluido_por = public.nome_do_usuario_logado(),
         observacao = concat_ws(E'\n', NULLIF(btrim(COALESCE(observacao, '')), ''), 'Resposta: ' || CASE WHEN p_aplica THEN 'sim' ELSE 'não' END),
         atualizado_em = NOW()
   WHERE id = v_id;
  IF NOT p_aplica THEN
    UPDATE public.ata_tasks
       SET status = 'NAO_APLICAVEL',
           observacao = concat_ws(E'\n', NULLIF(btrim(COALESCE(observacao, '')), ''), 'Não se aplica (resposta "não" em: ' || v_nome || ')'),
           atualizado_em = NOW()
     WHERE macrotask_id = v_macro AND id <> v_id AND status IN ('PENDENTE', 'EM_ANDAMENTO');
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('success', true, 'tarefas_nao_aplicaveis', v_n);
END;
$$;

-- Tarefa do pregão (D10): as mesmas tarefas abertas nas outras atas do pregão
-- (mesma UASG, mesmo número e ano da compra).
CREATE OR REPLACE FUNCTION public.tarefas_do_pregao_ata(p_task_id VARCHAR(60))
RETURNS TABLE (task_id TEXT, ata_key TEXT, numero_ata TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH alvo AS (
    SELECT t.id, t.template_task_id, p.ata_key
      FROM public.ata_tasks t
      JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
      JOIN public.ata_task_plans p ON p.id = m.plan_id
     WHERE t.id = btrim(COALESCE(p_task_id, '')) AND t.do_pregao AND t.template_task_id IS NOT NULL
  ),
  atas AS (
    SELECT public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg) AS chave, a.numero_ata, a.codigo_uasg, a.ano_compra, a.numero_compra
      FROM public.atas_registro_preco a
     WHERE a.numero_compra IS NOT NULL AND a.ano_compra IS NOT NULL
  ),
  pregao AS (
    SELECT DISTINCT x.codigo_uasg, x.ano_compra, x.numero_compra FROM atas x JOIN alvo ON alvo.ata_key = x.chave
  )
  SELECT t.id::text, p.ata_key::text, a.numero_ata::text
    FROM alvo
    JOIN public.ata_tasks t ON t.template_task_id = alvo.template_task_id AND t.id <> alvo.id
    JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.ata_task_plans p ON p.id = m.plan_id
    JOIN atas a ON a.chave = p.ata_key
    JOIN pregao g ON g.codigo_uasg = a.codigo_uasg AND g.ano_compra = a.ano_compra AND g.numero_compra = a.numero_compra
   WHERE t.status IN ('PENDENTE', 'EM_ANDAMENTO')
   ORDER BY a.numero_ata;
$$;

CREATE OR REPLACE FUNCTION public.concluir_tarefa_pregao_ata(p_task_id VARCHAR(60), p_sei TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_task_id, ''));
  v_key TEXT;
  v_sei TEXT := public.normalizar_numero_sei(p_sei);
  v_nome TEXT := public.nome_do_usuario_logado();
  v_irma RECORD;
  v_concluidas TEXT[] := ARRAY[]::TEXT[];
  v_puladas TEXT[] := ARRAY[]::TEXT[];
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

  FOR v_irma IN SELECT * FROM public.tarefas_do_pregao_ata(v_id) LOOP
    BEGIN
      PERFORM public.exigir_alcance_do_gestor(NULL, v_irma.ata_key);
      UPDATE public.ata_tasks
         SET status = 'CONCLUIDA', concluido_em = NOW(), concluido_por = v_nome, sei_numero = COALESCE(v_sei, sei_numero),
             observacao = concat_ws(E'\n', NULLIF(btrim(COALESCE(observacao, '')), ''), 'Concluída junto com a ARP ' || v_key || ' (tarefa do pregão)'),
             atualizado_em = NOW()
       WHERE id = v_irma.task_id;
      v_concluidas := v_concluidas || v_irma.numero_ata;
    EXCEPTION WHEN insufficient_privilege THEN
      v_puladas := v_puladas || v_irma.numero_ata;
    END;
  END LOOP;

  UPDATE public.ata_tasks
     SET status = 'CONCLUIDA', concluido_em = COALESCE(concluido_em, NOW()), concluido_por = COALESCE(concluido_por, v_nome),
         sei_numero = COALESCE(v_sei, sei_numero), atualizado_em = NOW()
   WHERE id = v_id;

  RETURN jsonb_build_object('success', true, 'outras_atas', to_jsonb(v_concluidas), 'puladas', to_jsonb(v_puladas));
END;
$$;

-- 8. Ajustes nos modelos da CCGA ----------------------------------------------------
-- D12: a etapa da garantia começa perguntando se o contrato exige garantia.
UPDATE public.contract_task_template_tasks
   SET ordem = ordem + 1, updated_at = NOW()
 WHERE macrotask_id = 'ccga-ct-assinado-e2'
   AND NOT EXISTS (SELECT 1 FROM public.contract_task_template_tasks WHERE id = 'ccga-ct-assinado-e2-t0');
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, pergunta_etapa, created_at, updated_at)
VALUES ('ccga-ct-assinado-e2-t0', 'ccga-ct-assinado-e2', 'O contrato exige garantia?', 0, 'INTERNA', 'CONFERIR', 'Edital e contrato',
        ARRAY['Cláusula de garantia de execução do contrato', 'Edital: percentual e prazo para apresentar']::text[],
        'Contratos pequenos costumam dizer "não haverá exigência de garantia contratual". Com "Não", as tarefas da garantia saem como não se aplica.',
        NULL, '2 d.u. após a assinatura', 'INICIO', 2, TRUE, NULL, NULL, NULL, 10, FALSE, TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota,
  prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis,
  pergunta_etapa = TRUE, updated_at = NOW();

-- Na entrega descentralizada, quem designa os fiscais é o órgão que recebe.
UPDATE public.contract_task_template_tasks
   SET com_quem = 'Requisitante ou órgão que recebe', updated_at = NOW()
 WHERE id = 'ccga-ct-assinado-e3-t1' AND com_quem = 'Requisitante';

-- D3: compras também recebem o módulo de prorrogação (60 dias antes, se falta faturar).
UPDATE public.contract_task_templates
   SET quando = 'Serviços e TIC: 180 dias antes do fim · compras: 60 dias antes, se as faturas somam menos de 80% do valor',
       updated_at = NOW()
 WHERE id = 'ccga-ct-aditivo';

-- D4: encerramento curto, quando a entrega acaba ou a vigência termina.
UPDATE public.contract_task_templates
   SET gatilho = 'FIM_ENTREGA',
       quando = 'Quando as faturas somam o valor do contrato, ou no dia seguinte ao fim da vigência sem prorrogação',
       descricao = 'Informação de extinção por cumprimento do objeto, saldos, garantia e lançamento do encerramento.',
       updated_at = NOW()
 WHERE id = 'ccga-ct-encerra';
DELETE FROM public.contract_task_template_tasks
 WHERE macrotask_id IN ('ccga-ct-encerra-e1', 'ccga-ct-encerra-e2')
   AND id NOT IN ('ccga-ct-encerra-e1-t1', 'ccga-ct-encerra-e1-t2', 'ccga-ct-encerra-e2-t1', 'ccga-ct-encerra-e2-t2', 'ccga-ct-encerra-e2-t3');
UPDATE public.contract_task_template_macrotasks SET nome = 'Extinção', updated_at = NOW() WHERE id = 'ccga-ct-encerra-e1';
UPDATE public.contract_task_template_macrotasks SET nome = 'Saldos e garantia', updated_at = NOW() WHERE id = 'ccga-ct-encerra-e2';
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, execution_mode, acao, com_quem, lista, nota, modelo_sei, prazo_texto, prazo_ancora, prazo_dias, prazo_uteis, resposta_texto, resposta_dias, resposta_uteis, esforco_min, do_pregao, pergunta_etapa, created_at, updated_at)
VALUES
  ('ccga-ct-encerra-e1-t1', 'ccga-ct-encerra-e1', 'Conferir o recebimento definitivo de todas as entregas', 0, 'INTERNA', 'CONFERIR', 'Fiscal',
   ARRAY['Termo de recebimento definitivo de cada entrega', 'Relatório ou atesto da fiscalização técnica']::text[],
   'Sem recebimento definitivo de tudo, peça ao fiscal antes de seguir.', NULL, '5 d.u. após a entrada do módulo', 'APLICACAO', 5, TRUE, NULL, NULL, NULL, 15, FALSE, FALSE, NOW(), NOW()),
  ('ccga-ct-encerra-e1-t2', 'ccga-ct-encerra-e1', 'Redigir a Informação de extinção por cumprimento do objeto e arquivar o processo', 1, 'INTERNA', 'FAZER', NULL, NULL,
   'Cite o número SEI do recebimento definitivo.', 'Informação 73/2026/CCGA (34880074)', '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, 15, FALSE, FALSE, NOW(), NOW()),
  ('ccga-ct-encerra-e2-t1', 'ccga-ct-encerra-e2', 'Pedir à CGOFI a anulação do saldo de empenho, se houver', 0, 'EXTERNA', 'ORIENTAR', 'CGOFI', NULL,
   NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, 'resposta em 5 d.u.', 5, TRUE, NULL, FALSE, FALSE, NOW(), NOW()),
  ('ccga-ct-encerra-e2-t2', 'ccga-ct-encerra-e2', 'Pedir ao banco ou à seguradora a liberação da garantia, se houver', 1, 'EXTERNA', 'ORIENTAR', 'Banco · seguradora', NULL,
   NULL, NULL, 'junto com a anterior', 'ANTERIOR', 0, TRUE, 'resposta em 10 d.u.', 10, TRUE, NULL, FALSE, FALSE, NOW(), NOW()),
  ('ccga-ct-encerra-e2-t3', 'ccga-ct-encerra-e2', 'Lançar o encerramento no Contratos.gov.br', 2, 'INTERNA', 'LANCAR', 'Contratos.gov.br', NULL,
   NULL, NULL, '2 d.u. após a anterior', 'ANTERIOR', 2, TRUE, NULL, NULL, NULL, NULL, FALSE, FALSE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET macrotask_id = EXCLUDED.macrotask_id, nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, execution_mode = EXCLUDED.execution_mode,
  acao = EXCLUDED.acao, com_quem = EXCLUDED.com_quem, lista = EXCLUDED.lista, nota = EXCLUDED.nota, modelo_sei = EXCLUDED.modelo_sei,
  prazo_texto = EXCLUDED.prazo_texto, prazo_ancora = EXCLUDED.prazo_ancora, prazo_dias = EXCLUDED.prazo_dias, prazo_uteis = EXCLUDED.prazo_uteis,
  resposta_texto = EXCLUDED.resposta_texto, resposta_dias = EXCLUDED.resposta_dias, resposta_uteis = EXCLUDED.resposta_uteis,
  esforco_min = EXCLUDED.esforco_min, updated_at = NOW();

-- 9. Permissões ---------------------------------------------------------------------
-- Internas: só o dono (rotina diária e RPCs SECURITY DEFINER chamam).
REVOKE ALL ON FUNCTION public.aplicar_modulo_contrato(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_modulo_ata(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evidencia_da_fonte_contrato(TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evidencia_da_fonte_ata(TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fechar_tarefas_pela_fonte() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_tarefa_reaberta_bloqueia_fonte() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.candidatos_plano_automatico() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.executar_plano_automatico() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidatos_plano_automatico() TO service_role;
GRANT EXECUTE ON FUNCTION public.executar_plano_automatico() TO service_role;

-- RPCs do gestor.
REVOKE ALL ON FUNCTION public.dispensar_modulo_contrato(VARCHAR, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispensar_modulo_ata(VARCHAR, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.responder_pergunta_etapa_contrato(VARCHAR, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.responder_pergunta_etapa_ata(VARCHAR, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tarefas_do_pregao_ata(VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.concluir_tarefa_pregao_ata(VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispensar_modulo_contrato(VARCHAR, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispensar_modulo_ata(VARCHAR, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.responder_pergunta_etapa_contrato(VARCHAR, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.responder_pergunta_etapa_ata(VARCHAR, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tarefas_do_pregao_ata(VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.concluir_tarefa_pregao_ata(VARCHAR, TEXT) TO authenticated, service_role;

-- 10. Agenda: todo dia às 7h de Brasília, depois da leitura das fontes da madrugada --
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'plano-automatico';
    PERFORM cron.schedule('plano-automatico', '0 10 * * *', 'SELECT public.executar_plano_automatico()');
  END IF;
END $$;
