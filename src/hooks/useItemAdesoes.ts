import { useQuery } from '@tanstack/react-query';
import { fetchAdesoesItem } from '../services/api';
import type { AdesaoItemRecord } from '../types';

/**
 * Constrói as opções canônicas de query para consulta de adesões (caronas externas) de um item de ARP.
 *
 * Query Key Canônica: ['item-adesoes', numeroAta, uasg, numeroItem]
 */
export function getItemAdesoesQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);

  return {
    queryKey: ['item-adesoes', numeroAta || '', uasg || '', numeroItem || ''] as const,
    queryFn: async (): Promise<AdesaoItemRecord[]> => {
      if (!numeroAta || !uasg || !numeroItem) {
        return [];
      }

      // A API já filtra pelo item e não devolve numeroItem nos registros.
      const response = await fetchAdesoesItem(numeroAta.trim(), uasg.trim(), numeroItem.trim());
      return response.resultado || [];
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de adesões (caronas externas) de um item de ARP.
 *
 * Arquitetura:
 * UI / Component -> useItemAdesoes() -> fetchAdesoesItem() -> API Compras.gov.br / Proxy
 */
export function useItemAdesoes(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<AdesaoItemRecord[], Error>(
    getItemAdesoesQueryOptions(numeroAta, uasg, numeroItem)
  );
}
