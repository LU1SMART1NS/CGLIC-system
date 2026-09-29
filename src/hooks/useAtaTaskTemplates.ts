import { useQuery } from '@tanstack/react-query';
import { fetchAtaTaskTemplates } from '../services/ataManagementService';
import type { AtaTaskTemplate } from '../types';

/**
 * Constrói as opções canônicas de query para o catálogo de Templates de Gestão de Ata.
 *
 * Query Key Canônica: ['ata-task-templates']
 */
export function getAtaTaskTemplatesQueryOptions() {
  return {
    queryKey: ['ata-task-templates'] as const,
    queryFn: async (): Promise<AtaTaskTemplate[]> => {
      return fetchAtaTaskTemplates();
    },
    staleTime: 5 * 60 * 1000
  };
}

/**
 * Hook canônico do React Query para listagem dos Templates de Gestão de Ata
 * (já com macrotarefas e tarefas aninhadas).
 */
export function useAtaTaskTemplates() {
  return useQuery<AtaTaskTemplate[], Error>(getAtaTaskTemplatesQueryOptions());
}
