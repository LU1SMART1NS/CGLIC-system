import { useQuery } from '@tanstack/react-query';
import { fetchAllocationsWithState, type ItemAllocationsState } from '../services/allocationService';
import { normalizeItemKey } from '../utils/itemKeyUtils';

/**
 * Constrói as opções canônicas de query para consulta de alocações e versão do agregado de um item de ARP.
 *
 * Query Key Canônica: ['item-allocations', canonicalItemKey]
 */
export function getItemAllocationsQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);
  const canonicalItemKey = isEnabled
    ? normalizeItemKey(numeroAta || '', uasg || '', numeroItem || '')
    : '';

  return {
    queryKey: ['item-allocations', canonicalItemKey] as const,
    queryFn: async (): Promise<ItemAllocationsState> => {
      if (!canonicalItemKey) {
        return { allocations: [], version: 1 };
      }
      return fetchAllocationsWithState(canonicalItemKey);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de alocações departamentais internas e controle de versão.
 *
 * Arquitetura:
 * UI / ItemBalances -> useItemAllocations() -> fetchAllocationsWithState() -> PostgreSQL (arp_allocations + item_allocation_state)
 */
export function useItemAllocations(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<ItemAllocationsState, Error>(
    getItemAllocationsQueryOptions(numeroAta, uasg, numeroItem)
  );
}
