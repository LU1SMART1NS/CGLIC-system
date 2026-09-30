import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type {
  RpcAtaTaskTemplateResult,
  RpcDeleteAtaTaskTemplateResult,
  RpcAtaTaskTemplateMacrotaskResult,
  RpcAtaTaskTemplateTaskResult,
  RpcGenericDeleteResult,
  RpcApplyAtaTaskTemplateResult,
  RpcUpdateAtaTaskResult,
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

export interface AtaTaskTemplateInput {
  id?: string;
  nome: string;
  descricao?: string;
  ativo?: boolean;
}

export async function saveAtaTaskTemplateRpc(input: AtaTaskTemplateInput): Promise<RpcAtaTaskTemplateResult> {
  const client = requireSupabase();

  const cleanNome = (input.nome || '').trim();
  if (!cleanNome) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome do template é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('save_ata_task_template_atomic', {
      p_id: input.id ? input.id.trim() : null,
      p_nome: cleanNome,
      p_descricao: input.descricao ? input.descricao.trim() : null,
      p_ativo: input.ativo ?? true
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_ata_task_template_atomic'));
    }
    return data as RpcAtaTaskTemplateResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export async function deleteAtaTaskTemplateRpc(id: string): Promise<RpcDeleteAtaTaskTemplateResult> {
  const client = requireSupabase();

  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID do template é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('delete_ata_task_template_atomic', { p_id: cleanId });
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_ata_task_template_atomic'));
    }
    return data as RpcDeleteAtaTaskTemplateResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface AtaTaskTemplateMacrotaskInput {
  id?: string;
  templateId?: string;
  nome: string;
  ordem?: number;
}

export async function saveAtaTaskTemplateMacrotaskRpc(
  input: AtaTaskTemplateMacrotaskInput
): Promise<RpcAtaTaskTemplateMacrotaskResult> {
  const client = requireSupabase();

  const cleanNome = (input.nome || '').trim();
  if (!cleanNome) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome da macrotarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('save_ata_task_template_macrotask_atomic', {
      p_id: input.id ? input.id.trim() : null,
      p_template_id: input.templateId ? input.templateId.trim() : null,
      p_nome: cleanNome,
      p_ordem: input.ordem ?? 0
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_ata_task_template_macrotask_atomic'));
    }
    return data as RpcAtaTaskTemplateMacrotaskResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export async function deleteAtaTaskTemplateMacrotaskRpc(id: string): Promise<RpcGenericDeleteResult> {
  const client = requireSupabase();

  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID da macrotarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('delete_ata_task_template_macrotask_atomic', { p_id: cleanId });
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_ata_task_template_macrotask_atomic'));
    }
    return data as RpcGenericDeleteResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface AtaTaskTemplateTaskInput {
  id?: string;
  macrotaskId?: string;
  nome: string;
  ordem?: number;
  /** Semântica de execução canônica (Fase 10-A.2) — INTERNA/EXTERNA/AUTOMATICA/CONFIRMACAO. */
  executionMode?: TaskExecutionMode;
}

export async function saveAtaTaskTemplateTaskRpc(
  input: AtaTaskTemplateTaskInput
): Promise<RpcAtaTaskTemplateTaskResult> {
  const client = requireSupabase();

  const cleanNome = (input.nome || '').trim();
  if (!cleanNome) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O nome da tarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('save_ata_task_template_task_atomic', {
      p_id: input.id ? input.id.trim() : null,
      p_macrotask_id: input.macrotaskId ? input.macrotaskId.trim() : null,
      p_nome: cleanNome,
      p_ordem: input.ordem ?? 0,
      p_execution_mode: input.executionMode ?? null
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC save_ata_task_template_task_atomic'));
    }
    return data as RpcAtaTaskTemplateTaskResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export async function deleteAtaTaskTemplateTaskRpc(id: string): Promise<RpcGenericDeleteResult> {
  const client = requireSupabase();

  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID da tarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('delete_ata_task_template_task_atomic', { p_id: cleanId });
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC delete_ata_task_template_task_atomic'));
    }
    return data as RpcGenericDeleteResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface ApplyAtaTaskTemplateInput {
  ataKey: string;
  templateId: string;
}

export async function applyAtaTaskTemplateRpc(
  input: ApplyAtaTaskTemplateInput
): Promise<RpcApplyAtaTaskTemplateResult> {
  const client = requireSupabase();

  const cleanAtaKey = (input.ataKey || '').trim();
  const cleanTemplateId = (input.templateId || '').trim();
  if (!cleanAtaKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O número da Ata é obrigatório.'));
  }
  if (!cleanTemplateId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O template selecionado é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('apply_ata_task_template_atomic', {
      p_ata_key: cleanAtaKey,
      p_template_id: cleanTemplateId
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC apply_ata_task_template_atomic'));
    }
    return data as RpcApplyAtaTaskTemplateResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface UpdateAtaTaskInput {
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

export async function updateAtaTaskRpc(input: UpdateAtaTaskInput): Promise<RpcUpdateAtaTaskResult> {
  const client = requireSupabase();

  const cleanTaskId = (input.taskId || '').trim();
  if (!cleanTaskId) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: O ID da tarefa é obrigatório.'));
  }

  try {
    const { data, error } = await client.rpc('update_ata_task_atomic', {
      p_task_id: cleanTaskId,
      p_status: input.status ?? null,
      // undefined mantém o valor; string vazia limpa (volta a herdar o gestor da Ata).
      p_responsavel_nome: input.responsavelNome !== undefined ? input.responsavelNome.trim() : null,
      p_prazo: input.prazo ?? null,
      p_observacao: input.observacao ?? null,
      p_concluido_por: input.concluidoPor ? input.concluidoPor.trim() : null,
      p_responsavel_user_id: input.responsavelUserId ?? null,
      p_nome: input.nome !== undefined ? input.nome.trim() : null
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC update_ata_task_atomic'));
    }
    return data as RpcUpdateAtaTaskResult;
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

export async function startAtaTaskPlanRpc(input: { ataKey: string }): Promise<RpcStartTaskPlanResult> {
  return callPlanRpc<RpcStartTaskPlanResult>('start_ata_task_plan_atomic', {
    p_ata_key: requireField(input.ataKey, 'O número da Ata é obrigatório.')
  });
}

export interface SaveAtaTaskMacrotaskInput {
  id?: string;
  planId?: string;
  nome: string;
}

export async function saveAtaTaskMacrotaskRpc(input: SaveAtaTaskMacrotaskInput): Promise<RpcTaskPlanMacrotaskResult> {
  return callPlanRpc<RpcTaskPlanMacrotaskResult>('save_ata_task_macrotask_atomic', {
    p_id: input.id ? input.id.trim() : null,
    p_plan_id: input.planId ? input.planId.trim() : null,
    p_nome: requireField(input.nome, 'O nome da etapa é obrigatório.')
  });
}

export interface DeleteAtaTaskModuleInput {
  planId: string;
  moduloId: string;
}

export async function deleteAtaTaskModuleRpc(input: DeleteAtaTaskModuleInput): Promise<RpcGenericDeleteResult> {
  return callPlanRpc<RpcGenericDeleteResult>('delete_ata_task_module_atomic', {
    p_plan_id: requireField(input.planId, 'O plano é obrigatório.'),
    p_modulo_id: requireField(input.moduloId, 'O módulo é obrigatório.')
  });
}

export async function deleteAtaTaskMacrotaskRpc(id: string): Promise<RpcGenericDeleteResult> {
  return callPlanRpc<RpcGenericDeleteResult>('delete_ata_task_macrotask_atomic', {
    p_id: requireField(id, 'O ID da etapa é obrigatório.')
  });
}

export interface CreateAtaTaskInput {
  macrotaskId: string;
  nome: string;
  prazo?: string | null;
  observacao?: string | null;
  responsavelNome?: string;
}

export async function createAtaTaskRpc(input: CreateAtaTaskInput): Promise<RpcCreateTaskResult> {
  return callPlanRpc<RpcCreateTaskResult>('create_ata_task_atomic', {
    p_macrotask_id: requireField(input.macrotaskId, 'A etapa da tarefa é obrigatória.'),
    p_nome: requireField(input.nome, 'O nome da tarefa é obrigatório.'),
    p_prazo: input.prazo || null,
    p_observacao: input.observacao || null,
    p_responsavel_nome: input.responsavelNome ? input.responsavelNome.trim() : null
  });
}

export async function deleteAtaTaskRpc(id: string): Promise<RpcGenericDeleteResult> {
  return callPlanRpc<RpcGenericDeleteResult>('delete_ata_task_atomic', {
    p_id: requireField(id, 'O ID da tarefa é obrigatório.')
  });
}
