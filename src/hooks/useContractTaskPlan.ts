import { useQuery } from '@tanstack/react-query';
import { fetchContractTaskPlan } from '../services/contractManagementService';
import type { ContractTaskPlan } from '../types';

/**
 * Constrói as opções canônicas de query para o Plano de Gestão de um contrato.
 *
 * Query Key Canônica: ['contract-task-plan', contractKey]
 */
export function getContractTaskPlanQueryOptions(contractKey: string, enabled: boolean = true) {
  return {
    queryKey: ['contract-task-plan', contractKey] as const,
    queryFn: async (): Promise<ContractTaskPlan | null> => {
      return fetchContractTaskPlan(contractKey);
    },
    enabled: Boolean(contractKey) && enabled,
    staleTime: 60 * 1000
  };
}

/**
 * Hook canônico do React Query para consulta do Plano de Gestão (macrotarefas + tarefas + progresso)
 * aplicado a um contrato.
 */
export function useContractTaskPlan(contractKey: string, enabled: boolean = true) {
  return useQuery<ContractTaskPlan | null, Error>(getContractTaskPlanQueryOptions(contractKey, enabled));
}
