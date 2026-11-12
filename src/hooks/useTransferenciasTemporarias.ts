import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  desfazerTransferenciaTemporaria,
  fetchTransferenciasTemporarias,
  mudarRetornoTransferencia,
  transferirCarteiraTemporaria,
  type TransferenciaTemporaria
} from '../services/transferenciaTemporariaService';
import { invalidateManagerQueries } from './useAssignManager';

export const TRANSFERENCIAS_TEMPORARIAS_KEY = ['transferencias-temporarias'] as const;

/** Transferências temporárias (em curso e histórico), a mais recente primeiro (migration 254). */
export function useTransferenciasTemporarias() {
  return useQuery<TransferenciaTemporaria[], Error>({
    queryKey: TRANSFERENCIAS_TEMPORARIAS_KEY,
    queryFn: fetchTransferenciasTemporarias,
    staleTime: 5 * 60 * 1000
  });
}

/** Transferir e desfazer trocam o gestor: recarregam também os mapas de gestor (e o escopo derivado deles). */
function useMutacaoDaCarteira<I, R>(fn: (input: I) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation<R, Error, I>({
    mutationFn: fn,
    retry: 0,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRANSFERENCIAS_TEMPORARIAS_KEY });
      invalidateManagerQueries(queryClient);
    }
  });
}

export const useTransferirCarteira = () => useMutacaoDaCarteira(transferirCarteiraTemporaria);
export const useDesfazerTransferencia = () => useMutacaoDaCarteira(desfazerTransferenciaTemporaria);

export function useMudarRetorno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mudarRetornoTransferencia,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: TRANSFERENCIAS_TEMPORARIAS_KEY })
  });
}
