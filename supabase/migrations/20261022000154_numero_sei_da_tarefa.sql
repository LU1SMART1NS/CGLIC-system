-- ==============================================================================
-- Número SEI da tarefa do plano (Contrato e Ata)
--
-- Ao concluir uma tarefa, a tela pergunta o número SEI (opcional). O número fica
-- ao lado da tarefa, com botão para copiar, e pode ser corrigido depois.
--
-- Aceita (decisão do usuário, 22/10/2026):
--   - número de documento SEI: só dígitos, de 7 a 10;
--   - número de processo SEI: 17 dígitos, gravado com a máscara NNNNN.NNNNNN/AAAA-DD.
--
-- As RPCs de status (update_contract_task_atomic / update_ata_task_atomic) não
-- mudam: elas já têm a conferência do gestor (migration 126). As RPCs novas
-- conferem o mesmo alcance, gravam o número e, com p_concluir, concluem a tarefa
-- pela RPC de sempre na mesma transação.
-- ==============================================================================

-- 1. Normalização ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalizar_numero_sei(p_sei TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sei TEXT := btrim(COALESCE(p_sei, ''));
  v_digitos TEXT;
BEGIN
  IF v_sei = '' THEN
    RETURN NULL;
  END IF;
  IF v_sei ~ '^\d{7,10}$' THEN
    RETURN v_sei;
  END IF;
  v_digitos := regexp_replace(v_sei, '\D', '', 'g');
  IF v_sei ~ '^[\d./ -]+$' AND length(v_digitos) = 17 THEN
    RETURN substr(v_digitos, 1, 5) || '.' || substr(v_digitos, 6, 6) || '/' || substr(v_digitos, 12, 4) || '-' || substr(v_digitos, 16, 2);
  END IF;
  RAISE EXCEPTION 'INVALID_PAYLOAD: Número SEI inválido ("%"). Use os dígitos do documento (7 a 10) ou o processo (NNNNN.NNNNNN/AAAA-DD).', v_sei
    USING ERRCODE = '22023';
END;
$$;

-- 2. Colunas --------------------------------------------------------------------
ALTER TABLE public.contract_tasks
  ADD COLUMN IF NOT EXISTS sei_numero VARCHAR(25)
    CONSTRAINT contract_tasks_sei_numero_formato CHECK (sei_numero ~ '^(\d{7,10}|\d{5}\.\d{6}/\d{4}-\d{2})$');
ALTER TABLE public.ata_tasks
  ADD COLUMN IF NOT EXISTS sei_numero VARCHAR(25)
    CONSTRAINT ata_tasks_sei_numero_formato CHECK (sei_numero ~ '^(\d{7,10}|\d{5}\.\d{6}/\d{4}-\d{2})$');

COMMENT ON COLUMN public.contract_tasks.sei_numero IS 'Número SEI informado ao concluir a tarefa: documento (7 a 10 dígitos) ou processo (NNNNN.NNNNNN/AAAA-DD).';
COMMENT ON COLUMN public.ata_tasks.sei_numero IS 'Número SEI informado ao concluir a tarefa: documento (7 a 10 dígitos) ou processo (NNNNN.NNNNNN/AAAA-DD).';

-- 3. Tarefa do contrato ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.definir_sei_tarefa_contrato(
  p_task_id VARCHAR(60),
  p_sei TEXT,
  p_concluir BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key TEXT;
  v_sei TEXT;
  v_record public.contract_tasks%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.contract_key INTO v_contract_key
    FROM public.contract_tasks t
    JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.contract_task_plans p ON p.id = m.plan_id
   WHERE t.id = btrim(COALESCE(p_task_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_task_id
      USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_contract_key, NULL);

  v_sei := public.normalizar_numero_sei(p_sei);

  IF p_concluir THEN
    PERFORM public.update_contract_task_atomic(p_task_id => btrim(p_task_id), p_status => 'CONCLUIDA');
  END IF;

  UPDATE public.contract_tasks
     SET sei_numero = v_sei,
         atualizado_em = NOW()
   WHERE id = btrim(p_task_id)
  RETURNING * INTO v_record;

  RETURN jsonb_build_object('success', true, 'task', to_jsonb(v_record));
END;
$$;

-- 4. Tarefa da ata --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.definir_sei_tarefa_ata(
  p_task_id VARCHAR(60),
  p_sei TEXT,
  p_concluir BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata_key TEXT;
  v_sei TEXT;
  v_record public.ata_tasks%ROWTYPE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.ata_key INTO v_ata_key
    FROM public.ata_tasks t
    JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
    JOIN public.ata_task_plans p ON p.id = m.plan_id
   WHERE t.id = btrim(COALESCE(p_task_id, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', p_task_id
      USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, v_ata_key);

  v_sei := public.normalizar_numero_sei(p_sei);

  IF p_concluir THEN
    PERFORM public.update_ata_task_atomic(p_task_id => btrim(p_task_id), p_status => 'CONCLUIDA');
  END IF;

  UPDATE public.ata_tasks
     SET sei_numero = v_sei,
         atualizado_em = NOW()
   WHERE id = btrim(p_task_id)
  RETURNING * INTO v_record;

  RETURN jsonb_build_object('success', true, 'task', to_jsonb(v_record));
END;
$$;

-- 5. Permissões -----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.normalizar_numero_sei(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_sei_tarefa_contrato(VARCHAR, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_sei_tarefa_ata(VARCHAR, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_numero_sei(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_sei_tarefa_contrato(VARCHAR, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_sei_tarefa_ata(VARCHAR, TEXT, BOOLEAN) TO authenticated, service_role;
