import { useQuery } from '@tanstack/react-query';
import { fetchAllContractManagers } from '../services/contractManagementService';
import type { ContractManager } from '../types';

export function getAllContractManagersQueryOptions(uasg?: string) {
  const cleanUasg = (uasg || '').trim();

  return {
    queryKey: ['all-contract-managers', cleanUasg] as const,
    queryFn: async (): Promise<Record<string, ContractManager>> => {
      return fetchAllContractManagers(cleanUasg);
    },
    enabled: Boolean(cleanUasg),
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

export function useAllContractManagers(uasg?: string) {
  return useQuery<Record<string, ContractManager>, Error>(
    getAllContractManagersQueryOptions(uasg)
  );
}
