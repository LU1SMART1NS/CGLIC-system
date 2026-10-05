import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

/**
 * Ata descartada para um contrato (public.contract_ata_descartes, migration 71): "esta ata não é a do contrato".
 * A chave da ata é "NÚMERO-UASG" (ex.: "00059/2025-200331").
 */
export interface DescarteAtaContrato {
  contractKey: string;
  ataKey: string;
  descartadoPorNome?: string;
  descartadoEm?: string;
}

export const chaveDescarte = (contractKey: string, ataKey: string) => `${contractKey}|${ataKey}`;

/** Todos os descartes. Sem a tabela (migration 71 não aplicada), devolve vazio e a Central segue sem descartes. */
export async function fetchDescartesAtaContrato(): Promise<Record<string, DescarteAtaContrato>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const { data, error } = await supabase.from('contract_ata_descartes').select('*');
    if (error) throw error;
    const map: Record<string, DescarteAtaContrato> = {};
    for (const row of data || []) {
      map[chaveDescarte(row.contract_key, row.ata_key)] = {
        contractKey: row.contract_key,
        ataKey: row.ata_key,
        descartadoPorNome: row.descartado_por_nome || undefined,
        descartadoEm: row.created_at || undefined
      };
    }
    return map;
  } catch (err) {
    console.warn('Descartes de ata indisponíveis (migration 71 aplicada?)', err);
    return {};
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  }
  return supabase;
}

export async function descartarAtaDoContrato(input: { contractKey: string; ataKey: string }) {
  const { error } = await requireSupabase().rpc('descartar_ata_do_contrato', { p_contract_key: input.contractKey, p_ata_key: input.ataKey });
  if (error) throw mapPostgresErrorToAppError(error);
}

export async function restaurarAtaDoContrato(input: { contractKey: string; ataKey: string }) {
  const { error } = await requireSupabase().rpc('restaurar_ata_do_contrato', { p_contract_key: input.contractKey, p_ata_key: input.ataKey });
  if (error) throw mapPostgresErrorToAppError(error);
}
