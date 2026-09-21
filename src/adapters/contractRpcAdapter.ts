import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { RpcContratoPayload, RpcContratoResult } from '../types/rpc';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';

/**
 * Adapter de Persistência Transacional para Contratos e Vínculos via RPC save_manual_contrato_atomic
 */
export async function executeSaveContratoRpc(
  payload: RpcContratoPayload
): Promise<RpcContratoResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  const { contrato, empenhoIds } = payload;
  const rawItemKey = contrato.item_key || contrato.itemKey || '';
  const parsed = parseItemKey(rawItemKey);
  const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

  const contratoPayload = {
    id: contrato.id,
    item_key: canonicalKey,
    numero: contrato.numero.trim(),
    ano: Number(contrato.ano),
    arp_id: contrato.arp_id || contrato.arpId || parsed.numeroAta,
    item_id: contrato.item_id || contrato.itemId || parsed.itemNum,
    uasg: contrato.uasg || parsed.uasg,
    numero_controle_pncp: contrato.numero_controle_pncp || contrato.numeroControlePncp || null,
    link_pncp: contrato.link_pncp || contrato.linkPncp || null,
    fornecedor: contrato.fornecedor || null,
    cnpj_fornecedor: contrato.cnpj_fornecedor || contrato.cnpjFornecedor || null,
    objeto: contrato.objeto || null,
    quantidade_contratada: contrato.quantidade_contratada ?? contrato.quantidadeContratada ?? null,
    valor_total: contrato.valor_total ?? contrato.valorTotal ?? null,
    origem: contrato.origem || 'MANUAL'
  };

  try {
    const { data, error } = await supabase.rpc('save_manual_contrato_atomic', {
      p_contrato: contratoPayload,
      p_empenho_ids: empenhoIds
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_manual_contrato_atomic'));
    }

    return data as RpcContratoResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err;
    }
    throw mapPostgresErrorToAppError(err);
  }
}

/**
 * Adapter de Exclusão Transacional para Contratos Manuais via RPC delete_manual_contrato_atomic
 */
export async function executeDeleteContratoRpc(
  contratoId: string
): Promise<{ success: boolean; id: string; item_key: string; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  const cleanId = (contratoId || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID do contrato é obrigatório para exclusão.'));
  }

  try {
    const { data, error } = await supabase.rpc('delete_manual_contrato_atomic', {
      p_id: cleanId
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_manual_contrato_atomic'));
    }

    return data as { success: boolean; id: string; item_key: string; message: string };
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err;
    }
    throw mapPostgresErrorToAppError(err);
  }
}

