import { useQuery } from '@tanstack/react-query';
import { fetchUnidadesItem } from '../services/api';
import type { UnidadeItemRecord, ArpRecord, ArpItemRecord } from '../types';

/**
 * Constrói as opções canônicas de query para consulta de unidades de um item.
 */
export function getItemUnidadesQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string,
  arp?: Partial<ArpRecord> | null,
  item?: Partial<ArpItemRecord> | null
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);

  return {
    queryKey: ['item-unidades', numeroAta || '', uasg || '', numeroItem || ''] as const,
    queryFn: async (): Promise<UnidadeItemRecord[]> => {
      if (!numeroAta || !uasg || !numeroItem) {
        return [];
      }

      const cleanAta = numeroAta.trim();
      const cleanUasg = uasg.trim();
      const cleanItem = numeroItem.trim();

      const response = await fetchUnidadesItem(cleanAta, cleanUasg, cleanItem);

      if (response.resultado && response.resultado.length > 0) {
        return response.resultado;
      }

      // Fallback gracioso para a Unidade Gerenciadora quando a API não retorna linhas específicas
      const defaultUasg = cleanUasg || '200331';
      const defaultQtd = item?.quantidadeHomologadaItem || 0;
      const defaultMaxAdesao = item?.maximoAdesao || 0;

      return [
        {
          numeroAta: cleanAta,
          unidadeGerenciadora: defaultUasg,
          numeroItem: cleanItem,
          codigoPdm: String(item?.codigoPdm || ''),
          descricaoItem: item?.descricaoItem || '',
          fornecedor: item?.nomeRazaoSocialFornecedor || '',
          codigoUnidade: defaultUasg,
          nomeUnidade: arp?.nomeUnidadeGerenciadora || arp?.nomeOrgao || 'MINISTERIO DA JUSTICA E SEGURANCA PUBLICA',
          tipoUnidade: 'GERENCIADORA',
          quantidadeRegistrada: defaultQtd,
          saldoRemanejamentoEmpenho: defaultQtd,
          saldoAdesoes: 0,
          qtdLimiteAdesao: defaultMaxAdesao,
          qtdLimiteInformadoCompra: defaultMaxAdesao,
          aceitaAdesao: defaultMaxAdesao > 0,
          dataHoraInclusao: new Date().toISOString(),
          dataHoraAtualizacao: new Date().toISOString(),
          dataHoraExclusao: null
        }
      ];
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
 */
export function useItemUnidades(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string,
  arp?: Partial<ArpRecord> | null,
  item?: Partial<ArpItemRecord> | null
) {
  return useQuery<UnidadeItemRecord[], Error>(
    getItemUnidadesQueryOptions(numeroAta, uasg, numeroItem, arp, item)
  );
}

