import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useContractsDashboard } from './useContractsDashboard';
import { useAllContractManagers } from './useAllContractManagers';
import { fetchArpsFromDb } from '../services/dbCacheService';
import { fetchAllContractTaskPlans } from '../services/contractManagementService';
import {
  buildCentralPrazosItems,
  calculateCentralPrazosKPIs,
  filterCentralPrazosItems
} from '../services/centralPrazosService';
import type {
  CentralPrazosItem,
  CentralPrazosKPIs,
  CentralPrazosFilterParams
} from '../types/centralPrazos';

export interface CentralPrazosData {
  items: CentralPrazosItem[];
  rawItems: CentralPrazosItem[];
  kpis: CentralPrazosKPIs;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  filters: CentralPrazosFilterParams;
  setFilters: React.Dispatch<React.SetStateAction<CentralPrazosFilterParams>>;
  resetFilters: () => void;
}

export const DEFAULT_CENTRAL_PRAZOS_FILTERS: CentralPrazosFilterParams = {
  tab: 'TODAS',
  busca: '',
  responsavel: '',
  uasg: '',
  entidadeTipo: 'TODOS',
  statusTarefa: 'TODOS',
  nivelAtencao: 'TODOS'
};

export function useCentralPrazosData(uasg: string = '200331'): CentralPrazosData {
  const cleanUasg = uasg?.trim() || '200331';
  const [filters, setFilters] = useState<CentralPrazosFilterParams>(DEFAULT_CENTRAL_PRAZOS_FILTERS);

  // 1. Contratos oficiais e manuais
  const {
    data: contracts = [],
    isLoading: loadingContracts,
    isError: errorContracts,
    refetch: refetchContracts
  } = useContractsDashboard(cleanUasg);

  // 2. ARPs / Atas em cache local
  const {
    data: arpsData,
    isLoading: loadingArps,
    isError: errorArps,
    refetch: refetchArps
  } = useQuery({
    queryKey: ['central-prazos-arps', cleanUasg],
    queryFn: async () => fetchArpsFromDb(cleanUasg),
    staleTime: 5 * 60 * 1000
  });

  // 3. Gestores de Contratos
  const {
    data: managers = {},
    isLoading: loadingManagers,
    isError: errorManagers,
    refetch: refetchManagers
  } = useAllContractManagers(cleanUasg);

  // 4. Planos de Gestão de Contratos e Tarefas
  const {
    data: plans = {},
    isLoading: loadingPlans,
    isError: errorPlans,
    refetch: refetchPlans
  } = useQuery({
    queryKey: ['all-contract-task-plans', cleanUasg],
    queryFn: async () => fetchAllContractTaskPlans(cleanUasg),
    staleTime: 60 * 1000
  });

  const arps = arpsData?.arps || [];

  // Construção determinística dos itens agregados
  const rawItems = useMemo(() => {
    return buildCentralPrazosItems({
      contracts,
      arps,
      managers,
      plans
    });
  }, [contracts, arps, managers, plans]);

  // Cálculo dos KPIs consolidados
  const kpis = useMemo(() => {
    return calculateCentralPrazosKPIs(rawItems);
  }, [rawItems]);

  // Aplicação dos filtros operacionais
  const items = useMemo(() => {
    return filterCentralPrazosItems(rawItems, filters);
  }, [rawItems, filters]);

  const resetFilters = () => {
    setFilters(DEFAULT_CENTRAL_PRAZOS_FILTERS);
  };

  const refetch = () => {
    refetchContracts();
    refetchArps();
    refetchManagers();
    refetchPlans();
  };

  return {
    items,
    rawItems,
    kpis,
    isLoading: loadingContracts || loadingArps || loadingManagers || loadingPlans,
    isError: errorContracts || errorArps || errorManagers || errorPlans,
    refetch,
    filters,
    setFilters,
    resetFilters
  };
}
