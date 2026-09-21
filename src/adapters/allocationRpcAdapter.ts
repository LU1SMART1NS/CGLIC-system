import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { RpcAllocationItem, RpcAllocationResult } from '../types/rpc';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';

/**
 * Adapter de Persistência Transacional para Alocações Departamentais via RPC save_allocations_atomic
 */
export async function executeSaveAllocationsRpc(
  itemKey: string,
  allocations: RpcAllocationItem[],
  expectedVersion?: number | null
): Promise<RpcAllocationResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  // 1. Assegura a canonicalização da chave
  const parsed = parseItemKey(itemKey);
  const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

  // 2. Prepara o payload estruturado para a RPC
  const payloadRows = allocations.map(a => ({
    id: a.id,
    unit_name: (a.unit_name || a.unitName || '').trim(),
    allocated_qty: Number(a.allocated_qty ?? a.allocatedQty ?? 0),
    empenhada_qty: Number(a.empenhada_qty ?? a.empenhadaQty ?? 0),
    processo_sei_id: a.processo_sei_id || a.processoSeiId || null
  }));

  try {
    const { data, error } = await supabase.rpc('save_allocations_atomic', {
      p_item_key: canonicalKey,
      p_allocations: payloadRows,
      p_expected_version: expectedVersion ?? null
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_allocations_atomic'));
    }

    return data as RpcAllocationResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err; // Já é um AppMutationError
    }
    throw mapPostgresErrorToAppError(err);
  }
}
