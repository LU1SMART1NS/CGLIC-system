import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveProcessoSeiRpc, type ProcessoSeiInput } from '../adapters/seiRpcAdapter';
import type { RpcProcessoSeiResult, AppMutationError } from '../types/rpc';
import { fetchProcessosSei } from '../services/seiService';

/**
 * Hook canônico do React Query para salvar (criar ou atualizar) Processos SEI.
 *
 * Arquitetura:
 * UI -> useSaveProcessoSei() -> saveProcessoSeiRpc() -> save_processo_sei_atomic()
 *
 * Invariantes:
 * - retry: 0
 * - Invalidação canônica de ['processos-sei']
 * - Espelhamento secundário seguro em LocalStorage somente pós-sucesso
 */
export function useSaveProcessoSei() {
  const queryClient = useQueryClient();

  return useMutation<RpcProcessoSeiResult, AppMutationError | Error, ProcessoSeiInput>({
    mutationFn: async (input: ProcessoSeiInput) => {
      return saveProcessoSeiRpc(input);
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
