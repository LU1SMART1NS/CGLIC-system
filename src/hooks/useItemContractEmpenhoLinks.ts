import { useQuery } from '@tanstack/react-query';
import { fetchContratoEmpenhoLinks } from '../services/allocationService';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import type { ContratoEmpenho } from '../types';

/**
 * Constrói as opções canônicas de query para consulta de vínculos associativos Contrato <-> Empenho.
 *
 * Query Key Canônica: ['item-contract-empenho-links', canonicalItemKey]
 */
export function getItemContractEmpenhoLinksQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);
  const canonicalItemKey = isEnabled
    ? normalizeItemKey(numeroAta || '', uasg || '', numeroItem || '')
    : '';

  return {
    queryKey: ['item-contract-empenho-links', canonicalItemKey] as const,
    queryFn: async (): Promise<ContratoEmpenho[]> => {
      if (!canonicalItemKey) {
        return [];
      }
      return fetchContratoEmpenhoLinks(canonicalItemKey);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de vínculos associativos entre Contratos Manuais e Empenhos.
 *
 * Arquitetura:
 * UI / ItemBalances -> useItemContractEmpenhoLinks() -> fetchContratoEmpenhoLinks() -> PostgreSQL (contrato_empenho_links)
 */
export function useItemContractEmpenhoLinks(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<ContratoEmpenho[], Error>(
    getItemContractEmpenhoLinksQueryOptions(numeroAta, uasg, numeroItem)
  );
}
