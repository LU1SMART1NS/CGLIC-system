import { useContractsDashboard } from './useContractsDashboard';
import { getContractManagementKey } from '../services/contractManagementService';
import type { ContractDashboardRecord } from '../types';

/**
 * Hook canônico para recuperar um único contrato por sua chave identificadora (contractKey).
 *
 * Arquitetura ("Digite uma vez, use em todo lugar"):
 * Reutiliza a mesma query cacheada do Dashboard de Contratos ['contracts-dashboard', uasg]
 * sem disparar requisições duplicadas ou criar novas rotas de API.
 */
export function useContract(contractKey?: string, uasg: string = '200331') {
  const cleanUasg = uasg?.trim() || '200331';
  const {
    data: contracts = [],
    isLoading,
    isError,
    error,
    refetch,
    refresh
  } = useContractsDashboard(cleanUasg);

  const normalizedTargetKey = (contractKey || '').trim().toUpperCase();

  const contract: ContractDashboardRecord | null = contracts.find((c) => {
    if (!normalizedTargetKey) return false;
    const key = c.id || getContractManagementKey(c.uasg, c.numero, c.ano);
    return (
      key.toUpperCase() === normalizedTargetKey ||
      (c.id && c.id.toUpperCase() === normalizedTargetKey) ||
      (c.numeroControlePncp && c.numeroControlePncp.toUpperCase() === normalizedTargetKey)
    );
  }) || null;

  return {
    contract,
    isLoading,
    isError,
    error,
    refetch,
    refresh
  };
}
