import { useQuery } from '@tanstack/react-query';
import type { ContractDashboardRecord, ContractEvent } from '../types';
import { buildContractEventsFromOfficialData } from '../services/contractEventService';
import { getContractManagementKey } from '../services/contractManagementService';

/**
 * Constrói as opções canônicas de query para os Eventos Formais de um Contrato (Fase 5.3).
 *
 * Query Key Canônica: ['contract-events', contractKey]
 */
export function getContractEventsQueryOptions(
  contract?: ContractDashboardRecord | null,
  enabled: boolean = true
) {
  const contractKey = contract
    ? contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano)
    : '';

  const isEnabled = Boolean(enabled && contract && contractKey);

  return {
    queryKey: ['contract-events', contractKey] as const,
    queryFn: async (): Promise<ContractEvent[]> => {
      if (!contract) return [];

      // Extrai aditivos oficiais quando disponíveis nos dados oficiais brutos do contrato
      const aditivosRaw = Array.isArray(contract.raw?.termos_aditivos)
        ? contract.raw.termos_aditivos
        : Array.isArray(contract.raw?.aditivos)
        ? contract.raw.aditivos
        : [];

      return buildContractEventsFromOfficialData(contract, aditivosRaw);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta dos eventos formais do contrato (Timeline 360°).
 */
export function useContractEvents(
  contract?: ContractDashboardRecord | null,
  enabled: boolean = true
) {
  return useQuery<ContractEvent[], Error>(getContractEventsQueryOptions(contract, enabled));
}
