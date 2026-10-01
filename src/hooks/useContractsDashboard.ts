import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchContractsForDashboard, clearContractsCache } from '../services/contractService';
import type { ContractDashboardRecord } from '../types';

/**
 * Constrói as opções canônicas de query para o Dashboard de Contratos.
 *
 * Query Key Canônica: ['contracts-dashboard', uasg]
 */
export function getContractsDashboardQueryOptions(uasg?: string) {
  const cleanUasg = (uasg || '').trim();

  return {
    queryKey: ['contracts-dashboard', cleanUasg] as const,
    queryFn: async (): Promise<ContractDashboardRecord[]> => {
      return fetchContractsForDashboard(cleanUasg, false);
    },
    enabled: Boolean(cleanUasg),
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para listagem de contratos administrativos no Dashboard.
 *
 * Arquitetura:
 * UI / ContractsDashboard -> useContractsDashboard(uasg) -> fetchContractsForDashboard() -> APIs Federais
 */
export function useContractsDashboard(uasg?: string) {
  const queryClient = useQueryClient();
  const cleanUasg = (uasg || '').trim();

  const query = useQuery<ContractDashboardRecord[], Error>(
    getContractsDashboardQueryOptions(cleanUasg)
  );

  const refresh = async () => {
    clearContractsCache(cleanUasg);
    await queryClient.invalidateQueries({ queryKey: ['contracts-dashboard', cleanUasg] });
    return query.refetch();
  };

  return {
    ...query,
    refresh
  };
}
