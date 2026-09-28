import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import type { AtaManager } from '../types';
import type { RpcAtaManagerResult } from '../types/rpc';

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  }
  return supabase;
}

/**
 * Busca o Gestor de uma Ata específica. Retorna null se ainda não houver gestor atribuído.
 */
export async function fetchAtaManager(ataKey: string): Promise<AtaManager | null> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('ata_managers')
    .select('*')
    .eq('ata_key', ataKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ataKey: data.ata_key,
    gestorNome: data.gestor_nome,
    gestorUserId: data.gestor_user_id || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/**
 * Busca todos os Gestores de Ata cadastrados, retornando um mapa indexado por ata_key.
 */
export async function fetchAllAtaManagers(): Promise<Record<string, AtaManager>> {
  if (!isSupabaseConfigured || !supabase) return {};

  try {
    const { data, error } = await supabase.from('ata_managers').select('*');
    if (error) throw error;
    if (!data || !Array.isArray(data)) return {};

    const map: Record<string, AtaManager> = {};
    for (const item of data) {
      if (item.ata_key) {
        map[item.ata_key] = {
          ataKey: item.ata_key,
          gestorNome: item.gestor_nome,
          gestorUserId: item.gestor_user_id || undefined,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        };
      }
    }
    return map;
  } catch (err) {
    console.warn('Erro ao carregar gestores de Ata', err);
    return {};
  }
}

export interface AtaManagerInput {
  ataKey: string;
  gestorNome: string;
  /** Identidade canônica do gestor selecionado da lista de servidores — ponte para auth.users. */
  gestorUserId?: string | null;
}

/**
 * Adapter de Persistência Transacional para o Gestor da Ata via RPC save_ata_manager_atomic.
 */
export async function saveAtaManagerRpc(input: AtaManagerInput): Promise<RpcAtaManagerResult> {
  const client = requireSupabase();

  const cleanAtaKey = (input.ataKey || '').trim();
  const cleanGestor = (input.gestorNome || '').trim();
  if (!cleanAtaKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O número da Ata é obrigatório.'));
  }
  if (!cleanGestor) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome do gestor é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('save_ata_manager_atomic', {
      p_ata_key: cleanAtaKey,
      p_gestor_nome: cleanGestor,
      p_gestor_user_id: input.gestorUserId ?? null
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_ata_manager_atomic'));
    }
    return data as RpcAtaManagerResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}
