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

      const cleanAta = numeroAta.trim();
      const cleanUasg = uasg.trim();
      const cleanItem = numeroItem.trim();

      const response = await fetchAdesoesItem(cleanAta, cleanUasg, cleanItem);
      const records = response.resultado || [];

      const targetItemNum = parseInt(cleanItem, 10);
      const filtered = records.filter(rec => {
        const recItemNum = parseInt(rec.numeroItem, 10);
        return recItemNum === targetItemNum || rec.numeroItem === cleanItem || !rec.numeroItem;
      });

      return filtered;
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
