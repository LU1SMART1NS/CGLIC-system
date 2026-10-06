import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

/** Confirmação do coordenador de que o contrato não tem ata (public.contract_sem_ata_confirmacoes, migration 69). */
export interface ContratoSemAtaConfirmacao {
  contractKey: string;
  confirmadoPorNome?: string;
  confirmadoEm?: string;
}

/** Todas as confirmações, por chave do contrato. Sem a tabela (migration 69 não aplicada), devolve vazio. */
export async function fetchContratosSemAta(): Promise<Record<string, ContratoSemAtaConfirmacao>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const { data, error } = await supabase.from('contract_sem_ata_confirmacoes').select('*');
    if (error) throw error;
    const map: Record<string, ContratoSemAtaConfirmacao> = {};
    for (const row of data || []) {
      map[row.contract_key] = {
        contractKey: row.contract_key,
        confirmadoPorNome: row.confirmado_por_nome || undefined,
        confirmadoEm: row.created_at || undefined
      };
    }
    return map;
  } catch (err) {
    console.warn('Confirmações de contrato sem ata indisponíveis (migration 69 aplicada?)', err);
    return {};
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  }
  return supabase;
}

export async function confirmarContratoSemAta(contractKey: string) {
  const { error } = await requireSupabase().rpc('confirm_contract_sem_ata', { p_contract_key: contractKey });
  if (error) throw mapPostgresErrorToAppError(error);
}

export async function desfazerContratoSemAta(contractKey: string) {
  const { error } = await requireSupabase().rpc('clear_contract_sem_ata', { p_contract_key: contractKey });
  if (error) throw mapPostgresErrorToAppError(error);
}
