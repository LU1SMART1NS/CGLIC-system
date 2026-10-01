import { useQuery } from '@tanstack/react-query';
import { fetchPncpContracts } from '../services/api';
import type { PncpContract } from '../types';
import { cnpjDaUasg } from '../config/unidadesGestoras';

/**
 * Constrói as opções canônicas de query para consulta de contratos PNCP de um item de ARP.
 *
 * Query Key Canônica: ['item-contracts', numeroAta, uasg, numeroItem]
 */
export function getItemContractsQueryOptions(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string,
  cnpj?: string,
  ano?: string,
  sequencial?: string,
  sequencialAta?: string,
  fallbackParams?: any,
  fornecedorInfo?: any,
  numeroAtaRegistroPreco?: string
) {
  const isEnabled = Boolean(numeroAta && uasg && numeroItem);

  return {
    queryKey: ['item-contracts', numeroAta || '', uasg || '', numeroItem || ''] as const,
    queryFn: async (): Promise<PncpContract[]> => {
      if (!numeroAta || !uasg || !numeroItem) {
        return [];
      }

      // Sem ano ou sequencial da compra a consulta hierárquica do PNCP é pulada e vale o fallback por compra.
      const cleanCnpj = cnpj || cnpjDaUasg(uasg);
      const cleanAno = ano || '';
      const cleanSeq = sequencial || '';
      const cleanSeqAta = sequencialAta || '';

      const contracts = await fetchPncpContracts(
        cleanCnpj,
        cleanAno,
        cleanSeq,
        cleanSeqAta,
        numeroItem.trim(),
        fallbackParams,
        fornecedorInfo,
        numeroAtaRegistroPreco || numeroAta
      );

      return contracts || [];
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de contratos do item de ARP no PNCP/Contratos.gov.
 *
 * Arquitetura:
 * UI / ItemBalances -> useItemContracts() -> fetchPncpContracts() -> PNCP / Contratos.gov.br
 */
export function useItemContracts(
  numeroAta?: string,
  uasg?: string,
  numeroItem?: string,
  cnpj?: string,
  ano?: string,
  sequencial?: string,
  sequencialAta?: string,
  fallbackParams?: any,
  fornecedorInfo?: any,
  numeroAtaRegistroPreco?: string
) {
  return useQuery<PncpContract[], Error>(
    getItemContractsQueryOptions(
      numeroAta,
      uasg,
      numeroItem,
      cnpj,
      ano,
      sequencial,
      sequencialAta,
      fallbackParams,
      fornecedorInfo,
      numeroAtaRegistroPreco
    )
  );
}
