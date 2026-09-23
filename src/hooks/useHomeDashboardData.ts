import { useQuery } from '@tanstack/react-query';
import { useContractsDashboard } from './useContractsDashboard';
import { fetchArpsFromDb } from '../services/dbCacheService';
import { getLastSyncMetadata } from '../services/syncService';
import type { ArpRecord, ContractDashboardRecord, SyncMetadata } from '../types';

export interface ExpiringContractItem {
  contract: ContractDashboardRecord;
  diasRestantes: number;
}

export interface HomeDashboardKPIs {
  totalArps: number;
  activeArps: number;
  totalContracts: number;
  activeContracts: number;
  expiringContractsCount: number;
  totalContractValue: number;
  expiringContracts: ExpiringContractItem[];
}

export interface HomeDashboardData extends HomeDashboardKPIs {
  syncInfo: SyncMetadata;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

import { parseDateBRT, differenceInDays } from '../services/temporalEngineService';

export function getDaysRemaining(dataFim?: string): number | null {
  if (!dataFim) return null;
  const target = parseDateBRT(dataFim);
  if (!target) return null;
  return differenceInDays(target);
}

/**
 * Função pura de cálculo dos indicadores consolidados para a Home
 */
export function calculateHomeDashboardKPIs(
  contracts: ContractDashboardRecord[] = [],
  arps: ArpRecord[] = [],
  fallbackTotalArps: number = 0
): HomeDashboardKPIs {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeArps = arps.filter((arp) => {
    if (!arp.dataVigenciaFinal) return false;
    const fim = new Date(arp.dataVigenciaFinal);
    return !isNaN(fim.getTime()) && fim >= today;
  }).length;

  let activeContracts = 0;
  let totalContractValue = 0;
  const expiringContracts: ExpiringContractItem[] = [];

  contracts.forEach((contract) => {
    const isVigente = contract.statusVigencia === 'Vigente' || contract.statusVigencia === 'A Vencer (60d)';
    if (isVigente) {
      activeContracts++;
    }

    if (typeof contract.valorGlobal === 'number' && !isNaN(contract.valorGlobal)) {
      totalContractValue += contract.valorGlobal;
    }

    const dias = getDaysRemaining(contract.dataVigenciaFim);
    if (typeof dias === 'number' && dias >= 0 && dias <= 90) {
      expiringContracts.push({
        contract,
        diasRestantes: dias
      });
    }
  });

  expiringContracts.sort((a, b) => a.diasRestantes - b.diasRestantes);

  return {
    totalArps: arps.length || fallbackTotalArps,
    activeArps: arps.length > 0 ? activeArps : fallbackTotalArps,
    totalContracts: contracts.length,
    activeContracts,
    expiringContractsCount: expiringContracts.length,
    totalContractValue,
    expiringContracts
  };
}

export function useHomeDashboardData(uasg: string = '200331'): HomeDashboardData {
  // Contratos via hook React Query padrão
  const {
    data: contracts = [],
    isLoading: loadingContracts,
    isError: errorContracts,
    refetch: refetchContracts
  } = useContractsDashboard(uasg);

  // Atas em cache local via React Query
  const {
    data: arpsData,
    isLoading: loadingArps,
    isError: errorArps,
    refetch: refetchArps
  } = useQuery({
    queryKey: ['home-arps-summary', uasg],
    queryFn: async () => {
      const res = await fetchArpsFromDb(uasg);
      return res;
    },
    staleTime: 5 * 60 * 1000
  });

  const arps = arpsData?.arps || [];
  const syncInfo = arpsData?.syncInfo || getLastSyncMetadata();

  const kpis = calculateHomeDashboardKPIs(contracts, arps, syncInfo.totalAtas ?? 0);

  return {
    ...kpis,
    syncInfo,
    isLoading: loadingContracts || loadingArps,
    isError: errorContracts || errorArps,
    refetch: () => {
      refetchContracts();
      refetchArps();
    }
  };
}
