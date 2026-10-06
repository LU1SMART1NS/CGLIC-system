import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchContratosParaTela } from '../services/contratosOficiaisService';
import type { ContractDashboardRecord } from '../types';

/**
 * A lista só muda quando há sincronização com as fontes oficiais, e a sincronização invalida esta
 * query ao terminar (useSincronizacaoContratos). Por isso a validade é longa e não há recarga sozinha.
 */
export const CONTRACTS_STALE_TIME_MS = 30 * 60 * 1000;
export const CONTRACTS_GC_TIME_MS = 60 * 60 * 1000;

/**
 * Constrói as opções canônicas de query para o Dashboard de Contratos.
 *
 * Query Key Canônica: ['contracts-dashboard', uasg]
 */
export function getContractsDashboardQueryOptions(uasg?: string) {
  const cleanUasg = (uasg || '').trim();

  return {
    queryKey: ['contracts-dashboard', cleanUasg] as const,
    queryFn: async (): Promise<ContractDashboardRecord[]> => fetchContratosParaTela(cleanUasg),
    enabled: Boolean(cleanUasg),
    staleTime: CONTRACTS_STALE_TIME_MS,
    gcTime: CONTRACTS_GC_TIME_MS,
    refetchOnWindowFocus: false
  };
}

/**
 * Hook canônico do React Query para listagem de contratos administrativos.
 *
 * Arquitetura:
 * UI -> useContractsDashboard(uasg) -> fetchContratosParaTela() -> Supabase (contratos_oficiais)
 * As APIs federais só são consultadas pela sincronização (contratosOficiaisService) ou quando o banco
 * ainda não tem a carteira.
 *
 * `refresh` relê o banco. Quem atualiza com as fontes oficiais é useSincronizacaoContratos.
 */
export function useContractsDashboard(uasg?: string) {
  const queryClient = useQueryClient();
  const cleanUasg = (uasg || '').trim();

  const query = useQuery<ContractDashboardRecord[], Error>(
    getContractsDashboardQueryOptions(cleanUasg)
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['contracts-dashboard', cleanUasg] });
  };

  return {
    ...query,
    refresh
  };
}
