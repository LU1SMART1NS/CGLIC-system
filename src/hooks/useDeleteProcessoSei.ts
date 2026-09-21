import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteProcessoSeiRpc } from '../adapters/seiRpcAdapter';
import type { RpcDeleteProcessoSeiResult, AppMutationError } from '../types/rpc';
import { fetchProcessosSei } from '../services/seiService';

/**
 * Hook canônico do React Query para excluir Processos SEI com segurança.
 *
 * Arquitetura:
 * UI -> useDeleteProcessoSei() -> deleteProcessoSeiRpc() -> delete_processo_sei_atomic()
 *
 * Invariantes:
 * - retry: 0
 * - Invalidação canônica de ['processos-sei']
 * - Espelhamento secundário seguro em LocalStorage somente pós-sucesso
 */
export function useDeleteProcessoSei() {
  const queryClient = useQueryClient();

  return useMutation<RpcDeleteProcessoSeiResult, AppMutationError | Error, string>({
    mutationFn: async (id: string) => {
      return deleteProcessoSeiRpc(id);
    },
    retry: 0,
    onSuccess: async () => {
      // Invalidação canônica do catálogo de processos SEI
      queryClient.invalidateQueries({
        queryKey: ['processos-sei']
      });

      // Espelhamento secundário defensivo em LocalStorage somente após confirmação do backend
      try {
        const updated = await fetchProcessosSei();
        localStorage.setItem('saldoarp-processos-sei', JSON.stringify(updated));
      } catch {}
    }
  });
}
