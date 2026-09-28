import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateAtaTaskRpc, type UpdateAtaTaskInput } from '../adapters/ataManagementRpcAdapter';
import type { RpcUpdateAtaTaskResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para atualizar status/responsável/prazo/observação de uma tarefa
 * do plano de gestão de uma Ata.
 *
 * Como a tarefa não carrega o ataKey da query a invalidar, o chamador (UI) informa a
 * query key do plano a ser invalidada após o sucesso.
 */
export function useUpdateAtaTask(ataKey: string) {
  const queryClient = useQueryClient();

  return useMutation<RpcUpdateAtaTaskResult, AppMutationError | Error, UpdateAtaTaskInput>({
    mutationFn: async (input: UpdateAtaTaskInput) => {
      return updateAtaTaskRpc(input);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-plan', ataKey] });
    }
  });
}
