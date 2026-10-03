import { useQuery } from '@tanstack/react-query';
import type { ContractDashboardRecord } from '../types';
import { fetchPncpContrato, montarBuscaPncpContrato, parseNumeroControlePncpContrato, type PncpContratoInfo } from '../services/pncpContratoService';

/**
 * Id PNCP e data de divulgação do contrato no PNCP.
 *
 * Query Key Canônica: ['contract-pncp', contractKey]
 *
 * Sem nova tentativa: o PNCP recusa (429) quando recebe muitas chamadas, e repetir só pioraria. A data de
 * divulgação não muda, então o resultado vale por um dia.
 */
export function getContractPncpQueryOptions(contract?: ContractDashboardRecord | null) {
  const consultavel =
    Boolean(contract) &&
    (parseNumeroControlePncpContrato(contract?.numeroControlePncp) !== null || (contract ? montarBuscaPncpContrato(contract) !== null : false));
  return {
    queryKey: ['contract-pncp', contract?.id ?? ''] as const,
    queryFn: async (): Promise<PncpContratoInfo | null> => (contract ? fetchPncpContrato(contract) : null),
    enabled: consultavel,
    retry: false,
    staleTime: 24 * 60 * 60 * 1000
  };
}

export function useContractPncp(contract?: ContractDashboardRecord | null) {
  return useQuery<PncpContratoInfo | null, Error>(getContractPncpQueryOptions(contract));
}
