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
  RpcStartTaskPlanResult,
  RpcTaskPlanMacrotaskResult,
  RpcCreateTaskResult,
  ContractTaskStatus
} from '../types/rpc';
import type { TaskExecutionMode } from '../types';
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
  /** Identidade canônica do gestor selecionado da lista de servidores — ponte para auth.users. */
  gestorUserId?: string | null;
}

/**
 * Adapter de Persistência Transacional para o Gestor do Contrato via RPC save_contract_manager_atomic (CGLIC 3.0)
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
      p_gestor_nome: cleanGestor,
      p_gestor_user_id: input.gestorUserId ?? null
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
  /** Semântica de execução canônica (Fase 10-A.2) — INTERNA/EXTERNA/AUTOMATICA/CONFIRMACAO. */
  executionMode?: TaskExecutionMode;
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
      p_ordem: input.ordem ?? 0,
      p_execution_mode: input.executionMode ?? null
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
  /** Nome do módulo; vazio = nome do modelo. */
  moduloNome?: string;
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
      p_template_id: cleanTemplateId,
      p_modulo_nome: (input.moduloNome || '').trim() || null
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
  /** Identidade canônica do responsável (Fase 10-A.2) — opcional, ponte para auth.users. */
  responsavelUserId?: string;
  prazo?: string | null;
  observacao?: string | null;
  concluidoPor?: string;
  /** Renomeia a tarefa (tarefas do plano são editáveis pelo gestor). */
  nome?: string;
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
      // undefined mantém o valor; string vazia limpa (volta a herdar o gestor do contrato).
      p_responsavel_nome: input.responsavelNome !== undefined ? input.responsavelNome.trim() : null,
      p_prazo: input.prazo ?? null,
      p_observacao: input.observacao ?? null,
      p_concluido_por: input.concluidoPor ? input.concluidoPor.trim() : null,
      p_responsavel_user_id: input.responsavelUserId ?? null,
      p_nome: input.nome !== undefined ? input.nome.trim() : null
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

// -------------------------------------------------------------
// Plano de gestão editável pelo gestor (criar/renomear/excluir etapas e tarefas)
// -------------------------------------------------------------
async function callPlanRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const client = requireSupabase();
  try {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error(`INVALID_PAYLOAD: Resposta inválida da RPC ${fn}`));
    }
    return data as T;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

function requireField(value: string | undefined, message: string): string {
  const clean = (value || '').trim();
  if (!clean) throw mapPostgresErrorToAppError(new Error(`INVALID_PAYLOAD: ${message}`));
  return clean;
}

export interface StartContractTaskPlanInput {
  uasg: string;
  numero: string;
  ano: number;
}

export async function startContractTaskPlanRpc(input: StartContractTaskPlanInput): Promise<RpcStartTaskPlanResult> {
  return callPlanRpc<RpcStartTaskPlanResult>('start_contract_task_plan_atomic', {
    p_uasg: (input.uasg || '').trim(),
    p_numero: (input.numero || '').trim(),
    p_ano: input.ano
  });
}

export interface SaveContractTaskMacrotaskInput {
  id?: string;
  planId?: string;
  nome: string;
}

export async function saveContractTaskMacrotaskRpc(input: SaveContractTaskMacrotaskInput): Promise<RpcTaskPlanMacrotaskResult> {
  return callPlanRpc<RpcTaskPlanMacrotaskResult>('save_contract_task_macrotask_atomic', {
    p_id: input.id ? input.id.trim() : null,
    p_plan_id: input.planId ? input.planId.trim() : null,
    p_nome: requireField(input.nome, 'O nome da etapa é obrigatório.')
  });
}

export async function deleteContractTaskMacrotaskRpc(id: string): Promise<RpcGenericDeleteResult> {
  return callPlanRpc<RpcGenericDeleteResult>('delete_contract_task_macrotask_atomic', {
    p_id: requireField(id, 'O ID da etapa é obrigatório.')
  });
}

export interface DeleteTaskPlanModuleInput {
  planId: string;
  moduloId: string;
}

export async function deleteContractTaskModuleRpc(input: DeleteTaskPlanModuleInput): Promise<RpcGenericDeleteResult> {
  return callPlanRpc<RpcGenericDeleteResult>('delete_contract_task_module_atomic', {
    p_plan_id: requireField(input.planId, 'O plano é obrigatório.'),
    p_modulo_id: requireField(input.moduloId, 'O módulo é obrigatório.')
  });
}

export interface RenameTaskPlanModuleInput {
  planId: string;
  moduloId: string;
  nome: string;
}

export async function renameContractTaskModuleRpc(input: RenameTaskPlanModuleInput): Promise<RpcGenericDeleteResult> {
  return callPlanRpc<RpcGenericDeleteResult>('rename_contract_task_module_atomic', {
    p_plan_id: requireField(input.planId, 'O plano é obrigatório.'),
    p_modulo_id: requireField(input.moduloId, 'O módulo é obrigatório.'),
    p_nome: requireField(input.nome, 'O nome do módulo é obrigatório.')
  });
}

export interface CreateContractTaskInput {
  macrotaskId: string;
  nome: string;
  prazo?: string | null;
  observacao?: string | null;
  responsavelNome?: string;
}

export async function createContractTaskRpc(input: CreateContractTaskInput): Promise<RpcCreateTaskResult> {
  return callPlanRpc<RpcCreateTaskResult>('create_contract_task_atomic', {
    p_macrotask_id: requireField(input.macrotaskId, 'A etapa da tarefa é obrigatória.'),
    p_nome: requireField(input.nome, 'O nome da tarefa é obrigatório.'),
    p_prazo: input.prazo || null,
    p_observacao: input.observacao || null,
    p_responsavel_nome: input.responsavelNome ? input.responsavelNome.trim() : null
  });
}

export async function deleteContractTaskRpc(id: string): Promise<RpcGenericDeleteResult> {
  return callPlanRpc<RpcGenericDeleteResult>('delete_contract_task_atomic', {
    p_id: requireField(id, 'O ID da tarefa é obrigatório.')
  });
}

// -------------------------------------------------------------
// Lembretes de prazo legal dispensados pelo gestor (Contrato 360 e Ata 360)
// -------------------------------------------------------------
export type ReminderEntityType = 'CONTRATO' | 'ATA';

export interface ReminderDismissalInput {
  entityType: ReminderEntityType;
  entityKey: string;
  itemId: string;
}

function reminderArgs(input: ReminderDismissalInput) {
  return {
    p_entity_type: input.entityType,
    p_entity_key: requireField(input.entityKey, 'O contrato ou a Ata é obrigatório.'),
    p_item_id: requireField(input.itemId, 'O lembrete é obrigatório.')
  };
}

export async function dismissReminderRpc(input: ReminderDismissalInput): Promise<{ success: boolean }> {
  return callPlanRpc<{ success: boolean }>('dismiss_reminder_atomic', reminderArgs(input));
}

export async function restoreReminderRpc(input: ReminderDismissalInput): Promise<{ success: boolean }> {
  return callPlanRpc<{ success: boolean }>('restore_reminder_atomic', reminderArgs(input));
}
