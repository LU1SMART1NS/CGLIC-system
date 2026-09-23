import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateContractTaskRpc, type UpdateContractTaskInput } from '../adapters/contractManagementRpcAdapter';
import type { RpcUpdateContractTaskResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para atualizar status/responsável/prazo/observação de uma tarefa
 * do plano de gestão de um contrato.
 *
 * Como a tarefa não carrega o contractKey da query a invalidar, o chamador (UI) informa a
 * query key do plano a ser invalidada após o sucesso.
 */
export function useUpdateContractTask(contractKey: string) {
  const queryClient = useQueryClient();

  return useMutation<RpcUpdateContractTaskResult, AppMutationError | Error, UpdateContractTaskInput>({
    mutationFn: async (input: UpdateContractTaskInput) => {
      return updateContractTaskRpc(input);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-plan', contractKey] });
    }
  });
}
