import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteContractTaskTemplateTaskRpc } from '../adapters/contractManagementRpcAdapter';
import type { RpcGenericDeleteResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para excluir uma Tarefa de um Template.
 */
export function useDeleteContractTaskTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation<RpcGenericDeleteResult, AppMutationError | Error, string>({
    mutationFn: async (id: string) => {
      return deleteContractTaskTemplateTaskRpc(id);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-templates'] });
    }
  });
}
