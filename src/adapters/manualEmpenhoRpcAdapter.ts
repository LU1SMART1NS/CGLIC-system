import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { Empenho } from '../types';
import type { RpcManualEmpenhoItem, RpcManualEmpenhoResult } from '../types/rpc';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';

/**
 * Adapter de Persistência Transacional para Empenhos Manuais via RPC save_manual_empenhos_atomic (SaldoARP 3.0)
 */
export async function executeSaveManualEmpenhosRpc(
  itemKey: string,
  empenhos: Empenho[] | RpcManualEmpenhoItem[],
  expectedVersion: number
): Promise<RpcManualEmpenhoResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  // 1. Assegura a canonicalização da chave
  const parsed = parseItemKey(itemKey);
  const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

  // 2. Prepara o payload estruturado para a RPC
  const payloadRows = empenhos.map((e: any) => ({
    id: e.id || undefined,
    numero: (e.numero || '').trim().toUpperCase(),
    ano: Number(e.ano),
    arp_id: (e.arp_id || e.arpId || parsed.numeroAta || '').trim(),
    item_id: (e.item_id || e.itemId || parsed.itemNum || '').trim(),
    uasg: (e.uasg || parsed.uasg || '').trim(),
    quantidade: Number(e.quantidade),
    valor_unitario: e.valor_unitario !== undefined && e.valor_unitario !== null
      ? Number(e.valor_unitario)
      : (e.valorUnitario !== undefined && e.valorUnitario !== null ? Number(e.valorUnitario) : null),
    valor_total: e.valor_total !== undefined && e.valor_total !== null
      ? Number(e.valor_total)
      : (e.valorTotal !== undefined && e.valorTotal !== null ? Number(e.valorTotal) : null),
    data: e.data ? String(e.data).trim() : null,
    fornecedor: e.fornecedor ? String(e.fornecedor).trim() : null,
    cnpj_fornecedor: e.cnpj_fornecedor || e.cnpjFornecedor ? String(e.cnpj_fornecedor || e.cnpjFornecedor).trim() : null,
    unidade_interna_id: e.unidade_interna_id || e.unidadeInternaId ? String(e.unidade_interna_id || e.unidadeInternaId).trim() : null,
    observacao: e.observacao ? String(e.observacao).trim() : null,
    origem: e.origem || 'MANUAL',
    status: e.status || 'CONFIRMADO'
  }));

  try {
    const { data, error } = await supabase.rpc('save_manual_empenhos_atomic', {
      p_item_key: canonicalKey,
      p_empenhos: payloadRows,
      p_expected_version: expectedVersion
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_manual_empenhos_atomic'));
    }

    return data as RpcManualEmpenhoResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err; // Já é um AppMutationError
    }
    throw mapPostgresErrorToAppError(err);
  }
}
