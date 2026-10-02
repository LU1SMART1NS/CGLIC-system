-- ==============================================================================
-- MIGRATION 57: REGRAS DE ALERTAS PARAMETRIZÁVEIS (Administração > Regras de Alertas)
-- Versão: 20261002000057_alert_settings.sql
--
-- Guarda apenas as SOBREPOSIÇÕES dos valores padrão definidos no código
-- (src/config/alertRules.ts): uma linha por regra alterada. Sem linha = vale o padrão.
-- Limites de lei (adesão, aditivos, vedações da Lei 14.133) NÃO são parametrizáveis
-- e não têm chave aqui.
--
-- Leitura: qualquer usuário (o app precisa das regras para classificar os alertas).
-- Escrita: somente administrador, via RPC, que também registra a mudança em audit_logs.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.alert_settings (
  key VARCHAR(100) PRIMARY KEY,
  value NUMERIC NOT NULL CHECK (value >= 0 AND value <= 3650),
  updated_by UUID DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: alert_settings"
  ON public.alert_settings FOR SELECT USING (true);

-- p_values: {"saldo.criticoAcimaDePct": 85, "tarefa.urgenteAteDias": null, ...}
-- Valor numérico = grava a sobreposição; null = remove (volta ao padrão do código).
CREATE OR REPLACE FUNCTION public.save_alert_settings_atomic(p_values JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_val JSONB;
  v_old NUMERIC;
  v_changed INTEGER := 0;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Somente administradores podem alterar as regras de alertas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe um objeto {chave: valor}.' USING ERRCODE = '22023';
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_values) LOOP
    IF v_key !~ '^[A-Za-z]+(\.[A-Za-z]+)+$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Chave de regra inválida: "%"', v_key USING ERRCODE = '22023';
    END IF;

    SELECT value INTO v_old FROM public.alert_settings WHERE key = v_key;

    IF jsonb_typeof(v_val) = 'null' THEN
      IF v_old IS NOT NULL THEN
        DELETE FROM public.alert_settings WHERE key = v_key;
        INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
        VALUES ('alert_settings', v_key, 'DELETE', jsonb_build_object('value', v_old), NULL, auth.uid());
        v_changed := v_changed + 1;
      END IF;
    ELSIF jsonb_typeof(v_val) = 'number' THEN
      IF v_old IS DISTINCT FROM (v_val #>> '{}')::NUMERIC THEN
        INSERT INTO public.alert_settings (key, value, updated_by, updated_at)
        VALUES (v_key, (v_val #>> '{}')::NUMERIC, auth.uid(), NOW())
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
        INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
        VALUES (
          'alert_settings', v_key,
          CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
          CASE WHEN v_old IS NULL THEN NULL ELSE jsonb_build_object('value', v_old) END,
          jsonb_build_object('value', (v_val #>> '{}')::NUMERIC),
          auth.uid()
        );
        v_changed := v_changed + 1;
      END IF;
    ELSE
      RAISE EXCEPTION 'INVALID_PAYLOAD: O valor de "%" deve ser número ou null.', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'changed', v_changed);
END;
$$;

REVOKE ALL ON FUNCTION public.save_alert_settings_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_alert_settings_atomic(JSONB) TO authenticated;
