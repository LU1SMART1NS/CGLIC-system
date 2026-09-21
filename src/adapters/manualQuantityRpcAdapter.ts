import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { RpcManualQuantityItem, RpcManualQuantityResult } from '../types/rpc';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';

/**
 * Adapter de Persistência Transacional para Quantidades Manuais de Empenho via RPC save_empenho_manual_quantities_atomic (SaldoARP 3.0)
 */
export async function executeSaveManualQuantitiesRpc(
  itemKey: string,
  quantities: Record<string, number> | RpcManualQuantityItem[],
  expectedVersion: number
): Promise<RpcManualQuantityResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  // 1. Assegura a canonicalização da chave
  const parsed = parseItemKey(itemKey);
  const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

  // 2. Prepara o payload canônico em formato array de objetos { emp_key, quantidade }
  let payloadRows: RpcManualQuantityItem[] = [];

  if (Array.isArray(quantities)) {
    payloadRows = quantities.map(q => ({
      emp_key: String(q.emp_key || (q as any).empKey || '').trim(),
      quantidade: Number(q.quantidade)
    }));
  } else if (quantities && typeof quantities === 'object') {
    payloadRows = Object.entries(quantities).map(([emp_key, quantidade]) => ({
      emp_key: String(emp_key).trim(),
      quantidade: Number(quantidade)
    }));
  }

  try {
    const { data, error } = await supabase.rpc('save_empenho_manual_quantities_atomic', {
      p_item_key: canonicalKey,
      p_quantities: payloadRows,
      p_expected_version: expectedVersion
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_empenho_manual_quantities_atomic'));
    }

    return data as RpcManualQuantityResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err; // Já é um AppMutationError
    }
    throw mapPostgresErrorToAppError(err);
  }
}
