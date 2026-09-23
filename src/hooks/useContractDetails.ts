import { useQuery } from '@tanstack/react-query';
import { fetchContractDetails } from '../services/contractService';
import { getContractManagementKey } from '../services/contractManagementService';
import type { ContractDashboardRecord, ContractDetailItem, ContractDetailEmpenho } from '../types';

export interface ContractDetailsResult {
  items: ContractDetailItem[];
  empenhos: ContractDetailEmpenho[];
}

/**
 * Constrói as opções canônicas de query para consulta detalhada de itens e empenhos de um contrato.
 *
 * Query Key Canônica: ['contract-details', contractKey]
 *
 * `contract.id` já é a chave canônica (derivada por contractService.ts via
 * resolveContractKey), então é usado como fonte primária. O fallback via
 * getContractManagementKey() cobre apenas o caso defensivo de um `contract`
 * construído manualmente sem `.id` (ex.: fixtures de teste) — nunca há uma
 * SEGUNDA fórmula de identidade aqui, apenas a mesma função canônica
 * reaproveitada (ver src/utils/contractKeyUtils.ts).
 */
export function getContractDetailsQueryOptions(
  contract?: ContractDashboardRecord | null,
  enabled: boolean = false
) {
  const contractKey = contract ? (contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano)) : '';
  const isEnabled = Boolean(enabled && contract && contractKey);

  return {
    queryKey: ['contract-details', contractKey] as const,
    queryFn: async (): Promise<ContractDetailsResult> => {
      if (!contract) {
        return { items: [], empenhos: [] };
      }
      return fetchContractDetails(contract);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta sob demanda dos itens e empenhos de um contrato.
 *
 * Arquitetura:
 * UI / ContractCard -> useContractDetails(contract, isExpanded) -> fetchContractDetails() -> APIs Federais
 */
export function useContractDetails(
  contract?: ContractDashboardRecord | null,
  enabled: boolean = false
) {
  return useQuery<ContractDetailsResult, Error>(
    getContractDetailsQueryOptions(contract, enabled)
  );
}
