import type { ContractTask, TaskExecutionMode } from '../../types';
import { differenceInBusinessDays, parseDateBRT } from '../../services/temporalEngineService';
import { classifyTarefaPrazo } from '../../config/alertRules';

export type AttentionPriorityLevel = 'VENCIDA' | 'HOJE' | 'URGENTE' | 'PROXIMA' | 'SEM_PRAZO';

export interface AttentionItem {
  task: ContractTask;
  macrotaskName: string;
  level: AttentionPriorityLevel;
  diasRestantes: number | null;
}

export function classifyTaskAttention(task: ContractTask): { level: AttentionPriorityLevel; diasRestantes: number | null } {
  if (!task.prazo) {
    return { level: 'SEM_PRAZO', diasRestantes: null };
  }

  const prazoDate = parseDateBRT(task.prazo);
  if (!prazoDate) {
    return { level: 'SEM_PRAZO', diasRestantes: null };
  }

  // Prazos de tarefa em dias úteis (sem fins de semana, feriados e pontos facultativos).
  const dias = differenceInBusinessDays(prazoDate);

  if (dias < 0) return { level: 'VENCIDA', diasRestantes: dias };
  if (dias === 0) return { level: 'HOJE', diasRestantes: 0 };
  const nivel = classifyTarefaPrazo(dias);
  if (nivel === 'URGENTE') return { level: 'URGENTE', diasRestantes: dias };
  if (nivel === 'PROXIMA') return { level: 'PROXIMA', diasRestantes: dias };
  return { level: 'SEM_PRAZO', diasRestantes: dias };
}

export function getExecutionModeDisplay(mode?: TaskExecutionMode): {
  label: string;
  bg: string;
  color: string;
  border: string;
} {
  switch (mode) {
    case 'CONFIRMACAO':
      return { label: 'Confirmação Oficial', bg: 'var(--color-info-bg)', color: 'var(--color-info-text)', border: 'var(--color-info-border)' };
    case 'EXTERNA':
      return { label: 'Ação Externa', bg: '#fdf4ff', color: '#86198f', border: '#f5d0fe' };
    case 'AUTOMATICA':
      return { label: 'Processamento Automático', bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', border: 'var(--color-success-border)' };
    case 'INTERNA':
    default:
      return { label: 'Providência Interna', bg: '#f8fafc', color: '#334155', border: '#cbd5e1' };
  }
}
