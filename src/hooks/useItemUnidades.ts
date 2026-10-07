import { useQuery } from '@tanstack/react-query';
import { fetchUnidadesItem } from '../services/api';
import { lerCopiaUnidadesItem } from '../services/unidadesItensSyncService';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import type { UnidadeItemRecord } from '../types';

/**
 * De onde veio a lista de órgãos do item:
 * - API: Compras.gov.br agora;
 * - COPIA: a API voltou vazia e a lista é a última cópia guardada pelo servidor (com a data);
 * - SEM_DADOS: a API voltou vazia e ainda não há cópia. Nenhuma linha é montada no lugar.
 */
export type OrigemUnidadesItem = 'API' | 'COPIA' | 'SEM_DADOS';

export interface UnidadesDoItem {
  unidades: UnidadeItemRecord[];
  origem: OrigemUnidadesItem;
  /** Quando a cópia foi lida do Compras.gov.br (só na origem COPIA). */
  copiadoEm: string | null;
}

/**
 * Constrói as opções canônicas de query para consulta de unidades de um item.
 */
export function getItemUnidadesQueryOptions(numeroAta?: string, uasg?: string, numeroItem?: string) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);

  return {
    queryKey: ['item-unidades', numeroAta || '', uasg || '', numeroItem || ''] as const,
    queryFn: async (): Promise<UnidadesDoItem> => {
      if (!numeroAta || !uasg || !numeroItem) {
        return { unidades: [], origem: 'SEM_DADOS', copiadoEm: null };
      }

      const cleanAta = numeroAta.trim();
      const cleanUasg = uasg.trim();
      const cleanItem = numeroItem.trim();

      const response = await fetchUnidadesItem(cleanAta, cleanUasg, cleanItem);
      if (response.resultado && response.resultado.length > 0) {
        return { unidades: response.resultado, origem: 'API', copiadoEm: null };
      }

      // A API voltou vazia (fora do ar ou sem dados): usa a última lista guardada pelo servidor.
      let copia: Awaited<ReturnType<typeof lerCopiaUnidadesItem>> = null;
      try {
        copia = await lerCopiaUnidadesItem(normalizeItemKey(cleanAta, cleanUasg, cleanItem));
      } catch (err) {
        console.warn('Falha ao ler a cópia dos órgãos do item.', err);
      }
      return copia
        ? { unidades: copia.unidades, origem: 'COPIA', copiadoEm: copia.copiadoEm }
        : { unidades: [], origem: 'SEM_DADOS', copiadoEm: null };
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de Unidades Participantes e Gerenciadora do Item de ARP.
 *
 * Query Key Canônica: ['item-unidades', numeroAta, uasg, numeroItem]
 *
 * Arquitetura:
 * UI / Component -> useItemUnidades() -> fetchUnidadesItem() -> API Compras.gov.br / Proxy
 *                                     -> (API vazia) itens_ata_unidades_copia (migration 91)
 */
export function useItemUnidades(numeroAta?: string, uasg?: string, numeroItem?: string) {
  return useQuery<UnidadesDoItem, Error>(getItemUnidadesQueryOptions(numeroAta, uasg, numeroItem));
}
