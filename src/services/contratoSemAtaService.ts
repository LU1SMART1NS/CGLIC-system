import { supabase, isSupabaseConfigured } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

/** Confirmação do coordenador de que o contrato não tem ata (public.contract_sem_ata_confirmacoes, migration 69). */
export interface ContratoSemAtaConfirmacao {
  contractKey: string;
  confirmadoPorNome?: string;
  confirmadoEm?: string;
}

/** Todas as confirmações, por chave do contrato. Falha de leitura vira erro (a tela avisa). */
export async function fetchContratosSemAta(): Promise<Record<string, ContratoSemAtaConfirmacao>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const db = supabase;
    const data = await lerTodasAsPaginas<any>((de, ate) => db.from('contract_sem_ata_confirmacoes').select('*').order('contract_key').range(de, ate));
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
    // Falha vira erro: um mapa vazio devolvia à fila os contratos já marcados "não pertence a ata".
    console.warn('Confirmações de contrato sem ata indisponíveis', err);
    throw err;
  }
}

/** Marca "não pertence a ata" desfeita pelo coordenador (public.contract_sem_ata_desfeitos, migration 152). */
export interface MarcaSemAtaDesfeita {
  contractKey: string;
  desfeitoPorNome?: string;
  desfeitoEm?: string;
}

/**
 * Contratos cuja marca foi desfeita: voltam à fila de Vínculos, mesmo com gestor, até o coordenador decidir de novo
 * (vincular a uma ata ou marcar outra vez). Falha de leitura vira erro (a tela avisa).
 */
export async function fetchMarcasSemAtaDesfeitas(): Promise<Record<string, MarcaSemAtaDesfeita>> {
  if (!isSupabaseConfigured || !supabase) return {};
  const db = supabase;
  const data = await lerTodasAsPaginas<any>((de, ate) => db.from('contract_sem_ata_desfeitos').select('*').order('contract_key').range(de, ate));
  const map: Record<string, MarcaSemAtaDesfeita> = {};
  for (const row of data || []) {
    map[row.contract_key] = {
      contractKey: row.contract_key,
      desfeitoPorNome: row.desfeito_por_nome || undefined,
      desfeitoEm: row.created_at || undefined
    };
  }
  return map;
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
