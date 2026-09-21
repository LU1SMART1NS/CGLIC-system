import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { 
  RpcDepartmentResult, 
  RpcDeleteDepartmentResult, 
  RpcMergeDepartmentResult 
} from '../types/rpc';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';

export interface DepartmentInput {
  id?: string;
  sigla: string;
  nomeCompleto: string;
  descricao?: string;
  ativo?: boolean;
}

/**
 * Adapter de Persistência Transacional para Departamentos via RPC save_internal_department_atomic (SaldoARP 3.0)
 */
export async function saveDepartmentRpc(input: DepartmentInput): Promise<RpcDepartmentResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  const cleanSigla = (input.sigla || '').trim().toUpperCase();
  const cleanNome = (input.nomeCompleto || '').trim();

  if (!cleanSigla) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A sigla da unidade é obrigatória.'));
  }

  if (!cleanNome) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome completo da unidade é obrigatório.'));
  }

  try {
    const { data, error } = await supabase.rpc('save_internal_department_atomic', {
      p_id: input.id ? input.id.trim() : null,
      p_sigla: cleanSigla,
      p_nome_completo: cleanNome,
      p_descricao: input.descricao ? input.descricao.trim() : null,
      p_ativo: input.ativo !== undefined ? Boolean(input.ativo) : true
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_internal_department_atomic'));
    }

    return data as RpcDepartmentResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err;
    }
    throw mapPostgresErrorToAppError(err);
  }
}

/**
 * Adapter de Exclusão / Desativação Segura via RPC delete_internal_department_atomic (SaldoARP 3.0)
 */
export async function deleteDepartmentRpc(
  id: string, 
  forceDeactivate = false
): Promise<RpcDeleteDepartmentResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O identificador da unidade é obrigatório.'));
  }

  try {
    const { data, error } = await supabase.rpc('delete_internal_department_atomic', {
      p_id: cleanId,
      p_force_deactivate: Boolean(forceDeactivate)
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_internal_department_atomic'));
    }

    return data as RpcDeleteDepartmentResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err;
    }
    throw mapPostgresErrorToAppError(err);
  }
}

/**
 * Adapter de Saneamento / Mesclagem Administrativa via RPC merge_internal_department_allocations_atomic (SaldoARP 3.0)
 */
export async function mergeDepartmentAllocationsRpc(
  oldName: string, 
  targetSigla: string
): Promise<RpcMergeDepartmentResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }

  const cleanOld = (oldName || '').trim();
  const cleanTarget = (targetSigla || '').trim().toUpperCase();

  if (!cleanOld) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome antigo da unidade é obrigatório.'));
  }

  if (!cleanTarget) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A sigla de destino da unidade é obrigatória.'));
  }

  try {
    const { data, error } = await supabase.rpc('merge_internal_department_allocations_atomic', {
      p_old_name: cleanOld,
      p_target_sigla: cleanTarget
    });

    if (error) {
      throw mapPostgresErrorToAppError(error);
    }

    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC merge_internal_department_allocations_atomic'));
    }

    return data as RpcMergeDepartmentResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') {
      throw err;
    }
    throw mapPostgresErrorToAppError(err);
  }
}
