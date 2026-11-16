import { useQuery } from '@tanstack/react-query';
import { fetchUnidadesItem } from '../services/api';
import { lerCopiaDoItem, lerCopiaUnidadesItem, type CopiaDoItem } from '../services/unidadesItensSyncService';
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
  /** A cópia está na tela enquanto o Compras.gov.br ainda responde; a lista de agora a substitui ao chegar. */
  conferindo?: boolean;
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

/** Cópia de órgãos e adesões guardada pelo servidor (uma leitura por item, compartilhada pelas duas consultas). */
export function getCopiaDoItemQueryOptions(itemKey: string) {
  return {
    queryKey: ['item-copia', itemKey] as const,
    queryFn: () => lerCopiaDoItem(itemKey),
    enabled: Boolean(itemKey),
    staleTime: 5 * 60 * 1000,
    retry: 1
  };
}

/**
 * Lista da tela: a do Compras.gov.br quando já respondeu; antes disso, a cópia do servidor marcada como "conferindo".
 * Sem nenhuma das duas, ainda não há lista (carregando).
 */
export function escolherUnidades(aoVivo: UnidadesDoItem | undefined, copia: CopiaDoItem | undefined): UnidadesDoItem | undefined {
  if (aoVivo) return aoVivo;
  if (copia?.unidades) return { unidades: copia.unidades.unidades, origem: 'COPIA', copiadoEm: copia.unidades.copiadoEm, conferindo: true };
  return undefined;
}

/**
 * Hook canônico do React Query para consulta de Unidades Participantes e Gerenciadora do Item de ARP.
 *
 * Query Key Canônica: ['item-unidades', numeroAta, uasg, numeroItem]
 *
 * Arquitetura:
 * UI / Component -> useItemUnidades() -> fetchUnidadesItem() -> API Compras.gov.br / Proxy
 *                                     -> (API vazia) itens_ata_unidades_copia (migration 91)
 * A cópia é lida também em paralelo (['item-copia', itemKey]): a aba abre com ela e troca pela lista de agora quando
 * o Compras.gov.br responde. `copia` leva também as adesões guardadas, para a aba Adesões fazer o mesmo.
 */
export function useItemUnidades(numeroAta?: string, uasg?: string, numeroItem?: string) {
  const aoVivo = useQuery<UnidadesDoItem, Error>(getItemUnidadesQueryOptions(numeroAta, uasg, numeroItem));
  const itemKey = numeroAta && uasg && numeroItem ? normalizeItemKey(numeroAta.trim(), uasg.trim(), numeroItem.trim()) : '';
  const copia = useQuery<CopiaDoItem, Error>(getCopiaDoItemQueryOptions(itemKey));
  // A cópia que falhou não atrapalha: a tela espera o Compras.gov.br, como antes.
  const copiaLida = copia.isError ? undefined : copia.data;
  const data = escolherUnidades(aoVivo.data, copiaLida);
  return {
    data,
    isLoading: aoVivo.isLoading && !data,
    conferindo: Boolean(data?.conferindo),
    error: aoVivo.error,
    copia: copiaLida
  };
}
