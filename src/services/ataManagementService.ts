import { supabase, isSupabaseConfigured } from './supabaseClient';
import type {
  AtaTaskTemplate,
  AtaTaskTemplateMacrotask,
  AtaTaskTemplateTask,
  AtaTaskPlan,
  AtaTaskMacrotask,
  AtaTask,
  ContractTaskPlanProgress
} from '../types';

/**
 * Calcula o progresso de um plano de gestão de Ata — cópia estrutural de
 * calculateContractTaskPlanProgress (contractManagementService.ts), mesma
 * regra de negócio (percentual exclui NAO_APLICAVEL do denominador; atrasada
 * = tarefa aberta com prazo < hoje).
 */
export function calculateAtaTaskPlanProgress(macrotarefas: AtaTaskMacrotask[]): ContractTaskPlanProgress {
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
 * Busca todos os Templates de Gestão de Ata cadastrados, já com suas
 * macrotarefas e tarefas aninhadas e ordenadas.
 */
export async function fetchAtaTaskTemplates(): Promise<AtaTaskTemplate[]> {
  const client = requireSupabase();

  const [templatesRes, macrotasksRes, tasksRes] = await Promise.all([
    client.from('ata_task_templates').select('*').order('nome', { ascending: true }),
    client.from('ata_task_template_macrotasks').select('*').order('ordem', { ascending: true }),
    client.from('ata_task_template_tasks').select('*').order('ordem', { ascending: true })
  ]);

  if (templatesRes.error) throw templatesRes.error;
  if (macrotasksRes.error) throw macrotasksRes.error;
  if (tasksRes.error) throw tasksRes.error;

  const tasksByMacrotask = new Map<string, AtaTaskTemplateTask[]>();
  for (const t of tasksRes.data || []) {
    const list = tasksByMacrotask.get(t.macrotask_id) || [];
    list.push({
      id: t.id,
      macrotaskId: t.macrotask_id,
      nome: t.nome,
      ordem: t.ordem,
      executionMode: t.execution_mode || undefined
    });
    tasksByMacrotask.set(t.macrotask_id, list);
  }

  const macrotasksByTemplate = new Map<string, AtaTaskTemplateMacrotask[]>();
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
 * Busca o Plano de Gestão aplicado a uma Ata (macrotarefas + tarefas + progresso calculado).
 * Retorna null se nenhum template ainda foi aplicado a esta Ata.
 */
export async function fetchAtaTaskPlan(ataKey: string): Promise<AtaTaskPlan | null> {
  const client = requireSupabase();

  const { data: plan, error: planError } = await client
    .from('ata_task_plans')
    .select('*')
    .eq('ata_key', ataKey)
    .maybeSingle();

  if (planError) throw planError;
  if (!plan) return null;

  const { data: macrotasks, error: macrotasksError } = await client
    .from('ata_task_macrotasks')
    .select('*')
    .eq('plan_id', plan.id)
    .order('ordem', { ascending: true });

  if (macrotasksError) throw macrotasksError;

  const macrotaskIds = (macrotasks || []).map((m: any) => m.id);
  let tasks: any[] = [];
  if (macrotaskIds.length > 0) {
    const { data: tasksData, error: tasksError } = await client
      .from('ata_tasks')
      .select('*')
      .in('macrotask_id', macrotaskIds)
      .order('ordem', { ascending: true });

    if (tasksError) throw tasksError;
    tasks = tasksData || [];
  }

  const tasksByMacrotask = new Map<string, AtaTask[]>();
  for (const t of tasks) {
    const list = tasksByMacrotask.get(t.macrotask_id) || [];
    list.push({
      id: t.id,
      macrotaskId: t.macrotask_id,
      nome: t.nome,
      ordem: t.ordem,
      status: t.status,
      executionMode: t.execution_mode || undefined,
      responsavelNome: t.responsavel_nome || undefined,
      responsavelUserId: t.responsavel_user_id || undefined,
      prazo: t.prazo || undefined,
      observacao: t.observacao || undefined,
      criadoEm: t.criado_em,
      atualizadoEm: t.atualizado_em,
      concluidoEm: t.concluido_em || undefined,
      concluidoPor: t.concluido_por || undefined
    });
    tasksByMacrotask.set(t.macrotask_id, list);
  }

  const macrotarefas: AtaTaskMacrotask[] = (macrotasks || []).map((m: any) => ({
    id: m.id,
    planId: m.plan_id,
    nome: m.nome,
    ordem: m.ordem,
    tarefas: tasksByMacrotask.get(m.id) || []
  }));

  return {
    id: plan.id,
    ataKey: plan.ata_key,
    templateId: plan.template_id || undefined,
    templateNome: plan.template_nome,
    appliedAt: plan.applied_at,
    macrotarefas,
    progresso: calculateAtaTaskPlanProgress(macrotarefas)
  };
}

/**
 * Busca todos os Planos de Gestão de Ata cadastrados, indexados por ata_key.
 */
export async function fetchAllAtaTaskPlans(): Promise<Record<string, AtaTaskPlan>> {
  if (!isSupabaseConfigured || !supabase) return {};

  try {
    const { data: plansData, error: plansError } = await supabase.from('ata_task_plans').select('*');
    if (plansError) throw plansError;
    if (!plansData || !Array.isArray(plansData) || plansData.length === 0) return {};

    const planIds = plansData.map((p: any) => p.id);
    const { data: macrotasksData, error: macroError } = await supabase
      .from('ata_task_macrotasks')
      .select('*')
      .in('plan_id', planIds)
      .order('ordem', { ascending: true });

    if (macroError) throw macroError;

    const macrotasks = macrotasksData || [];
    const macrotaskIds = macrotasks.map((m: any) => m.id);

    let tasks: any[] = [];
    if (macrotaskIds.length > 0) {
      const { data: tasksData, error: tasksError } = await supabase
        .from('ata_tasks')
        .select('*')
        .in('macrotask_id', macrotaskIds)
        .order('ordem', { ascending: true });

      if (tasksError) throw tasksError;
      tasks = tasksData || [];
    }

    const tasksByMacrotask = new Map<string, AtaTask[]>();
    for (const t of tasks) {
      const list = tasksByMacrotask.get(t.macrotask_id) || [];
      list.push({
        id: t.id,
        macrotaskId: t.macrotask_id,
        nome: t.nome,
        ordem: t.ordem,
        status: t.status,
        executionMode: t.execution_mode || undefined,
        responsavelNome: t.responsavel_nome || undefined,
        responsavelUserId: t.responsavel_user_id || undefined,
        prazo: t.prazo || undefined,
        observacao: t.observacao || undefined,
        criadoEm: t.criado_em,
        atualizadoEm: t.atualizado_em,
        concluidoEm: t.concluido_em || undefined,
        concluidoPor: t.concluido_por || undefined
      });
      tasksByMacrotask.set(t.macrotask_id, list);
    }

    const macrotasksByPlan = new Map<string, AtaTaskMacrotask[]>();
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

    const map: Record<string, AtaTaskPlan> = {};
    for (const p of plansData) {
      const planMacrotarefas = macrotasksByPlan.get(p.id) || [];
      map[p.ata_key] = {
        id: p.id,
        ataKey: p.ata_key,
        templateId: p.template_id || undefined,
        templateNome: p.template_nome,
        appliedAt: p.applied_at,
        macrotarefas: planMacrotarefas,
        progresso: calculateAtaTaskPlanProgress(planMacrotarefas)
      };
    }
    return map;
  } catch (err) {
    console.warn('Erro ao carregar todos os planos de gestão de Ata', err);
    return {};
  }
}
