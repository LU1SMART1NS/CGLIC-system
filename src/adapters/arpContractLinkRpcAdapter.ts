import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { LinkContractToItemParams, LinkContractToItemsParams, DismissContractSuggestionParams } from '../types/arpContractLinks';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }
  return supabase;
}

export interface RpcLinkContractToItemResult {
  success: boolean;
  id: string;
  item_key: string;
  contract_key: string;
  timestamp: string;
}

export interface RpcUnlinkContractFromItemResult {
  success: boolean;
  id: string;
  timestamp: string;
}

/**
 * Adapter RPC para vincular um contrato oficial a um item da ARP via RPC link_contract_to_item_atomic.
 */
export async function linkContractToItemRpc(
  params: LinkContractToItemParams
): Promise<RpcLinkContractToItemResult> {
  const client = requireSupabase();

  const cleanItemKey = (params.itemKey || '').trim();
  const cleanContractKey = (params.contractKey || '').trim();

  if (!cleanItemKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do item (itemKey) é obrigatória.'));
  }
  if (!cleanContractKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do contrato (contractKey) é obrigatória.'));
  }

  try {
    const { data, error } = await client.rpc('link_contract_to_item_atomic', {
      p_item_key: cleanItemKey,
      p_contract_key: cleanContractKey,
      p_observacoes: params.observacoes?.trim() || null
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC link_contract_to_item_atomic'));
    }

    return data as RpcLinkContractToItemResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

/**
 * Adapter RPC para desvincular um contrato de um item da ARP via RPC unlink_contract_from_item_atomic.
 */
export async function unlinkContractFromItemRpc(
  linkId: string
): Promise<RpcUnlinkContractFromItemResult> {
  const client = requireSupabase();

  const cleanId = (linkId || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O identificador do vínculo é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('unlink_contract_from_item_atomic', {
      p_link_id: cleanId
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC unlink_contract_from_item_atomic'));
    }

    return data as RpcUnlinkContractFromItemResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface RpcContractSuggestionDismissalResult {
  success: boolean;
  item_key: string;
  contract_key: string;
  timestamp: string;
}

async function callSuggestionDismissalRpc(
  rpcName: 'dismiss_contract_suggestion_atomic' | 'restore_contract_suggestion_atomic',
  params: DismissContractSuggestionParams
): Promise<RpcContractSuggestionDismissalResult> {
  const client = requireSupabase();

  const cleanItemKey = (params.itemKey || '').trim();
  const cleanContractKey = (params.contractKey || '').trim();

  if (!cleanItemKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do item (itemKey) é obrigatória.'));
  }
  if (!cleanContractKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do contrato (contractKey) é obrigatória.'));
  }

  try {
    const { data, error } = await client.rpc(rpcName, {
      p_item_key: cleanItemKey,
      p_contract_key: cleanContractKey
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error(`INVALID_PAYLOAD: Resposta inválida da RPC ${rpcName}`));
    }

    return data as RpcContractSuggestionDismissalResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

/**
 * Adapter RPC para descartar a sugestão de um contrato para um item da ARP.
 */
export function dismissContractSuggestionRpc(params: DismissContractSuggestionParams) {
  return callSuggestionDismissalRpc('dismiss_contract_suggestion_atomic', params);
}

/**
 * Adapter RPC para restaurar uma sugestão de contrato descartada.
 */
export function restoreContractSuggestionRpc(params: DismissContractSuggestionParams) {
  return callSuggestionDismissalRpc('restore_contract_suggestion_atomic', params);
}

export interface RpcLinkContractToItemsResult {
  success: boolean;
  contract_key: string;
  count: number;
  timestamp: string;
}

/**
 * Adapter RPC para vincular um contrato a vários itens da ARP numa só transação
 * via RPC link_contract_to_items_atomic.
 */
export async function linkContractToItemsRpc(
  params: LinkContractToItemsParams
): Promise<RpcLinkContractToItemsResult> {
  const client = requireSupabase();

  const cleanContractKey = (params.contractKey || '').trim();
  if (!cleanContractKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do contrato (contractKey) é obrigatória.'));
  }
  if (!Array.isArray(params.itemKeys) || params.itemKeys.length === 0) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Informe ao menos um item para vincular.'));
  }

  const itemKeys = params.itemKeys.map((k) => (k || '').trim());
  if (itemKeys.some((k) => !k)) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do item (itemKey) é obrigatória.'));
  }

  try {
    const { data, error } = await client.rpc('link_contract_to_items_atomic', {
      p_contract_key: cleanContractKey,
      p_item_keys: itemKeys,
      p_observacoes: params.observacoes?.trim() || null
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC link_contract_to_items_atomic'));
    }

    return data as RpcLinkContractToItemsResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface SyncContractItemQuantityParams {
  itemKey: string;
  contractKey: string;
  /** Quantidade do item no contrato segundo a API; nulo = a API foi lida e não listou o item. */
  quantidade: number | null;
  valorUnitario?: number | null;
}

export interface RpcSyncContractItemQuantityResult {
  success: boolean;
  id: string;
  item_key: string;
  contract_key: string;
  quantidade_contratada: number | null;
  valor_unitario: number | null;
  timestamp: string;
}

/**
 * Grava a cópia da quantidade contratada lida da API para o vínculo (item, contrato)
 * via RPC sync_contract_item_quantity_atomic.
 */
export async function syncContractItemQuantityRpc(
  params: SyncContractItemQuantityParams
): Promise<RpcSyncContractItemQuantityResult> {
  const client = requireSupabase();

  const itemKey = (params.itemKey || '').trim();
  const contractKey = (params.contractKey || '').trim();
  if (!itemKey) throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do item (itemKey) é obrigatória.'));
  if (!contractKey) throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do contrato (contractKey) é obrigatória.'));
  if (params.quantidade != null && !(params.quantidade >= 0)) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A quantidade contratada não pode ser negativa.'));
  }

  try {
    const { data, error } = await client.rpc('sync_contract_item_quantity_atomic', {
      p_item_key: itemKey,
      p_contract_key: contractKey,
      p_quantidade: params.quantidade,
      p_valor_unitario: params.valorUnitario ?? null
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC sync_contract_item_quantity_atomic'));
    }
    return data as RpcSyncContractItemQuantityResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}
