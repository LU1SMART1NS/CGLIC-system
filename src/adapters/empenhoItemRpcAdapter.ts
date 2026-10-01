import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }
  return supabase;
}

/** Um empenho do contrato no item, como a API o informou (quantidade nula = a API não trouxe a linha do item). */
export interface ItemContractEmpenhoInput {
  empenhoId: string;
  quantidade: number | null;
  quantidadeSugerida?: number | null;
  numeroItemMinuta?: string;
}

export interface SyncItemContractEmpenhosParams {
  itemKey: string;
  contractKey: string;
  empenhos: ItemContractEmpenhoInput[];
}

export interface RpcSyncItemContractEmpenhosResult {
  success: boolean;
  item_key: string;
  contract_key: string;
  sincronizados: number;
  removidos: number;
  pendentes: number;
  timestamp: string;
}

export interface ConfirmEmpenhoItemQuantityParams {
  itemKey: string;
  empenhoId: string;
  /** Nulo devolve o empenho ao estado pendente. */
  quantidade: number | null;
}

export interface RpcConfirmEmpenhoItemQuantityResult {
  success: boolean;
  item_key: string;
  empenho_id: string;
  quantidade_consumida: number | null;
  fonte_quantidade: 'USUARIO' | null;
  timestamp: string;
}

/**
 * Substitui o conjunto de empenhos do par (item, contrato) via RPC sync_item_contract_empenhos_atomic.
 * Lista vazia remove todos os empenhos que esse contrato trouxe para o item.
 */
export async function syncItemContractEmpenhosRpc(
  params: SyncItemContractEmpenhosParams
): Promise<RpcSyncItemContractEmpenhosResult> {
  const client = requireSupabase();

  const itemKey = (params.itemKey || '').trim();
  const contractKey = (params.contractKey || '').trim();
  if (!itemKey) throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do item (itemKey) é obrigatória.'));
  if (!contractKey) throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do contrato (contractKey) é obrigatória.'));

  const payload = params.empenhos.map((e) => {
    if (!(e.empenhoId || '').trim()) {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Empenho sem identificador.'));
    }
    if (e.quantidade != null && !(e.quantidade >= 0)) {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Quantidade de empenho inválida.'));
    }
    return {
      empenho_id: e.empenhoId,
      quantidade: e.quantidade ?? null,
      quantidade_sugerida: e.quantidadeSugerida ?? null,
      numero_item_minuta: e.numeroItemMinuta ?? null
    };
  });

  try {
    const { data, error } = await client.rpc('sync_item_contract_empenhos_atomic', {
      p_item_key: itemKey,
      p_contract_key: contractKey,
      p_empenhos: payload
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC sync_item_contract_empenhos_atomic'));
    }
    return data as RpcSyncItemContractEmpenhosResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

/**
 * Confirma (ou limpa) a quantidade de um empenho que a API não trouxe, via RPC confirm_empenho_item_quantity_atomic.
 */
export async function confirmEmpenhoItemQuantityRpc(
  params: ConfirmEmpenhoItemQuantityParams
): Promise<RpcConfirmEmpenhoItemQuantityResult> {
  const client = requireSupabase();

  const itemKey = (params.itemKey || '').trim();
  const empenhoId = (params.empenhoId || '').trim();
  if (!itemKey) throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do item (itemKey) é obrigatória.'));
  if (!empenhoId) throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O identificador do empenho é obrigatório.'));
  if (params.quantidade != null && !(params.quantidade > 0)) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A quantidade deve ser maior que zero.'));
  }

  try {
    const { data, error } = await client.rpc('confirm_empenho_item_quantity_atomic', {
      p_item_key: itemKey,
      p_empenho_id: empenhoId,
      p_quantidade: params.quantidade
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC confirm_empenho_item_quantity_atomic'));
    }
    return data as RpcConfirmEmpenhoItemQuantityResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}
