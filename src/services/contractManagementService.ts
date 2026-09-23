import { supabase, isSupabaseConfigured } from './supabaseClient';
import { resolveContractKey } from '../utils/contractKeyUtils';
import type {
  ContractManager,
  ContractTaskTemplate,
  ContractTaskTemplateMacrotask,
  ContractTaskTemplateTask,
  ContractTaskPlan,
  ContractTaskMacrotask,
  ContractTask,
  ContractTaskPlanProgress
} from '../types';

/**
 * Deriva a chave canônica e estável de identidade de gestão de um contrato
 * administrativo (não existe linha própria de contrato no banco — os dados
 * vêm das APIs federais). Mesma fórmula usada nas RPCs de backend
 * (public.normalize_contract_key, migration 14).
 *
 * Este é um wrapper fino e mantido apenas por compatibilidade com os
 * chamadores já existentes (ContractManagementPanel, useApplyContractTaskTemplate,
 * useSaveContractManager), que sempre têm `numero` e `ano` já separados.
 * TODA a derivação real acontece em resolveContractKey — ver
 * src/utils/contractKeyUtils.ts para as regras completas.
 *
 * O ano do próprio `numero` tem prioridade sobre o parâmetro `ano`: este
 * último só é usado como fallback quando o `numero` não permite derivar o
 * ano deterministicamente (ex.: número sintético/incompleto).
 */
export function getContractManagementKey(uasg: string, numero: string, ano: number | string): string {
  const resolution = resolveContractKey(uasg, numero, ano);
  if (resolution.tipo !== 'INVALIDO') {
    return resolution.key;
  }
  // Nem o número nem o ano informado permitiram derivar uma chave (caso
  // degenerado, não observado nos dados reais auditados). Não retornamos
  // '' silenciosamente: montamos uma chave defensiva e claramente marcável.
  const uasgFallback = (uasg || '').trim() || '200331';
  const anoFallback = String(ano || '').trim();
  return `${uasgFallback}-INDETERMINADO-${anoFallback || 'SEM-ANO'}`;
}

export function calculateContractTaskPlanProgress(macrotarefas: ContractTaskMacrotask[]): ContractTaskPlanProgress {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let total = 0;
  let concluidas = 0;
  let pendentes = 0;
  let emAndamento = 0;
  let naoAplicaveis = 0;
  let atrasadas = 0;

  for (const macro of macrotarefas) {
    for (const tarefa of macro.tarefas) {
      total++;
      if (tarefa.status === 'CONCLUIDA') {
        concluidas++;
      } else if (tarefa.status === 'NAO_APLICAVEL') {
        naoAplicaveis++;
      } else {
        if (tarefa.status === 'EM_ANDAMENTO') emAndamento++;
        else pendentes++;

        if (tarefa.prazo) {
          const prazoDate = new Date(`${tarefa.prazo}T00:00:00`);
          if (!isNaN(prazoDate.getTime()) && prazoDate < today) {
            atrasadas++;
          }
        }
      }
    }
  }

  const denominador = total - naoAplicaveis;
  const percentual = denominador > 0 ? Math.round((concluidas / denominador) * 100) : 0;

  return { total, concluidas, pendentes, emAndamento, naoAplicaveis, atrasadas, percentual };
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  }
  return supabase;
}

/**
 * Busca o Gestor de um contrato específico. Retorna null se ainda não houver gestor atribuído.
 */
