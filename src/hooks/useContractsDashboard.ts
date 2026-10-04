import { useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchContractsForDashboard,
  clearContractsCache,
  isContractsListPartial,
  subscribeContractsPartial
} from '../services/contractService';
import type { ContractDashboardRecord } from '../types';

/** Intervalo para tentar de novo enquanto a lista de contratos estiver incompleta (alguma fonte não respondeu). */
export const CONTRACTS_PARTIAL_RETRY_MS = 30 * 1000;

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
    staleTime: 5 * 60 * 1000, // 5 minutos
    // Lista incompleta não vai para o cache do serviço: tenta de novo até vir completa.
    refetchInterval: (): number | false => (isContractsListPartial(cleanUasg) ? CONTRACTS_PARTIAL_RETRY_MS : false),
    // Ao voltar para a aba com a lista incompleta, consulta de novo (mesmo dentro dos 5 minutos de staleTime).
    refetchOnWindowFocus: (): boolean | 'always' => (isContractsListPartial(cleanUasg) ? 'always' : true)
  };
}

/** Alguma das UASGs está com a lista de contratos incompleta (uma das fontes não respondeu). */
export function useContractsListPartial(uasgs: string[]): boolean {
  return useSyncExternalStore(
    subscribeContractsPartial,
    () => uasgs.some((uasg) => isContractsListPartial(uasg)),
    () => false
  );
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
