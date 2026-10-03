import { useQuery } from '@tanstack/react-query';
import type { ContractDashboardRecord } from '../types';
import type { ContratosGovGarantiaRecord } from '../types/contractResponsaveis';
import { fetchContratosGovGarantias } from '../services/api';
import { contratosGovId } from '../services/contractResponsaveisService';

/**
 * Garantias do contrato no Contratos.gov.br.
 * Só consulta contratos que vieram de lá e têm id.
 *
 * Query Key Canônica: ['contract-garantias', contratoId]
 */
export function getContractGarantiasQueryOptions(contract?: ContractDashboardRecord | null) {
  const id = contratosGovId(contract);
  return {
    queryKey: ['contract-garantias', id === undefined ? '' : String(id)] as const,
    queryFn: async (): Promise<ContratosGovGarantiaRecord[]> => fetchContratosGovGarantias(id as string | number),
    enabled: id !== undefined,
    staleTime: 5 * 60 * 1000
  };
}

export function useContractGarantias(contract?: ContractDashboardRecord | null) {
  return useQuery<ContratosGovGarantiaRecord[], Error>(getContractGarantiasQueryOptions(contract));
}
