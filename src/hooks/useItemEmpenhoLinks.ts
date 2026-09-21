import { useQuery } from '@tanstack/react-query';
import { fetchEmpenhoLinksWithState, type ItemEmpenhoLinksState } from '../services/allocationService';
import { normalizeItemKey } from '../utils/itemKeyUtils';

/**
 * Constrói as opções canônicas de query para consulta de vínculos de empenhos e versão do agregado.
 *
 * Query Key Canônica: ['item-empenho-links', canonicalItemKey]
 */
export function getItemEmpenhoLinksQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);
  const canonicalItemKey = isEnabled
    ? normalizeItemKey(numeroAta || '', uasg || '', numeroItem || '')
    : '';

  return {
    queryKey: ['item-empenho-links', canonicalItemKey] as const,
    queryFn: async (): Promise<ItemEmpenhoLinksState> => {
      if (!canonicalItemKey) {
        return { links: {}, version: 1 };
      }
      return fetchEmpenhoLinksWithState(canonicalItemKey);
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de vínculos de empenhos a diretorias internas e controle de versão.
 *
 * Arquitetura:
 * UI / ItemBalances -> useItemEmpenhoLinks() -> fetchEmpenhoLinksWithState() -> PostgreSQL (empenho_links + item_empenho_link_state)
 */
export function useItemEmpenhoLinks(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<ItemEmpenhoLinksState, Error>(
    getItemEmpenhoLinksQueryOptions(numeroAta, uasg, numeroItem)
  );
}
