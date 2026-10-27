-- ==============================================================================
-- Modelo de gestão da CCGA, entrega 2 (telas): o coordenador edita a regra das tarefas
--
-- A migration 210 trouxe a ação do gestor, o "com quem", a lista do que pedir/conferir,
-- o esforço e a regra de prazo de cada tarefa dos modelos, mas as RPCs antigas dos
-- modelos só gravam nome, ordem e modo de execução. Esta migration acrescenta:
--
--   salvar_regra_tarefa_modelo_contrato / _ata   ação, com quem, lista, nota, modelo SEI,
--                                                 regra de prazo e de resposta, esforço
--   salvar_detalhes_modelo_contrato / _ata        quando entra, base normativa, processo SEI
--                                                 em que corre e variantes do módulo
--
-- Só o coordenador (admin) grava, como nas demais RPCs dos modelos (migration 199).
-- Os planos que já aplicaram o modelo não mudam: as tarefas foram copiadas na aplicação.
-- O modo de execução antigo segue a ação (orientar = EXTERNA, acompanhar = AUTOMATICA,
-- as demais = INTERNA), como na carga da migration 210.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.salvar_regra_tarefa_modelo(
  p_tabela TEXT,
  p_id TEXT,
  p_acao TEXT,
  p_com_quem TEXT,
  p_lista TEXT[],
  p_nota TEXT,
  p_modelo_sei TEXT,
  p_prazo_texto TEXT,
  p_prazo_ancora TEXT,
  p_prazo_dias INTEGER,
  p_prazo_uteis BOOLEAN,
  p_resposta_texto TEXT,
  p_resposta_dias INTEGER,
  p_resposta_uteis BOOLEAN,
  p_esforco_min INTEGER,
  p_do_pregao BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_id, ''));
  v_acao TEXT := NULLIF(upper(btrim(COALESCE(p_acao, ''))), '');
  v_ancora TEXT := NULLIF(upper(btrim(COALESCE(p_prazo_ancora, ''))), '');
  v_lista TEXT[];
  v_modo TEXT;
  v_existe BOOLEAN;
  v_row JSONB;
