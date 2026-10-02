-- ==============================================================================
-- MIGRATION 59: CALENDÁRIO DE FERIADOS E PONTOS FACULTATIVOS (Administração > Feriados)
-- Versão: 20261002000059_holidays.sql
--
-- Uma linha por data. Cadastro híbrido:
--   - origem API: feriados nacionais importados da BrasilAPI;
--   - origem CALCULADO: importados do calendário calculado pelo sistema (quando a API
--     está fora do ar, ou feriados distritais e pontos facultativos usuais);
--   - origem MANUAL: lançados pelo administrador (portaria anual do MGI, DF etc.).
-- A importação nunca sobrescreve uma data que já existe: o que o administrador ajustou
-- prevalece. Para deixar de contar uma data, desative-a (ativo = false).
-- Meio expediente (ex.: Quarta-feira de Cinzas até 14h) conta como dia útil.
--
-- Leitura: qualquer usuário (os prazos em dias úteis dependem do calendário).
-- Escrita: somente administrador, via RPC, que também registra a mudança em audit_logs.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.holidays (
  data DATE PRIMARY KEY,
  nome VARCHAR(150) NOT NULL CHECK (length(trim(nome)) > 0),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('NACIONAL', 'DISTRITAL', 'PONTO_FACULTATIVO')),
  origem VARCHAR(10) NOT NULL CHECK (origem IN ('API', 'CALCULADO', 'MANUAL')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  meio_expediente BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: holidays"
  ON public.holidays FOR SELECT USING (true);

-- ------------------------------------------------------------------------------
-- Inclui ou altera uma data. p_data_original permite mudar a data de um registro.
-- Registro novo nasce como MANUAL; registro existente mantém a origem.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_holiday_atomic(
  p_data DATE,
  p_nome TEXT,
  p_tipo TEXT,
  p_ativo BOOLEAN DEFAULT TRUE,
  p_meio_expediente BOOLEAN DEFAULT FALSE,
  p_data_original DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.holidays%ROWTYPE;
  v_new public.holidays%ROWTYPE;
  v_origem TEXT := 'MANUAL';
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Somente administradores podem alterar o calendário de feriados.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data.' USING ERRCODE = '22023';
  END IF;
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o nome do feriado.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('NACIONAL', 'DISTRITAL', 'PONTO_FACULTATIVO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Tipo de feriado inválido: "%"', p_tipo USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old FROM public.holidays WHERE data = COALESCE(p_data_original, p_data);
  IF FOUND THEN
    v_origem := v_old.origem;
  END IF;

  IF p_data_original IS NOT NULL AND p_data_original <> p_data THEN
    IF EXISTS (SELECT 1 FROM public.holidays WHERE data = p_data) THEN
      RAISE EXCEPTION 'CONFLICT: Já existe um feriado cadastrado em %.', to_char(p_data, 'DD/MM/YYYY')
        USING ERRCODE = '23505';
    END IF;
    DELETE FROM public.holidays WHERE data = p_data_original;
  END IF;

  INSERT INTO public.holidays (data, nome, tipo, origem, ativo, meio_expediente, updated_by, updated_at)
  VALUES (p_data, trim(p_nome), p_tipo, v_origem, COALESCE(p_ativo, TRUE), COALESCE(p_meio_expediente, FALSE), auth.uid(), NOW())
  ON CONFLICT (data) DO UPDATE
    SET nome = EXCLUDED.nome,
        tipo = EXCLUDED.tipo,
        ativo = EXCLUDED.ativo,
        meio_expediente = EXCLUDED.meio_expediente,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_new;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
  VALUES (
    'holidays', p_data::TEXT,
    CASE WHEN v_old.data IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    CASE WHEN v_old.data IS NULL THEN NULL ELSE to_jsonb(v_old) END,
    to_jsonb(v_new),
    auth.uid()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- Exclui uma data. Se for feriado do calendário calculado, ele volta a valer
-- automaticamente; para deixar de contar, use ativo = false.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_holiday_atomic(p_data DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.holidays%ROWTYPE;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Somente administradores podem alterar o calendário de feriados.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.holidays WHERE data = p_data RETURNING * INTO v_old;
  IF v_old.data IS NOT NULL THEN
    INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
    VALUES ('holidays', p_data::TEXT, 'DELETE', to_jsonb(v_old), NULL, auth.uid());
  END IF;

  RETURN jsonb_build_object('success', true, 'deleted', v_old.data IS NOT NULL);
END;
$$;

-- ------------------------------------------------------------------------------
-- Importação em lote: p_rows = [{"data":"2026-01-01","nome":"...","tipo":"NACIONAL",
-- "meio_expediente":false}, ...]. Datas já cadastradas são ignoradas.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_holidays_atomic(p_rows JSONB, p_origem TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row JSONB;
  v_new public.holidays%ROWTYPE;
  v_inserted INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Somente administradores podem alterar o calendário de feriados.'
      USING ERRCODE = '42501';
  END IF;

  IF p_origem IS NULL OR p_origem NOT IN ('API', 'CALCULADO', 'MANUAL') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Origem inválida: "%"', p_origem USING ERRCODE = '22023';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe uma lista de feriados.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF (v_row->>'tipo') NOT IN ('NACIONAL', 'DISTRITAL', 'PONTO_FACULTATIVO')
       OR length(trim(COALESCE(v_row->>'nome', ''))) = 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Feriado inválido: %', v_row::TEXT USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.holidays (data, nome, tipo, origem, ativo, meio_expediente, updated_by, updated_at)
    VALUES (
      (v_row->>'data')::DATE,
      trim(v_row->>'nome'),
      v_row->>'tipo',
      p_origem,
      TRUE,
      COALESCE((v_row->>'meio_expediente')::BOOLEAN, FALSE),
      auth.uid(),
      NOW()
    )
    ON CONFLICT (data) DO NOTHING
    RETURNING * INTO v_new;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
      INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
      VALUES ('holidays', v_new.data::TEXT, 'INSERT', NULL, to_jsonb(v_new), auth.uid());
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.save_holiday_atomic(DATE, TEXT, TEXT, BOOLEAN, BOOLEAN, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_holiday_atomic(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_holidays_atomic(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_holiday_atomic(DATE, TEXT, TEXT, BOOLEAN, BOOLEAN, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_holiday_atomic(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_holidays_atomic(JSONB, TEXT) TO authenticated;
