import { useQuery } from '@tanstack/react-query';
import type { ContractDashboardRecord } from '../types';
import type { ContratosGovResponsavelRecord } from '../types/contractResponsaveis';
import { fetchContratosGovResponsaveis } from '../services/api';
import { contratosGovId } from '../services/contractResponsaveisService';

/**
 * Responsáveis do contrato (gestor, fiscais e substitutos) no Contratos.gov.br.
 * Só consulta contratos que vieram de lá e têm id; os demais não têm o que consultar.
 *
 * Query Key Canônica: ['contract-responsaveis', contratoId]
 */
export function getContractResponsaveisQueryOptions(contract?: ContractDashboardRecord | null) {
  const id = contratosGovId(contract);
  return {
    queryKey: ['contract-responsaveis', id === undefined ? '' : String(id)] as const,
    queryFn: async (): Promise<ContratosGovResponsavelRecord[]> => fetchContratosGovResponsaveis(id as string | number),
    enabled: id !== undefined,
    staleTime: 5 * 60 * 1000
  };
}

export function useContractResponsaveis(contract?: ContractDashboardRecord | null) {
  return useQuery<ContratosGovResponsavelRecord[], Error>(getContractResponsaveisQueryOptions(contract));
}
