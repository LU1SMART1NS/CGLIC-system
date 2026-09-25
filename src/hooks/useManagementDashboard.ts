import { useQuery } from '@tanstack/react-query';
import { fetchManagementDashboardData } from '../services/dashboardService';
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
    statusContrato: filtersOrUasg?.statusContrato ?? urlFilters.statusContrato
  };
}

export const MANAGEMENT_DASHBOARD_QUERY_KEY = (filters?: string | ManagementDashboardFilters) => {
  const norm = normalizeDashboardFilters(filters);
  return [
    'management-dashboard',
    norm.uasg || '200331',
    norm.contractKey || 'ALL',
    norm.numeroAta || 'ALL',
    norm.statusContrato || 'ALL'
  ] as const;
};

export function getManagementDashboardQueryOptions(
  filtersOrUasg?: string | ManagementDashboardFilters,
  currentDate?: Date
) {
  const norm = normalizeDashboardFilters(filtersOrUasg);
  return {
    queryKey: MANAGEMENT_DASHBOARD_QUERY_KEY(norm),
    queryFn: async () => fetchManagementDashboardData(norm, currentDate),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  };
}

/**
 * Hook do React Query para carregamento determinístico do Read Model do Dashboard Gerencial
 * (SaldoARP 3.0 — Fase 8-B/8-I)
 */
export function useManagementDashboard(
  filtersOrUasg?: string | ManagementDashboardFilters
): UseManagementDashboardResult {
  const options = getManagementDashboardQueryOptions(filtersOrUasg);

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
