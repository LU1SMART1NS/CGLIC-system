import { useQuery } from '@tanstack/react-query';
import { fetchSincronizacaoEmpenhos, type SincronizacaoEmpenhosContrato } from '../services/contratoEmpenhosSincronizacaoService';

/** Chave do cache da situação da sincronização de empenhos de um contrato. */
export const SINCRONIZACAO_EMPENHOS_QUERY_KEY = (contractKey: string) => ['contrato-empenhos-sincronizacao', contractKey] as const;

/** Situação da última sincronização dos empenhos do contrato (null: nunca sincronizado). */
export function useSincronizacaoEmpenhosContrato(contractKey?: string) {
  const key = (contractKey || '').trim();
  return useQuery<SincronizacaoEmpenhosContrato | null, Error>({
    queryKey: SINCRONIZACAO_EMPENHOS_QUERY_KEY(key),
    queryFn: () => fetchSincronizacaoEmpenhos(key),
    enabled: Boolean(key),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}
