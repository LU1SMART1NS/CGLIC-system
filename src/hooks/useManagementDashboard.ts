import { useQuery, keepPreviousData, type QueryClient, type QueryFunctionContext } from '@tanstack/react-query';
import { fetchManagementDashboardData, type FontesDoPainelNoCache } from '../services/dashboardService';
import { getContractsDashboardQueryOptions } from './useContractsDashboard';
import { getAllContractManagersQueryOptions } from './useAllContractManagers';
import { getAtaSourceQueryOptions } from './useAta';
import type {
  ManagementDashboardReadModel,
  ManagementDashboardFilters
} from '../types/managementDashboard';

export interface UseManagementDashboardResult {
  readModel: ManagementDashboardReadModel | null;
  data: ManagementDashboardReadModel | undefined;
  isLoading: boolean;
  isFetching?: boolean;
  dataUpdatedAt?: number;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
}

export function parseFiltersFromUrl(): Partial<ManagementDashboardFilters> {
  if (typeof window === 'undefined' || !window.location || !window.location.search) {
    return {};
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const filters: Partial<ManagementDashboardFilters> = {};
    const uasg = params.get('uasg');
    const contractKey = params.get('contractKey');
    const numeroAta = params.get('numeroAta');
    const statusContrato = params.get('statusContrato');

    if (uasg) filters.uasg = uasg.trim();
    if (contractKey) filters.contractKey = contractKey.trim();
    if (numeroAta) filters.numeroAta = numeroAta.trim();
    if (statusContrato && (statusContrato === 'ATIVO' || statusContrato === 'ENCERRADO' || statusContrato === 'EM_PRORROGACAO' || statusContrato === 'TODOS')) {
      filters.statusContrato = statusContrato as ManagementDashboardFilters['statusContrato'];
    }
    return filters;
  } catch {
    return {};
  }
}

export function normalizeDashboardFilters(filtersOrUasg?: string | ManagementDashboardFilters): ManagementDashboardFilters {
  const urlFilters = parseFiltersFromUrl();
  if (typeof filtersOrUasg === 'string') {
    return {
      uasg: filtersOrUasg.trim() || urlFilters.uasg || '200331',
      contractKey: urlFilters.contractKey,
      numeroAta: urlFilters.numeroAta,
      statusContrato: urlFilters.statusContrato
    };
  }
  return {
    uasg: (filtersOrUasg?.uasg || urlFilters.uasg || '200331').trim(),
    contractKey: filtersOrUasg?.contractKey ?? urlFilters.contractKey,
    numeroAta: filtersOrUasg?.numeroAta ?? urlFilters.numeroAta,
    statusContrato: filtersOrUasg?.statusContrato ?? urlFilters.statusContrato,
    assignedContractKeys: filtersOrUasg?.assignedContractKeys,
    assignedAtaKeys: filtersOrUasg?.assignedAtaKeys
  };
}

export const MANAGEMENT_DASHBOARD_QUERY_KEY = (filters?: string | ManagementDashboardFilters) => {
  const norm = normalizeDashboardFilters(filters);
  return [
    'management-dashboard',
    norm.uasg || '200331',
    norm.contractKey || 'ALL',
    norm.numeroAta || 'ALL',
    norm.statusContrato || 'ALL',
    // Entra na chave para não vazar cache entre usuários/perfis distintos
    // (ex.: dois gestores com carteiras diferentes na mesma sessão de dev).
    norm.assignedContractKeys ? [...norm.assignedContractKeys].sort().join(',') : 'GLOBAL',
    norm.assignedAtaKeys ? [...norm.assignedAtaKeys].sort().join(',') : 'GLOBAL'
  ] as const;
};

/**
 * Contratos, gestores e atas do painel lidos pelo cache, com as mesmas opções de useContractsDashboard,
 * useAllContractManagers e getAtaSourceQueryOptions: a página e o menu leem os mesmos dados, e antes o painel os lia
 * de novo por fora do cache. fetchQuery (e não ensureQueryData) porque ele relê o que foi invalidado: depois de
 * "Atualizar" ou do fim de uma sincronização o painel não pode montar com a lista antiga.
 */
export function fontesDoPainelNoCache(client: QueryClient): FontesDoPainelNoCache {
  return {
    contratos: (uasg) => client.fetchQuery(getContractsDashboardQueryOptions(uasg)),
    gestores: (uasg) => client.fetchQuery(getAllContractManagersQueryOptions(uasg)),
    atas: (uasg) => client.fetchQuery(getAtaSourceQueryOptions(uasg))
  };
}

export function getManagementDashboardQueryOptions(
  filtersOrUasg?: string | ManagementDashboardFilters,
  currentDate?: Date
) {
  const norm = normalizeDashboardFilters(filtersOrUasg);
  return {
    queryKey: MANAGEMENT_DASHBOARD_QUERY_KEY(norm),
    queryFn: async (ctx?: Pick<QueryFunctionContext, 'client'>) =>
      fetchManagementDashboardData(norm, currentDate, ctx?.client ? fontesDoPainelNoCache(ctx.client) : undefined),
    // Todas as fontes vêm do banco; a sincronização de contratos invalida esta query ao terminar.
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Se um recarregamento falhar (fonte soberana estourando o tempo sob carga),
    // mantém o último Read Model bom na tela em vez de piscar contagens vazias,
    // enquanto o React Query tenta de novo. Evita os avisos "sumirem" da tela.
    placeholderData: keepPreviousData,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000)
  };
}

/**
 * Hook do React Query para carregamento determinístico do Read Model do Dashboard Gerencial
 * (CGLIC 3.0 — Fase 8-B/8-I)
 */
export function useManagementDashboard(
  filtersOrUasg?: string | ManagementDashboardFilters,
  opts: { enabled?: boolean } = {}
): UseManagementDashboardResult {
  const options = { ...getManagementDashboardQueryOptions(filtersOrUasg), enabled: opts.enabled ?? true };

  const {
    data,
    isLoading,
    isFetching,
    dataUpdatedAt,
    isError,
    error,
    refetch
  } = useQuery<ManagementDashboardReadModel, Error>(options);

  return {
    readModel: data ?? null,
    data,
    isLoading,
    isFetching,
    dataUpdatedAt,
    isError,
    error: error ?? null,
    refetch,
    refresh: refetch
  };
}
