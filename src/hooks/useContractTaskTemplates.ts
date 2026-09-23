import { useQuery } from '@tanstack/react-query';
import { fetchContractTaskTemplates } from '../services/contractManagementService';
import type { ContractTaskTemplate } from '../types';

/**
 * Constrói as opções canônicas de query para o catálogo de Templates de Gestão Contratual.
 *
 * Query Key Canônica: ['contract-task-templates']
 */
export function getContractTaskTemplatesQueryOptions() {
  return {
    queryKey: ['contract-task-templates'] as const,
    queryFn: async (): Promise<ContractTaskTemplate[]> => {
      return fetchContractTaskTemplates();
    },
    staleTime: 5 * 60 * 1000
  };
}

/**
 * Hook canônico do React Query para listagem dos Templates de Gestão Contratual
 * (já com macrotarefas e tarefas aninhadas).
 */
export function useContractTaskTemplates() {
  return useQuery<ContractTaskTemplate[], Error>(getContractTaskTemplatesQueryOptions());
}
