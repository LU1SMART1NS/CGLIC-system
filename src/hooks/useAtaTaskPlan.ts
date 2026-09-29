import { useQuery } from '@tanstack/react-query';
import { fetchAtaTaskPlan } from '../services/ataManagementService';
import type { AtaTaskPlan } from '../types';

/**
 * Constrói as opções canônicas de query para o Plano de Gestão de uma Ata.
 *
 * Query Key Canônica: ['ata-task-plan', ataKey]
 */
export function getAtaTaskPlanQueryOptions(ataKey: string, enabled: boolean = true) {
  return {
    queryKey: ['ata-task-plan', ataKey] as const,
    queryFn: async (): Promise<AtaTaskPlan | null> => {
      return fetchAtaTaskPlan(ataKey);
    },
    enabled: Boolean(ataKey) && enabled,
    staleTime: 60 * 1000
  };
}

/**
 * Hook canônico do React Query para consulta do Plano de Gestão (macrotarefas + tarefas + progresso)
 * aplicado a uma Ata.
 */
export function useAtaTaskPlan(ataKey: string, enabled: boolean = true) {
  return useQuery<AtaTaskPlan | null, Error>(getAtaTaskPlanQueryOptions(ataKey, enabled));
}
