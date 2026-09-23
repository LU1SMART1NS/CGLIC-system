import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type {
  RpcContractManagerResult,
  RpcContractTaskTemplateResult,
  RpcDeleteContractTaskTemplateResult,
  RpcContractTaskTemplateMacrotaskResult,
  RpcContractTaskTemplateTaskResult,
  RpcGenericDeleteResult,
  RpcApplyContractTaskTemplateResult,
  RpcUpdateContractTaskResult,
  ContractTaskStatus
} from '../types/rpc';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }
  return supabase;
}

export interface ContractManagerInput {
  uasg: string;
  numero: string;
  ano: number;
  gestorNome: string;
}

/**
 * Adapter de Persistência Transacional para o Gestor do Contrato via RPC save_contract_manager_atomic (SaldoARP 3.0)
 */
export async function saveContractManagerRpc(input: ContractManagerInput): Promise<RpcContractManagerResult> {
  const client = requireSupabase();

  const cleanGestor = (input.gestorNome || '').trim();
  if (!cleanGestor) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome do gestor é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('save_contract_manager_atomic', {
      p_uasg: (input.uasg || '').trim(),
      p_numero: (input.numero || '').trim(),
      p_ano: input.ano,
      p_gestor_nome: cleanGestor
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_contract_manager_atomic'));
    }
    return data as RpcContractManagerResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface ContractTaskTemplateInput {
  id?: string;
  nome: string;
  descricao?: string;
  ativo?: boolean;
}

export async function saveContractTaskTemplateRpc(input: ContractTaskTemplateInput): Promise<RpcContractTaskTemplateResult> {
  const client = requireSupabase();

  const cleanNome = (input.nome || '').trim();
  if (!cleanNome) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome do template é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('save_contract_task_template_atomic', {
      p_id: input.id ? input.id.trim() : null,
      p_nome: cleanNome,
      p_descricao: input.descricao ? input.descricao.trim() : null,
      p_ativo: input.ativo ?? true
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_contract_task_template_atomic'));
    }
    return data as RpcContractTaskTemplateResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export async function deleteContractTaskTemplateRpc(id: string): Promise<RpcDeleteContractTaskTemplateResult> {
  const client = requireSupabase();

  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID do template é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('delete_contract_task_template_atomic', { p_id: cleanId });
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_contract_task_template_atomic'));
    }
    return data as RpcDeleteContractTaskTemplateResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface ContractTaskTemplateMacrotaskInput {
  id?: string;
  templateId?: string;
  nome: string;
  ordem?: number;
}

export async function saveContractTaskTemplateMacrotaskRpc(
  input: ContractTaskTemplateMacrotaskInput
): Promise<RpcContractTaskTemplateMacrotaskResult> {
  const client = requireSupabase();

  const cleanNome = (input.nome || '').trim();
  if (!cleanNome) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome da macrotarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('save_contract_task_template_macrotask_atomic', {
      p_id: input.id ? input.id.trim() : null,
      p_template_id: input.templateId ? input.templateId.trim() : null,
      p_nome: cleanNome,
      p_ordem: input.ordem ?? 0
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_contract_task_template_macrotask_atomic'));
    }
    return data as RpcContractTaskTemplateMacrotaskResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export async function deleteContractTaskTemplateMacrotaskRpc(id: string): Promise<RpcGenericDeleteResult> {
  const client = requireSupabase();

  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID da macrotarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('delete_contract_task_template_macrotask_atomic', { p_id: cleanId });
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_contract_task_template_macrotask_atomic'));
    }
    return data as RpcGenericDeleteResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface ContractTaskTemplateTaskInput {
  id?: string;
  macrotaskId?: string;
  nome: string;
  ordem?: number;
}

export async function saveContractTaskTemplateTaskRpc(
  input: ContractTaskTemplateTaskInput
): Promise<RpcContractTaskTemplateTaskResult> {
  const client = requireSupabase();

  const cleanNome = (input.nome || '').trim();
  if (!cleanNome) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome da tarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('save_contract_task_template_task_atomic', {
      p_id: input.id ? input.id.trim() : null,
      p_macrotask_id: input.macrotaskId ? input.macrotaskId.trim() : null,
      p_nome: cleanNome,
      p_ordem: input.ordem ?? 0
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_contract_task_template_task_atomic'));
    }
    return data as RpcContractTaskTemplateTaskResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export async function deleteContractTaskTemplateTaskRpc(id: string): Promise<RpcGenericDeleteResult> {
  const client = requireSupabase();

  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID da tarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('delete_contract_task_template_task_atomic', { p_id: cleanId });
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_contract_task_template_task_atomic'));
    }
    return data as RpcGenericDeleteResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface ApplyContractTaskTemplateInput {
  uasg: string;
  numero: string;
  ano: number;
  templateId: string;
}

export async function applyContractTaskTemplateRpc(
  input: ApplyContractTaskTemplateInput
): Promise<RpcApplyContractTaskTemplateResult> {
  const client = requireSupabase();

  const cleanTemplateId = (input.templateId || '').trim();
  if (!cleanTemplateId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O template selecionado é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('apply_contract_task_template_atomic', {
      p_uasg: (input.uasg || '').trim(),
      p_numero: (input.numero || '').trim(),
      p_ano: input.ano,
      p_template_id: cleanTemplateId
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC apply_contract_task_template_atomic'));
    }
    return data as RpcApplyContractTaskTemplateResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface UpdateContractTaskInput {
  taskId: string;
  status?: ContractTaskStatus;
  responsavelNome?: string;
  prazo?: string | null;
  observacao?: string | null;
  concluidoPor?: string;
}

export async function updateContractTaskRpc(input: UpdateContractTaskInput): Promise<RpcUpdateContractTaskResult> {
  const client = requireSupabase();

  const cleanTaskId = (input.taskId || '').trim();
  if (!cleanTaskId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID da tarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('update_contract_task_atomic', {
      p_task_id: cleanTaskId,
      p_status: input.status ?? null,
      p_responsavel_nome: input.responsavelNome ? input.responsavelNome.trim() : null,
      p_prazo: input.prazo ?? null,
      p_observacao: input.observacao ?? null,
      p_concluido_por: input.concluidoPor ? input.concluidoPor.trim() : null
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC update_contract_task_atomic'));
    }
    return data as RpcUpdateContractTaskResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}
