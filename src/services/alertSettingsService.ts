import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { ALERT_RULE_DEFAULTS, applyAlertRuleOverrides } from '../config/alertRules';

/** Sobreposições gravadas em alert_settings (só o que difere do padrão). */
export async function fetchAlertSettings(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured || !supabase) return {};
  const { data, error } = await supabase.from('alert_settings').select('key, value');
  if (error) throw error;
  const result: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ key: string; value: number | string }>) {
    result[row.key] = Number(row.value);
  }
  return result;
}

/** Transforma os valores do formulário em sobreposições: igual ao padrão = null (remove a linha). */
export function toSettingsPayload(values: Record<string, number>): Record<string, number | null> {
  const payload: Record<string, number | null> = {};
  for (const [key, def] of Object.entries(ALERT_RULE_DEFAULTS)) {
    payload[key] = values[key] === def ? null : values[key];
  }
  return payload;
}

export async function saveAlertSettings(values: Record<string, number>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }
  const { error } = await supabase.rpc('save_alert_settings_atomic', { p_values: toSettingsPayload(values) });
  if (error) throw mapPostgresErrorToAppError(error);
  applyAlertRuleOverrides(values);
}

/** Carrega e aplica as regras do banco. Falha de leitura mantém os padrões do código. */
export async function loadAndApplyAlertSettings(): Promise<void> {
  try {
    applyAlertRuleOverrides(await fetchAlertSettings());
  } catch (err) {
    console.warn('[alertSettings] Regras de alertas não carregadas; usando os padrões do sistema:', err);
    applyAlertRuleOverrides({});
  }
}
