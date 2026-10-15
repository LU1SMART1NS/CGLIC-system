import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import type { NivelGestor, NivelRegistrado } from '../components/atas/distribuicao/nivelGestor';

/** Mudança de nível registrada (public.gestor_niveis_historico, migration 140). */
export interface NivelHistorico {
  nivelAnterior: NivelGestor | null;
  nivel: NivelGestor;
  motivo: string;
  definidoPorNome?: string;
  criadoEm: string;
}

/**
 * Nível de cada servidor, por user_id (tabela pequena: um por servidor). Só admin e leitor leem (RLS). Sem a tabela
 * (migration 140 ainda não aplicada) ou com erro, devolve vazio: a Central segue com a capacidade padrão.
 */
export async function fetchGestorNiveis(): Promise<Record<string, NivelRegistrado>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const { data, error } = await supabase.from('gestor_niveis').select('user_id, nivel, desde, motivo, definido_por_nome');
    if (error) throw error;
    const map: Record<string, NivelRegistrado> = {};
    for (const row of data || []) {
      map[row.user_id] = {
        userId: row.user_id,
        nivel: row.nivel,
        desde: row.desde,
        motivo: row.motivo,
        definidoPorNome: row.definido_por_nome || undefined
      };
    }
    return map;
  } catch (err) {
    console.warn('Níveis dos gestores indisponíveis (migration 140 aplicada?)', err);
    return {};
  }
}

/** Histórico de níveis de um servidor, o mais recente primeiro. */
export async function fetchGestorNivelHistorico(userId: string): Promise<NivelHistorico[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('gestor_niveis_historico')
    .select('nivel_anterior, nivel, motivo, definido_por_nome, criado_em')
    .eq('user_id', userId)
    .order('criado_em', { ascending: false })
    .limit(20);
  if (error) throw mapPostgresErrorToAppError(error);
  return (data || []).map((row) => ({
    nivelAnterior: row.nivel_anterior,
    nivel: row.nivel,
    motivo: row.motivo,
    definidoPorNome: row.definido_por_nome || undefined,
    criadoEm: row.criado_em
  }));
}

/** Grava o nível — só admin; motivo obrigatório (RPC set_gestor_nivel). */
export async function salvarGestorNivel(input: { userId: string; nivel: NivelGestor; motivo: string }) {
  if (!isSupabaseConfigured || !supabase) throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  const motivo = (input.motivo || '').trim();
  if (!motivo) throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Informe o motivo.'));
  const { error } = await supabase.rpc('set_gestor_nivel', { p_user_id: input.userId, p_nivel: input.nivel, p_motivo: motivo });
  if (error) throw mapPostgresErrorToAppError(error);
}