export async function fetchContractManager(contractKey: string): Promise<ContractManager | null> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('contract_managers')
    .select('*')
    .eq('contract_key', contractKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    contractKey: data.contract_key,
    uasg: data.uasg,
    numero: data.numero,
    ano: data.ano,
    gestorNome: data.gestor_nome,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/**
 * Busca todos os Gestores de contratos cadastrados, retornando um mapa indexado por contract_key.
 */
export async function fetchAllContractManagers(uasg?: string): Promise<Record<string, ContractManager>> {
  if (!isSupabaseConfigured || !supabase) return {};

  try {
    let query = supabase.from('contract_managers').select('*');
    if (uasg && uasg.trim()) {
      query = query.eq('uasg', uasg.trim());
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || !Array.isArray(data)) return {};

    const map: Record<string, ContractManager> = {};
    for (const item of data) {
      if (item.contract_key) {
        map[item.contract_key] = {
          contractKey: item.contract_key,
          uasg: item.uasg,
          numero: item.numero,
          ano: item.ano,
          gestorNome: item.gestor_nome,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        };
      }
    }
    return map;
  } catch (err) {
    console.warn('Erro ao carregar gestores de contratos', err);
    return {};
  }
}

/**
 * Busca todos os Templates de Gestão Contratual cadastrados, já com suas
 * macrotarefas e tarefas aninhadas e ordenadas.
 */
export async function fetchContractTaskTemplates(): Promise<ContractTaskTemplate[]> {
  const client = requireSupabase();

  const [templatesRes, macrotasksRes, tasksRes] = await Promise.all([
    client.from('contract_task_templates').select('*').order('nome', { ascending: true }),
    client.from('contract_task_template_macrotasks').select('*').order('ordem', { ascending: true }),
    client.from('contract_task_template_tasks').select('*').order('ordem', { ascending: true })
  ]);

  if (templatesRes.error) throw templatesRes.error;
  if (macrotasksRes.error) throw macrotasksRes.error;
  if (tasksRes.error) throw tasksRes.error;

  const tasksByMacrotask = new Map<string, ContractTaskTemplateTask[]>();
  for (const t of tasksRes.data || []) {
    const list = tasksByMacrotask.get(t.macrotask_id) || [];
    list.push({ id: t.id, macrotaskId: t.macrotask_id, nome: t.nome, ordem: t.ordem });
    tasksByMacrotask.set(t.macrotask_id, list);
  }

  const macrotasksByTemplate = new Map<string, ContractTaskTemplateMacrotask[]>();
  for (const m of macrotasksRes.data || []) {
    const list = macrotasksByTemplate.get(m.template_id) || [];
    list.push({
      id: m.id,
      templateId: m.template_id,
      nome: m.nome,
      ordem: m.ordem,
      tarefas: tasksByMacrotask.get(m.id) || []
    });
    macrotasksByTemplate.set(m.template_id, list);
  }

  return (templatesRes.data || []).map((t: any) => ({
    id: t.id,
    nome: t.nome,
    descricao: t.descricao || undefined,
    ativo: t.ativo,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    macrotarefas: macrotasksByTemplate.get(t.id) || []
  }));
}

/**
 * Busca o Plano de Gestão aplicado a um contrato (macrotarefas + tarefas + progresso calculado).
 * Retorna null se nenhum template ainda foi aplicado a este contrato.
 */
export async function fetchContractTaskPlan(contractKey: string): Promise<ContractTaskPlan | null> {
  const client = requireSupabase();

  const { data: plan, error: planError } = await client
    .from('contract_task_plans')
    .select('*')
    .eq('contract_key', contractKey)
    .maybeSingle();

  if (planError) throw planError;
  if (!plan) return null;

  const { data: macrotasks, error: macrotasksError } = await client
    .from('contract_task_macrotasks')
    .select('*')
    .eq('plan_id', plan.id)
    .order('ordem', { ascending: true });

  if (macrotasksError) throw macrotasksError;

  const macrotaskIds = (macrotasks || []).map((m: any) => m.id);
  let tasks: any[] = [];
  if (macrotaskIds.length > 0) {
    const { data: tasksData, error: tasksError } = await client
      .from('contract_tasks')
      .select('*')
      .in('macrotask_id', macrotaskIds)
      .order('ordem', { ascending: true });

    if (tasksError) throw tasksError;
    tasks = tasksData || [];
  }

  const tasksByMacrotask = new Map<string, ContractTask[]>();
  for (const t of tasks) {
    const list = tasksByMacrotask.get(t.macrotask_id) || [];
    list.push({
      id: t.id,
      macrotaskId: t.macrotask_id,
      nome: t.nome,
      ordem: t.ordem,
      status: t.status,
      responsavelNome: t.responsavel_nome || undefined,
      prazo: t.prazo || undefined,
      observacao: t.observacao || undefined,
      criadoEm: t.criado_em,
      atualizadoEm: t.atualizado_em,
      concluidoEm: t.concluido_em || undefined,
      concluidoPor: t.concluido_por || undefined
    });
    tasksByMacrotask.set(t.macrotask_id, list);
  }

  const macrotarefas: ContractTaskMacrotask[] = (macrotasks || []).map((m: any) => ({
    id: m.id,
    planId: m.plan_id,
    nome: m.nome,
    ordem: m.ordem,
    tarefas: tasksByMacrotask.get(m.id) || []
  }));

  return {
    id: plan.id,
    contractKey: plan.contract_key,
    uasg: plan.uasg,
    numero: plan.numero,
    ano: plan.ano,
    templateId: plan.template_id || undefined,
    templateNome: plan.template_nome,
    appliedAt: plan.applied_at,
    macrotarefas,
    progresso: calculateContractTaskPlanProgress(macrotarefas)
  };
}

/**
 * Busca todos os Planos de Gestão de contratos cadastrados, indexados por contract_key.
 */
export async function fetchAllContractTaskPlans(uasg?: string): Promise<Record<string, ContractTaskPlan>> {
  if (!isSupabaseConfigured || !supabase) return {};

  try {
    let plansQuery = supabase.from('contract_task_plans').select('*');
    if (uasg && uasg.trim()) {
      plansQuery = plansQuery.eq('uasg', uasg.trim());
    }

    const { data: plansData, error: plansError } = await plansQuery;
    if (plansError) throw plansError;
    if (!plansData || !Array.isArray(plansData) || plansData.length === 0) return {};

    const planIds = plansData.map((p: any) => p.id);
    const { data: macrotasksData, error: macroError } = await supabase
      .from('contract_task_macrotasks')
      .select('*')
      .in('plan_id', planIds)
      .order('ordem', { ascending: true });

    if (macroError) throw macroError;

    const macrotasks = macrotasksData || [];
    const macrotaskIds = macrotasks.map((m: any) => m.id);

    let tasks: any[] = [];
    if (macrotaskIds.length > 0) {
      const { data: tasksData, error: tasksError } = await supabase
        .from('contract_tasks')
        .select('*')
        .in('macrotask_id', macrotaskIds)
        .order('ordem', { ascending: true });

      if (tasksError) throw tasksError;
      tasks = tasksData || [];
    }

    const tasksByMacrotask = new Map<string, ContractTask[]>();
    for (const t of tasks) {
      const list = tasksByMacrotask.get(t.macrotask_id) || [];
      list.push({
        id: t.id,
        macrotaskId: t.macrotask_id,
        nome: t.nome,
        ordem: t.ordem,
        status: t.status,
        responsavelNome: t.responsavel_nome || undefined,
        prazo: t.prazo || undefined,
        observacao: t.observacao || undefined,
        criadoEm: t.criado_em,
        atualizadoEm: t.atualizado_em,
        concluidoEm: t.concluido_em || undefined,
        concluidoPor: t.concluido_por || undefined
      });
      tasksByMacrotask.set(t.macrotask_id, list);
    }

    const macrotasksByPlan = new Map<string, ContractTaskMacrotask[]>();
    for (const m of macrotasks) {
      const list = macrotasksByPlan.get(m.plan_id) || [];
      list.push({
        id: m.id,
        planId: m.plan_id,
        nome: m.nome,
        ordem: m.ordem,
        tarefas: tasksByMacrotask.get(m.id) || []
      });
      macrotasksByPlan.set(m.plan_id, list);
    }

    const map: Record<string, ContractTaskPlan> = {};
    for (const p of plansData) {
      const planMacrotarefas = macrotasksByPlan.get(p.id) || [];
      map[p.contract_key] = {
        id: p.id,
        contractKey: p.contract_key,
        uasg: p.uasg,
        numero: p.numero,
        ano: p.ano,
        templateId: p.template_id || undefined,
        templateNome: p.template_nome,
        appliedAt: p.applied_at,
        macrotarefas: planMacrotarefas,
        progresso: calculateContractTaskPlanProgress(planMacrotarefas)
      };
    }
    return map;
  } catch (err) {
    console.warn('Erro ao carregar todos os planos de gestão de contratos', err);
    return {};
  }
}
