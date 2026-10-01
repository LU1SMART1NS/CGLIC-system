import { useQuery } from '@tanstack/react-query';
import { fetchDismissedContractSuggestions } from '../services/arpContractLinkService';
import type { ArpItemContractDismissal } from '../types/arpContractLinks';

/**
 * Sugestões de contrato descartadas para um item de ARP.
 *
 * Query Key Canônica: ['item-contract-dismissals', canonicalItemKey]
 */
export function useDismissedContractSuggestions(canonicalItemKey?: string) {
  const key = (canonicalItemKey || '').trim();
  return useQuery<ArpItemContractDismissal[], Error>({
    queryKey: ['item-contract-dismissals', key] as const,
    queryFn: () => fetchDismissedContractSuggestions(key),
    enabled: Boolean(key),
    staleTime: 5 * 60 * 1000
  });
}
