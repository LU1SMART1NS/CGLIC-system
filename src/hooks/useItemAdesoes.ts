import { useQuery } from '@tanstack/react-query';
import { fetchAdesoesItem } from '../services/api';
import { lerCopiaAdesoesItem, type CopiaAdesoesItem } from '../services/unidadesItensSyncService';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import type { AdesaoItemRecord } from '../types';
import type { OrigemUnidadesItem } from './useItemUnidades';

export interface LeituraAdesoesItem {
  /** O que o Compras.gov.br devolveu agora. */
  aoVivo: AdesaoItemRecord[];
  /** Última lista guardada pelo servidor; só lida quando a API voltou vazia. */
  copia: CopiaAdesoesItem | null;
}

export interface AdesoesDoItem {
  adesoes: AdesaoItemRecord[];
  /** API: lista de agora (vazia = sem adesão); COPIA: lista guardada; SEM_DADOS: não dá para saber. */
  origem: OrigemUnidadesItem;
  copiadoEm: string | null;
}

/**
 * Decide a lista de adesões da tela. Um item sem carona devolve vazio de verdade, então a resposta
 * vazia só vale como "nenhuma adesão" quando a consulta de órgãos do mesmo item respondeu agora
 * (`origemUnidades` = API). Com a API fora do ar, vale a cópia guardada; sem cópia, fica sem dados.
 */
export function escolherAdesoes(leitura: LeituraAdesoesItem | undefined, origemUnidades: OrigemUnidadesItem | undefined): AdesoesDoItem {
  const aoVivo = leitura?.aoVivo ?? [];
  if (aoVivo.length > 0 || origemUnidades === 'API') return { adesoes: aoVivo, origem: 'API', copiadoEm: null };
  if (leitura?.copia) return { adesoes: leitura.copia.adesoes, origem: 'COPIA', copiadoEm: leitura.copia.copiadoEm };
  return { adesoes: [], origem: 'SEM_DADOS', copiadoEm: null };
}

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
    queryFn: async (): Promise<LeituraAdesoesItem> => {
      if (!numeroAta || !uasg || !numeroItem) {
        return { aoVivo: [], copia: null };
      }

      // A API já filtra pelo item e não devolve numeroItem nos registros.
      const response = await fetchAdesoesItem(numeroAta.trim(), uasg.trim(), numeroItem.trim());
      const aoVivo = response.resultado || [];
      if (aoVivo.length > 0) return { aoVivo, copia: null };

      let copia: CopiaAdesoesItem | null = null;
      try {
        copia = await lerCopiaAdesoesItem(normalizeItemKey(numeroAta, uasg, numeroItem));
      } catch (err) {
        console.warn('Falha ao ler a cópia das adesões do item.', err);
      }
      return { aoVivo, copia };
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
 *                                    -> (API vazia) itens_ata_unidades_copia.adesoes (migration 92)
 * A lista da tela sai de escolherAdesoes(), com a origem dos órgãos do mesmo item.
 */
export function useItemAdesoes(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string
) {
  return useQuery<LeituraAdesoesItem, Error>(
    getItemAdesoesQueryOptions(numeroAta, uasg, numeroItem)
  );
}
