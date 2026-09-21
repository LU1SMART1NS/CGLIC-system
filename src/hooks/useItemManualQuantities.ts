import { useQuery } from '@tanstack/react-query';
import { fetchEmpenhoManualQuantitiesWithState, type ItemManualQuantitiesState } from '../services/allocationService';
import { normalizeItemKey } from '../utils/itemKeyUtils';

/**
 * Constrói as opções canônicas de query para consulta de overrides manuais de quantidades de empenhos.
 *
 * Query Key Canônica: ['item-manual-quantities', canonicalItemKey]
 */
export function getItemManualQuantitiesQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);
  const canonicalItemKey = isEnabled
    ? normalizeItemKey(numeroAta || '', uasg || '', numeroItem || '')
    : '';

  return {
    queryKey: ['item-manual-quantities', canonicalItemKey] as const,
    queryFn: async (): Promise<ItemManualQuantitiesState> => {
      if (!canonicalItemKey) {
        return { quantities: {}, version: 1 };
      }
      return fetchEmpenhoManualQuantitiesWithState(canonicalItemKey);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de quantidades de empenho ajustadas manualmente e controle de versão.
 *
 * Arquitetura:
 * UI / ItemBalances -> useItemManualQuantities() -> fetchEmpenhoManualQuantitiesWithState() -> PostgreSQL (empenho_manual_quantidades + item_manual_quantity_state)
 */
export function useItemManualQuantities(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<ItemManualQuantitiesState, Error>(
    getItemManualQuantitiesQueryOptions(numeroAta, uasg, numeroItem)
  );
}
