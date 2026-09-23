import { useQuery } from '@tanstack/react-query';
import { fetchContractManager } from '../services/contractManagementService';
import type { ContractManager } from '../types';

/**
 * Constrói as opções canônicas de query para o Gestor de um contrato.
 *
 * Query Key Canônica: ['contract-manager', contractKey]
 */
export function getContractManagerQueryOptions(contractKey: string) {
  return {
    queryKey: ['contract-manager', contractKey] as const,
    queryFn: async (): Promise<ContractManager | null> => {
      return fetchContractManager(contractKey);
    },
    enabled: Boolean(contractKey),
    staleTime: 5 * 60 * 1000
  };
}

/**
 * Hook canônico do React Query para consulta do Gestor de um contrato.
 *
 * Arquitetura:
 * ContractCard -> useContractManager(contractKey) -> fetchContractManager() -> Supabase (contract_managers)
 */
export function useContractManager(contractKey: string) {
  return useQuery<ContractManager | null, Error>(getContractManagerQueryOptions(contractKey));
}
