import { useQuery } from '@tanstack/react-query';
import { fetchAllContractManagers } from '../services/contractManagementService';
import type { ContractManager } from '../types';

export function getAllContractManagersQueryOptions(uasg: string = '200331') {
  const cleanUasg = uasg?.trim() || '200331';

  return {
    queryKey: ['all-contract-managers', cleanUasg] as const,
    queryFn: async (): Promise<Record<string, ContractManager>> => {
      return fetchAllContractManagers(cleanUasg);
    },
    enabled: Boolean(cleanUasg),
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

export function useAllContractManagers(uasg: string = '200331') {
  return useQuery<Record<string, ContractManager>, Error>(
    getAllContractManagersQueryOptions(uasg)
  );
}
