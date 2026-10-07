import { useQuery } from '@tanstack/react-query';
import type { ContractDashboardRecord } from '../types';
import type { ContratosGovGarantiaRecord } from '../types/contractResponsaveis';
import { fetchContratosGovGarantias } from '../services/api';
import { contratosGovId } from '../services/contractResponsaveisService';
import { lerComCopia, lerCopiaDetalheContrato, type LeituraComCopia } from '../services/contratoDetalhesCopiaService';

/**
 * Garantias do contrato no Contratos.gov.br.
 * Só consulta contratos que vieram de lá e têm id.
 * Se a consulta falhar, usa a cópia guardada pelo servidor (migration 93); sem cópia, a query falha.
 *
 * Query Key Canônica: ['contract-garantias', contratoId]
 */
export function getContractGarantiasQueryOptions(contract?: ContractDashboardRecord | null) {
  const id = contratosGovId(contract);
  return {
    queryKey: ['contract-garantias', id === undefined ? '' : String(id)] as const,
    queryFn: async (): Promise<LeituraComCopia<ContratosGovGarantiaRecord[]>> =>
      lerComCopia(
        () => fetchContratosGovGarantias(id as string | number, { falharSeErro: true }),
        () => lerCopiaDetalheContrato<ContratosGovGarantiaRecord[]>(contract?.id ?? '', 'garantias')
      ),
    enabled: id !== undefined,
    retry: false,
    staleTime: 5 * 60 * 1000
  };
}

export function useContractGarantias(contract?: ContractDashboardRecord | null) {
  return useQuery<LeituraComCopia<ContratosGovGarantiaRecord[]>, Error>(getContractGarantiasQueryOptions(contract));
}
