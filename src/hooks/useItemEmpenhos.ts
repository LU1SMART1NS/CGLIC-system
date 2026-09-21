import { useQuery } from '@tanstack/react-query';
import { fetchEmpenhosSaldoItem } from '../services/api';
import type { EmpenhoSaldoItemRecord } from '../types';

/**
 * Constrói as opções canônicas de query para consulta de empenhos oficiais de um item de ARP.
 *
 * Query Key Canônica: ['item-empenhos', numeroAta, uasg, numeroItem]
 */
export function getItemEmpenhosQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);

  return {
    queryKey: ['item-empenhos', numeroAta || '', uasg || '', numeroItem || ''] as const,
    queryFn: async (): Promise<EmpenhoSaldoItemRecord[]> => {
      if (!numeroAta || !uasg || !numeroItem) {
        return [];
      }

      const cleanAta = numeroAta.trim();
      const cleanUasg = uasg.trim();
      const cleanItem = numeroItem.trim();

      const response = await fetchEmpenhosSaldoItem(cleanAta, cleanUasg);
      const records = response.resultado || [];

      const targetItemNum = parseInt(cleanItem, 10);
      const filtered = records.filter(rec => {
        const recItemNum = parseInt(rec.numeroItem, 10);
        return recItemNum === targetItemNum || rec.numeroItem === cleanItem;
      });

      return filtered;
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de Empenhos Oficiais do Item de ARP.
 *
 * Arquitetura:
 * UI / Component -> useItemEmpenhos() -> fetchEmpenhosSaldoItem() -> API Compras.gov.br / Proxy
 */
export function useItemEmpenhos(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<EmpenhoSaldoItemRecord[], Error>(
    getItemEmpenhosQueryOptions(numeroAta, uasg, numeroItem)
  );
}
