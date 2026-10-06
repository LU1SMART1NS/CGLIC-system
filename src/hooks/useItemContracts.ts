import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchPncpContracts, type ProvedorListaContratosGov } from '../services/api';
import type { PncpContract } from '../types';
import { cnpjDaUasg, UASGS_CGLIC } from '../config/unidadesGestoras';
import { getContractsDashboardQueryOptions } from './useContractsDashboard';

/**
 * Lista de contratos da UG no formato do Contratos.gov.br, lida do cache da tela e do banco (campo `raw` de
 * cada contrato). Só vale para as UASGs da CGLIC, cujos contratos são sincronizados; para outra UASG devolve
 * null e a busca baixa da API. Sem isso, abrir o item baixava ~3 MB do Contratos.gov.br (20 a 35 s) só para
 * sugerir contratos.
 */
export function criarProvedorListaContratosGov(queryClient: QueryClient): ProvedorListaContratosGov {
  return async (uasg) => {
    if (!UASGS_CGLIC.includes(uasg)) return null;
    const contratos = await queryClient.ensureQueryData(getContractsDashboardQueryOptions(uasg));
    // Só os registros que vieram da lista do Contratos.gov.br (têm licitacao_numero); os do Compras.gov.br não.
    const lista = contratos
      .map((c) => c.raw)
      .filter((raw) => raw && typeof raw === 'object' && 'licitacao_numero' in raw);
    return lista.length > 0 ? lista : null;
  };
}

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
  numeroAtaRegistroPreco?: string,
  listaContratosGov?: ProvedorListaContratosGov
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
        numeroAtaRegistroPreco || numeroAta,
        listaContratosGov
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
  const queryClient = useQueryClient();
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
      numeroAtaRegistroPreco,
      criarProvedorListaContratosGov(queryClient)
    )
  );
}
