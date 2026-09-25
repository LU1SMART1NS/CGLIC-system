import { useQuery } from '@tanstack/react-query';
import { fetchArpItemContractLinks } from '../services/arpContractLinkService';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import type { ArpItemContractLink } from '../types/arpContractLinks';

/**
 * Constrói as opções canônicas de query para consulta de contratos oficiais vinculados a um item de ARP.
 *
 * Query Key Canônica: ['item-contract-links', canonicalItemKey]
 */
export function getItemContractLinksQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string,
  rawItemKey?: string
) {
  let canonicalKey = '';
  if (rawItemKey && rawItemKey.trim()) {
    canonicalKey = rawItemKey.trim();
  } else if (numeroAta && uasg && numeroItem) {
    canonicalKey = normalizeItemKey(numeroAta, uasg, numeroItem);
  }

  const isEnabled = Boolean(canonicalKey);

  return {
    queryKey: ['item-contract-links', canonicalKey] as const,
    queryFn: async (): Promise<ArpItemContractLink[]> => {
      if (!canonicalKey) return [];
      return fetchArpItemContractLinks(canonicalKey);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook do React Query para consulta de contratos oficiais vinculados ao item da ARP.
 */
export function useItemContractLinks(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string,
  rawItemKey?: string
) {
  return useQuery<ArpItemContractLink[], Error>(
    getItemContractLinksQueryOptions(numeroAta, uasg, numeroItem, rawItemKey)
  );
}
