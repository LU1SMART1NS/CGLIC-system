import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { RpcProcessoSeiResult, RpcDeleteProcessoSeiResult } from '../types/rpc';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';

export interface ProcessoSeiInput {
  id?: string;
  numeroProcessoSei: string;
  descricaoObjeto?: string;
  unidadeRequisitante?: string;
  responsavelNome?: string;
  statusProcesso?: 'Em Instrução' | 'Aprovado' | 'Empenhado' | 'Concluído' | string;
}

/**
 * Adapter de Persistência Transacional para Processos SEI via RPC save_processo_sei_atomic (SaldoARP 3.0)
 */
export async function saveProcessoSeiRpc(input: ProcessoSeiInput): Promise<RpcProcessoSeiResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  const cleanNumero = (input.numeroProcessoSei || '').trim();
  if (!cleanNumero) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O número do processo SEI é obrigatório.'));
  }

  try {
    const { data, error } = await supabase.rpc('save_processo_sei_atomic', {
      p_id: input.id ? input.id.trim() : null,
      p_numero_processo_sei: cleanNumero,
      p_descricao_objeto: input.descricaoObjeto ? input.descricaoObjeto.trim() : null,
      p_unidade_requisitante: input.unidadeRequisitante ? input.unidadeRequisitante.trim() : null,
      p_responsavel_nome: input.responsavelNome ? input.responsavelNome.trim() : null,
      p_status_processo: input.statusProcesso || 'Em Instrução'
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_processo_sei_atomic'));
    }

    return data as RpcProcessoSeiResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err;
    }
    throw mapPostgresErrorToAppError(err);
  }
}

/**
 * Adapter de Exclusão Atômica para Processos SEI via RPC delete_processo_sei_atomic (SaldoARP 3.0)
 */
export async function deleteProcessoSeiRpc(id: string): Promise<RpcDeleteProcessoSeiResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O identificador do processo SEI é obrigatório.'));
  }

  try {
    const { data, error } = await supabase.rpc('delete_processo_sei_atomic', {
      p_id: cleanId
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_processo_sei_atomic'));
    }

    return data as RpcDeleteProcessoSeiResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err;
    }
    throw mapPostgresErrorToAppError(err);
  }
}
