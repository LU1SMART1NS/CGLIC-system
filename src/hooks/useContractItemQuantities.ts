import { useQuery } from '@tanstack/react-query';
import { fetchContractItemQuantities, type ContractItemQuantities } from '../services/contractItemsService';
import type { ContractDashboardRecord } from '../types';

/** Itens e quantidades de um contrato na API oficial (para marcar os itens do vínculo em lote). */
export function useContractItemQuantities(contract: ContractDashboardRecord | null) {
  const key = contract ? `${contract.uasg}-${contract.numero}-${contract.ano}` : '';
  return useQuery<ContractItemQuantities, Error>({
    queryKey: ['contract-item-quantities', key] as const,
    queryFn: () => fetchContractItemQuantities(contract as ContractDashboardRecord),
    enabled: Boolean(contract),
    staleTime: 10 * 60 * 1000
  });
}
