import { useQuery } from '@tanstack/react-query';
import { fetchManualContratos } from '../services/allocationService';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import type { Contrato } from '../types';

/**
 * Constrói as opções canônicas de query para consulta de contratos manuais cadastrados para o item.
 *
 * Query Key Canônica: ['item-manual-contracts', canonicalItemKey]
 */
export function getItemManualContractsQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);
  const canonicalItemKey = isEnabled
    ? normalizeItemKey(numeroAta || '', uasg || '', numeroItem || '')
    : '';

  return {
    queryKey: ['item-manual-contracts', canonicalItemKey] as const,
    queryFn: async (): Promise<Contrato[]> => {
      if (!canonicalItemKey) {
        return [];
      }
      return fetchManualContratos(canonicalItemKey);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de contratos manuais cadastrados para o item.
 *
 * Arquitetura:
 * UI / ItemBalances -> useItemManualContracts() -> fetchManualContratos() -> PostgreSQL (contratos_manuais)
 */
export function useItemManualContracts(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<Contrato[], Error>(
    getItemManualContractsQueryOptions(numeroAta, uasg, numeroItem)
  );
}
