import { useQuery } from '@tanstack/react-query';
import type { ContractDashboardRecord } from '../types';
import type { ContratosGovResponsavelRecord } from '../types/contractResponsaveis';
import { fetchContratosGovResponsaveis } from '../services/api';
import { contratosGovId } from '../services/contractResponsaveisService';
import { lerComCopia, lerCopiaDetalheContrato, type LeituraComCopia } from '../services/contratoDetalhesCopiaService';

/**
 * Responsáveis do contrato (gestor, fiscais e substitutos) no Contratos.gov.br.
 * Só consulta contratos que vieram de lá e têm id; os demais não têm o que consultar.
 * Se a consulta falhar, usa a cópia guardada pelo servidor (migration 93); sem cópia, a query falha.
 *
 * Query Key Canônica: ['contract-responsaveis', contratoId]
 */
export function getContractResponsaveisQueryOptions(contract?: ContractDashboardRecord | null) {
  const id = contratosGovId(contract);
  return {
    queryKey: ['contract-responsaveis', id === undefined ? '' : String(id)] as const,
    queryFn: async (): Promise<LeituraComCopia<ContratosGovResponsavelRecord[]>> =>
      lerComCopia(
        () => fetchContratosGovResponsaveis(id as string | number, { falharSeErro: true }),
        () => lerCopiaDetalheContrato<ContratosGovResponsavelRecord[]>(contract?.id ?? '', 'responsaveis')
      ),
    enabled: id !== undefined,
    retry: false,
    staleTime: 5 * 60 * 1000
  };
}

export function useContractResponsaveis(contract?: ContractDashboardRecord | null) {
  return useQuery<LeituraComCopia<ContratosGovResponsavelRecord[]>, Error>(getContractResponsaveisQueryOptions(contract));
}
