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
  quantidade_contratada: number;
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
  if (typeof params.quantidadeContratada !== 'number' || params.quantidadeContratada <= 0) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A quantidade contratada deve ser estritamente maior que zero.'));
  }

  try {
    const { data, error } = await client.rpc('link_contract_to_item_atomic', {
      p_item_key: cleanItemKey,
      p_contract_key: cleanContractKey,
      p_quantidade_contratada: params.quantidadeContratada,
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
  links: Array<{ id: string; item_key: string; quantidade_contratada: number }>;
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
  if (!Array.isArray(params.links) || params.links.length === 0) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Informe ao menos um item para vincular.'));
  }

  const observacoes = params.observacoes?.trim() || null;
  const payload = params.links.map((l) => {
    const itemKey = (l.itemKey || '').trim();
    if (!itemKey) {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do item (itemKey) é obrigatória.'));
    }
    if (typeof l.quantidadeContratada !== 'number' || !(l.quantidadeContratada > 0)) {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A quantidade contratada deve ser estritamente maior que zero.'));
    }
    return { item_key: itemKey, quantidade_contratada: l.quantidadeContratada, observacoes };
  });

  try {
    const { data, error } = await client.rpc('link_contract_to_items_atomic', {
      p_contract_key: cleanContractKey,
      p_links: payload
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
