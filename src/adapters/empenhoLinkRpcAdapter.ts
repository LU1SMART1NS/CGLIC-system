import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { RpcEmpenhoLinkItem, RpcEmpenhoLinkResult } from '../types/rpc';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';

/**
 * Adapter de Persistência Transacional para Vínculos de Empenhos via RPC save_empenho_links_atomic
 */
export async function executeSaveEmpenhoLinksRpc(
  itemKey: string,
  links: Record<string, string> | RpcEmpenhoLinkItem[],
  expectedVersion: number
): Promise<RpcEmpenhoLinkResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  // 1. Assegura a canonicalização da chave
  const parsed = parseItemKey(itemKey);
  const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

  // 2. Prepara o payload estruturado para a RPC (array de { empenho_numero, allocation_id })
  let payloadRows: { empenho_numero: string; allocation_id: string }[] = [];

  if (Array.isArray(links)) {
    payloadRows = links.map(l => ({
      empenho_numero: (l.empenho_numero || l.empenhoNumero || '').trim(),
      allocation_id: (l.allocation_id || l.allocationId || '').trim()
    }));
  } else if (links && typeof links === 'object') {
    payloadRows = Object.entries(links).map(([empenho_numero, allocation_id]) => ({
      empenho_numero: empenho_numero.trim(),
      allocation_id: (allocation_id || '').trim()
    }));
  }

  try {
    const { data, error } = await supabase.rpc('save_empenho_links_atomic', {
      p_item_key: canonicalKey,
      p_links: payloadRows,
      p_expected_version: expectedVersion
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_empenho_links_atomic'));
    }

    return data as RpcEmpenhoLinkResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err; // Já é um AppMutationError
    }
    throw mapPostgresErrorToAppError(err);
  }
}
