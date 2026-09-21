import { useQuery } from '@tanstack/react-query';
import { fetchManualEmpenhosWithState, type ItemManualEmpenhosState } from '../services/allocationService';
import { normalizeItemKey } from '../utils/itemKeyUtils';

/**
 * Constrói as opções canônicas de query para consulta de empenhos manuais e versão do agregado.
 *
 * Query Key Canônica: ['item-manual-empenhos', canonicalItemKey]
 */
export function getItemManualEmpenhosQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);
  const canonicalItemKey = isEnabled
    ? normalizeItemKey(numeroAta || '', uasg || '', numeroItem || '')
    : '';

  return {
    queryKey: ['item-manual-empenhos', canonicalItemKey] as const,
    queryFn: async (): Promise<ItemManualEmpenhosState> => {
      if (!canonicalItemKey) {
        return { empenhos: [], version: 1 };
      }
      return fetchManualEmpenhosWithState(canonicalItemKey);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de empenhos cadastrados manualmente e controle de versão.
 *
 * Arquitetura:
 * UI / ItemBalances -> useItemManualEmpenhos() -> fetchManualEmpenhosWithState() -> PostgreSQL (empenhos_manuais + item_manual_empenho_state)
 */
export function useItemManualEmpenhos(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<ItemManualEmpenhosState, Error>(
    getItemManualEmpenhosQueryOptions(numeroAta, uasg, numeroItem)
  );
}
