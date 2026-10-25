import { supabase, isSupabaseConfigured } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';
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

/** Todos os descartes. Falha de leitura vira erro (a tela avisa). */
export async function fetchDescartesAtaContrato(): Promise<Record<string, DescarteAtaContrato>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const db = supabase;
    const data = await lerTodasAsPaginas<any>((de, ate) =>
      db.from('contract_ata_descartes').select('*').order('contract_key').order('ata_key').range(de, ate)
    );
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
    // Falha vira erro: um mapa vazio fazia as atas descartadas voltarem como sugestão.
    console.warn('Descartes de ata indisponíveis', err);
    throw err;
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
