import type { TaskPlanModuleRef } from '../types';

interface ModuleTask {
  status: string;
}

interface ModuleMacrotask {
  id: string;
  origem?: string;
  modulo?: TaskPlanModuleRef;
  tarefas: ModuleTask[];
}

interface ModulePlanRef {
  templateId?: string;
  templateNome: string;
  appliedAt?: string;
}

export interface TaskPlanModuleGroup<T extends ModuleMacrotask> {
  /** Chave estável do grupo; 'personalizadas' agrupa as etapas criadas pelo gestor. */
  key: string;
  /** undefined = etapas personalizadas (sem módulo). */
  modulo?: TaskPlanModuleRef;
  macrotarefas: T[];
  totalTarefas: number;
  concluidas: number;
  /** Tarefas que contam para o progresso (exclui "não aplicável"). */
  aplicaveis: number;
}

/** Lê as colunas modulo_* de uma linha de macrotarefa; undefined se a etapa não pertence a módulo. */
export function moduleFromRow(row: any): TaskPlanModuleRef | undefined {
  if (!row || !row.modulo_id) return undefined;
  return {
    id: row.modulo_id,
    templateId: row.modulo_template_id || undefined,
    nome: row.modulo_nome || 'Módulo',
    appliedAt: row.modulo_applied_at || undefined
  };
}

/**
 * Agrupa as etapas do plano em módulos, na ordem em que aparecem. Etapas vindas de
 * modelo sem módulo gravado (dados anteriores) caem no módulo do modelo original do plano;
 * as criadas pelo gestor ficam no grupo "personalizadas", sempre por último.
 */
export function groupMacrotasksByModule<T extends ModuleMacrotask>(
  macrotarefas: T[],
  plan: ModulePlanRef
): TaskPlanModuleGroup<T>[] {
  const groups = new Map<string, TaskPlanModuleGroup<T>>();
  let personalizadas: TaskPlanModuleGroup<T> | undefined;

  const newGroup = (key: string, modulo?: TaskPlanModuleRef): TaskPlanModuleGroup<T> => ({
    key,
    modulo,
    macrotarefas: [],
    totalTarefas: 0,
    concluidas: 0,
    aplicaveis: 0
  });

  for (const macro of macrotarefas) {
    let group: TaskPlanModuleGroup<T>;
    const modulo =
      macro.modulo ??
      (macro.origem !== 'PERSONALIZADA'
        ? { id: 'legacy', templateId: plan.templateId, nome: plan.templateNome, appliedAt: plan.appliedAt }
        : undefined);

    if (modulo) {
      group = groups.get(modulo.id) ?? newGroup(modulo.id, modulo);
      groups.set(modulo.id, group);
    } else {
      personalizadas = personalizadas ?? newGroup('personalizadas');
      group = personalizadas;
    }

    group.macrotarefas.push(macro);
    for (const t of macro.tarefas) {
      group.totalTarefas += 1;
      if (t.status === 'NAO_APLICAVEL') continue;
      group.aplicaveis += 1;
      if (t.status === 'CONCLUIDA') group.concluidas += 1;
    }
  }

  const result = Array.from(groups.values());
  if (personalizadas) result.push(personalizadas);
  return result;
}
