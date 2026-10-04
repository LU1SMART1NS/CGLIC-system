import { useCallback, useMemo } from 'react';
import { useContractsDashboard, useContractsListPartial } from './useContractsDashboard';
import { useAssignedManagementScope } from './useAssignedManagementScope';
import { useAllContractManagers } from './useAllContractManagers';
import { useManagementDashboard } from './useManagementDashboard';
import { classifyPrazo } from '../components/carteira/carteiraPrazo';
import { getContractDaysRemaining } from '../services/dashboardService';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import type { ContractPortfolioRow } from '../components/contracts/portfolio/ContractsPortfolioTable';
import type { DashboardAttentionItem } from '../types/managementDashboard';

/** UASGs consolidadas — mesmo escopo já usado na Visão Geral (/instrumentos), para que os painéis reportem os mesmos números. */
const UASGS = UASGS_CGLIC;

/**
 * Carteira de Contratos das UASGs da CGLIC, no escopo do usuário: contratos enriquecidos com prazo,
 * gestor e pendências (Funil Único de Atenção). Mesmas consultas e parâmetros da Visão Geral, logo
 * mesmo cache do React Query. Fonte única para a Carteira de Contratos e a Central de Distribuição.
 */
export function useContractsPortfolio() {
  const dash200330 = useContractsDashboard(UASGS[0]);
  const dash200331 = useContractsDashboard(UASGS[1]);

  const allContracts = useMemo(
    () => [...(dash200330.data || []), ...(dash200331.data || [])],
    [dash200330.data, dash200331.data]
  );
  const isLoading = dash200330.isLoading || dash200331.isLoading;
  const isFetching = dash200330.isFetching || dash200331.isFetching;
  /** Uma das fontes não respondeu: os números podem estar abaixo do real até a próxima tentativa (automática). */
  const isPartial = useContractsListPartial([...UASGS]);
  const error = (dash200330.error || dash200331.error) as Error | null;
  const dataUpdatedAt = Math.max(dash200330.dataUpdatedAt || 0, dash200331.dataUpdatedAt || 0) || undefined;
  const refresh = useCallback(() => {
    dash200330.refresh();
    dash200331.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scope200330 = useAssignedManagementScope(UASGS[0]);
  const scope200331 = useAssignedManagementScope(UASGS[1]);
  const isLoadingScope = scope200330.isLoading || scope200331.isLoading;
  const assignedContractKeys = useMemo(() => {
    if (!scope200330.contractKeys && !scope200331.contractKeys) return undefined;
    return [...(scope200330.contractKeys || []), ...(scope200331.contractKeys || [])];
  }, [scope200330.contractKeys, scope200331.contractKeys]);

  const contracts = useMemo(() => {
    if (!assignedContractKeys) return allContracts;
    const scopedKeys = new Set(assignedContractKeys);
    return allContracts.filter((contract) => scopedKeys.has(contract.id));
  }, [allContracts, assignedContractKeys]);

  const managers200330 = useAllContractManagers(UASGS[0]);
  const managers200331 = useAllContractManagers(UASGS[1]);
  const mgmt200330 = useManagementDashboard({
    uasg: UASGS[0],
    assignedContractKeys: scope200330.contractKeys,
    assignedAtaKeys: scope200330.ataKeys
  });
  const mgmt200331 = useManagementDashboard({
    uasg: UASGS[1],
    assignedContractKeys: scope200331.contractKeys,
    assignedAtaKeys: scope200331.ataKeys
  });

  const gestorByContractKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const managers of [managers200330.data, managers200331.data]) {
      for (const [key, manager] of Object.entries(managers || {})) {
        if (manager?.gestorNome) map.set(key, manager.gestorNome);
      }
    }
    return map;
  }, [managers200330.data, managers200331.data]);

  /** Todos os alertas do Funil Único de Atenção das duas UASGs (de contratos e de atas). */
  const attentionItems = useMemo<DashboardAttentionItem[]>(
    () => [...(mgmt200330.readModel?.attention?.items || []), ...(mgmt200331.readModel?.attention?.items || [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mgmt200330.readModel, mgmt200331.readModel]
  );

  const pendenciasByContractKey = useMemo(() => {
    const map = new Map<string, DashboardAttentionItem[]>();
    for (const item of attentionItems) {
      if (!item.contractKey) continue;
      const list = map.get(item.contractKey) || [];
      list.push(item);
      map.set(item.contractKey, list);
    }
    return map;
  }, [attentionItems]);

  const contractsByKey = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  // Contratos enriquecidos com prazo, gestor e pendências (base única para cards, filtros e tabela).
  const rows = useMemo<ContractPortfolioRow[]>(() => {
    return contracts.map((contract) => {
      const contractKey = contract.id || `${contract.uasg || '200331'}-${contract.numero}-${contract.ano}`;
      const diasRestantes = getContractDaysRemaining(contract.dataVigenciaFim);
      const faixa = classifyPrazo(diasRestantes, contract.statusVigencia === 'Expirado');
      return {
        contract,
        contractKey,
        diasRestantes,
        faixa,
        gestorNome: gestorByContractKey.get(contractKey),
        pendencias: pendenciasByContractKey.get(contractKey) || []
      };
    });
  }, [contracts, gestorByContractKey, pendenciasByContractKey]);

  return {
    /** Contratos no escopo do usuário, enriquecidos. */
    rows,
    contractsByKey,
    attentionItems,
    hasAnyData: allContracts.length > 0,
    isLoading,
    isLoadingScope,
    isFetching,
    isPartial,
    error,
    dataUpdatedAt,
    refresh
  };
}