BEGIN
  IF p_tabela NOT IN ('contract_task_template_tasks', 'ata_task_template_tasks') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: tabela inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_role('admin') THEN  -- só o coordenador altera os modelos (migration 199)
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador altera os modelos de gestão.' USING ERRCODE = '42501';
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', p_tabela) INTO v_existe USING v_id;
  IF NOT v_existe THEN
    RAISE EXCEPTION 'TEMPLATE_TASK_NOT_FOUND: Tarefa do modelo "%" não encontrada.', p_id USING ERRCODE = 'P0002';
  END IF;

  IF v_acao IS NOT NULL AND v_acao NOT IN ('FAZER', 'ORIENTAR', 'CONFERIR', 'ASSINAR', 'LANCAR', 'ACOMPANHAR') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Ação inválida ("%").', p_acao USING ERRCODE = '22023';
  END IF;
  IF v_ancora IS NOT NULL AND v_ancora NOT IN ('VIGENCIA_FIM', 'INICIO', 'APLICACAO', 'ANTERIOR', 'FIXO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Regra de prazo inválida ("%").', p_prazo_ancora USING ERRCODE = '22023';
  END IF;
  IF v_ancora IN ('VIGENCIA_FIM', 'INICIO', 'APLICACAO', 'ANTERIOR') AND p_prazo_dias IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe quantos dias a regra de prazo conta.' USING ERRCODE = '22023';
  END IF;
  IF v_ancora IN ('APLICACAO', 'ANTERIOR') AND p_prazo_dias < 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo depois da partida ou da tarefa anterior não pode ser negativo.' USING ERRCODE = '22023';
  END IF;
  IF abs(COALESCE(p_prazo_dias, 0)) > 1000 OR COALESCE(p_resposta_dias, 0) NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo fora do limite (até 1000 dias).' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_esforco_min, 0) NOT BETWEEN 0 AND 2400 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Esforço fora do limite (até 40 horas).' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(left(btrim(x), 300) ORDER BY n) INTO v_lista
    FROM unnest(COALESCE(p_lista, '{}'::text[])) WITH ORDINALITY AS u(x, n)
   WHERE btrim(COALESCE(x, '')) <> '';

  v_modo := CASE WHEN v_acao IS NULL THEN NULL WHEN v_acao = 'ORIENTAR' THEN 'EXTERNA' WHEN v_acao = 'ACOMPANHAR' THEN 'AUTOMATICA' ELSE 'INTERNA' END;

  EXECUTE format($f$
    UPDATE public.%I SET
      acao = $2,
      execution_mode = COALESCE($3, execution_mode),
      com_quem = $4,
      lista = $5,
      nota = $6,
      modelo_sei = $7,
      prazo_texto = $8,
      prazo_ancora = $9,
      prazo_dias = $10,
      prazo_uteis = $11,
      resposta_texto = $12,
      resposta_dias = $13,
      resposta_uteis = $14,
      esforco_min = $15,
      do_pregao = $16,
      updated_at = NOW()
    WHERE id = $1
    RETURNING to_jsonb(%I.*)
  $f$, p_tabela, p_tabela)
  INTO v_row
  USING v_id,
        v_acao,
        v_modo,
        NULLIF(left(btrim(COALESCE(p_com_quem, '')), 200), ''),
        v_lista,
        NULLIF(btrim(COALESCE(p_nota, '')), ''),
        NULLIF(left(btrim(COALESCE(p_modelo_sei, '')), 300), ''),
        NULLIF(left(btrim(COALESCE(p_prazo_texto, '')), 120), ''),
        v_ancora,
        CASE WHEN v_ancora IN ('VIGENCIA_FIM', 'INICIO', 'APLICACAO', 'ANTERIOR') THEN p_prazo_dias END,
        CASE WHEN v_ancora IN ('VIGENCIA_FIM', 'INICIO', 'APLICACAO', 'ANTERIOR') THEN COALESCE(p_prazo_uteis, v_ancora IN ('APLICACAO', 'ANTERIOR')) END,
        CASE WHEN v_acao = 'ORIENTAR' THEN NULLIF(left(btrim(COALESCE(p_resposta_texto, '')), 120), '') END,
        CASE WHEN v_acao = 'ORIENTAR' THEN p_resposta_dias END,
        CASE WHEN v_acao = 'ORIENTAR' AND p_resposta_dias IS NOT NULL THEN COALESCE(p_resposta_uteis, TRUE) END,
        NULLIF(p_esforco_min, 0),
        COALESCE(p_do_pregao, FALSE);

  RETURN jsonb_build_object('success', true, 'task', v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_regra_tarefa_modelo_contrato(
  p_id VARCHAR(60), p_acao TEXT DEFAULT NULL, p_com_quem TEXT DEFAULT NULL, p_lista TEXT[] DEFAULT NULL,
  p_nota TEXT DEFAULT NULL, p_modelo_sei TEXT DEFAULT NULL, p_prazo_texto TEXT DEFAULT NULL,
  p_prazo_ancora TEXT DEFAULT NULL, p_prazo_dias INTEGER DEFAULT NULL, p_prazo_uteis BOOLEAN DEFAULT NULL,
  p_resposta_texto TEXT DEFAULT NULL, p_resposta_dias INTEGER DEFAULT NULL, p_resposta_uteis BOOLEAN DEFAULT NULL,
  p_esforco_min INTEGER DEFAULT NULL, p_do_pregao BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.salvar_regra_tarefa_modelo('contract_task_template_tasks', p_id, p_acao, p_com_quem, p_lista, p_nota, p_modelo_sei,
    p_prazo_texto, p_prazo_ancora, p_prazo_dias, p_prazo_uteis, p_resposta_texto, p_resposta_dias, p_resposta_uteis, p_esforco_min, p_do_pregao);
$$;

CREATE OR REPLACE FUNCTION public.salvar_regra_tarefa_modelo_ata(
  p_id VARCHAR(60), p_acao TEXT DEFAULT NULL, p_com_quem TEXT DEFAULT NULL, p_lista TEXT[] DEFAULT NULL,
  p_nota TEXT DEFAULT NULL, p_modelo_sei TEXT DEFAULT NULL, p_prazo_texto TEXT DEFAULT NULL,
  p_prazo_ancora TEXT DEFAULT NULL, p_prazo_dias INTEGER DEFAULT NULL, p_prazo_uteis BOOLEAN DEFAULT NULL,
  p_resposta_texto TEXT DEFAULT NULL, p_resposta_dias INTEGER DEFAULT NULL, p_resposta_uteis BOOLEAN DEFAULT NULL,
  p_esforco_min INTEGER DEFAULT NULL, p_do_pregao BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.salvar_regra_tarefa_modelo('ata_task_template_tasks', p_id, p_acao, p_com_quem, p_lista, p_nota, p_modelo_sei,
    p_prazo_texto, p_prazo_ancora, p_prazo_dias, p_prazo_uteis, p_resposta_texto, p_resposta_dias, p_resposta_uteis, p_esforco_min, p_do_pregao);
$$;

CREATE OR REPLACE FUNCTION public.salvar_detalhes_modelo(
  p_tabela TEXT,
  p_id TEXT,
  p_quando TEXT,
  p_base TEXT,
  p_processo_tipo TEXT,
  p_variantes TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id TEXT := btrim(COALESCE(p_id, ''));
  v_variantes TEXT[];
  v_row JSONB;
BEGIN
  IF p_tabela NOT IN ('contract_task_templates', 'ata_task_templates') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: tabela inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_role('admin') THEN  -- só o coordenador altera os modelos (migration 199)
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador altera os modelos de gestão.' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(left(btrim(x), 120) ORDER BY n) INTO v_variantes
    FROM unnest(COALESCE(p_variantes, '{}'::text[])) WITH ORDINALITY AS u(x, n)
   WHERE btrim(COALESCE(x, '')) <> '';

  EXECUTE format($f$
    UPDATE public.%I SET
      quando = $2,
      base = $3,
      processo_tipo = $4,
      variantes = $5,
      updated_at = NOW()
    WHERE id = $1
    RETURNING to_jsonb(%I.*)
  $f$, p_tabela, p_tabela)
  INTO v_row
  USING v_id,
        NULLIF(left(btrim(COALESCE(p_quando, '')), 300), ''),
        NULLIF(left(btrim(COALESCE(p_base, '')), 500), ''),
        NULLIF(left(btrim(COALESCE(p_processo_tipo, '')), 60), ''),
        v_variantes;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: Modelo "%" não encontrado.', p_id USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('success', true, 'template', v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_detalhes_modelo_contrato(
  p_id VARCHAR(60), p_quando TEXT DEFAULT NULL, p_base TEXT DEFAULT NULL, p_processo_tipo TEXT DEFAULT NULL, p_variantes TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.salvar_detalhes_modelo('contract_task_templates', p_id, p_quando, p_base, p_processo_tipo, p_variantes);
$$;

CREATE OR REPLACE FUNCTION public.salvar_detalhes_modelo_ata(
  p_id VARCHAR(60), p_quando TEXT DEFAULT NULL, p_base TEXT DEFAULT NULL, p_processo_tipo TEXT DEFAULT NULL, p_variantes TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.salvar_detalhes_modelo('ata_task_templates', p_id, p_quando, p_base, p_processo_tipo, p_variantes);
$$;

-- Permissões: as internas só pelo dono; as do coordenador para logados (a função confere o papel).
REVOKE ALL ON FUNCTION public.salvar_regra_tarefa_modelo(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, BOOLEAN, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salvar_detalhes_modelo(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salvar_regra_tarefa_modelo_contrato(VARCHAR, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, BOOLEAN, INTEGER, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_regra_tarefa_modelo_ata(VARCHAR, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, BOOLEAN, INTEGER, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_detalhes_modelo_contrato(VARCHAR, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_detalhes_modelo_ata(VARCHAR, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_regra_tarefa_modelo_contrato(VARCHAR, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, BOOLEAN, INTEGER, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_regra_tarefa_modelo_ata(VARCHAR, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, BOOLEAN, INTEGER, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_detalhes_modelo_contrato(VARCHAR, TEXT, TEXT, TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_detalhes_modelo_ata(VARCHAR, TEXT, TEXT, TEXT, TEXT[]) TO authenticated, service_role;

-- Texto: três descrições da carga da 210 ainda diziam "levar à assinatura"; o usuário
-- pediu "disponibilizar para assinatura" (todo documento é assinado no SEI).
UPDATE public.contract_task_templates
   SET descricao = replace(descricao, 'levar à assinatura', 'disponibilizar para assinatura'), updated_at = NOW()
 WHERE origem_modelo = 'CCGA' AND descricao LIKE '%levar à assinatura%';
UPDATE public.ata_task_templates
   SET descricao = replace(descricao, 'levar à assinatura', 'disponibilizar para assinatura'), updated_at = NOW()
 WHERE origem_modelo = 'CCGA' AND descricao LIKE '%levar à assinatura%';
