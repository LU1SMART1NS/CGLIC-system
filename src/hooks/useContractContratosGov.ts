import { useQuery } from '@tanstack/react-query';
import type { ContractDashboardRecord } from '../types';
import { fetchContratoContratosGov } from '../services/contratosGovContratoService';

/**
 * Contrato aberto no Contratos.gov.br, para completar o registro que veio só do Compras.gov.br
 * (id, assinatura, valor inicial, categoria). Só consulta quando falta o id.
 *
 * Query Key Canônica: ['contrato-gov', contractKey]
 *
 * Sem nova tentativa e sem guardar falha: se o servidor falhar, a consulta fica em erro e é refeita
 * na próxima abertura da tela. Achar ou não achar vale por 6 horas.
 */
export function getContratoGovQueryOptions(contract?: ContractDashboardRecord | null) {
  return {
    queryKey: ['contrato-gov', contract?.id ?? ''] as const,
    queryFn: async (): Promise<ContractDashboardRecord | null> => (contract ? fetchContratoContratosGov(contract) : null),
    enabled: Boolean(contract) && !contract?.contratoId,
    retry: false,
    staleTime: 6 * 60 * 60 * 1000
  };
}

export function useContratoGov(contract?: ContractDashboardRecord | null) {
  return useQuery<ContractDashboardRecord | null, Error>(getContratoGovQueryOptions(contract));
}
