import type { ContractTask, TaskExecutionMode } from '../../types';
import { differenceInDays, parseDateBRT } from '../../services/temporalEngineService';

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

  const dias = differenceInDays(prazoDate);

  if (dias < 0) return { level: 'VENCIDA', diasRestantes: dias };
  if (dias === 0) return { level: 'HOJE', diasRestantes: 0 };
  if (dias <= 7) return { level: 'URGENTE', diasRestantes: dias };
  if (dias <= 30) return { level: 'PROXIMA', diasRestantes: dias };
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
      return { label: 'Confirmação Oficial', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    case 'EXTERNA':
      return { label: 'Ação Externa', bg: '#fdf4ff', color: '#86198f', border: '#f5d0fe' };
    case 'AUTOMATICA':
      return { label: 'Processamento Automático', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
    case 'INTERNA':
    default:
      return { label: 'Providência Interna', bg: '#f8fafc', color: '#334155', border: '#cbd5e1' };
  }
}
