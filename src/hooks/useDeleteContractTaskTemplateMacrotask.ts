import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteContractTaskTemplateMacrotaskRpc } from '../adapters/contractManagementRpcAdapter';
import type { RpcGenericDeleteResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para excluir uma Macrotarefa de um Template
 * (as tarefas filhas são removidas em cascata).
 */
export function useDeleteContractTaskTemplateMacrotask() {
  const queryClient = useQueryClient();

  return useMutation<RpcGenericDeleteResult, AppMutationError | Error, string>({
    mutationFn: async (id: string) => {
      return deleteContractTaskTemplateMacrotaskRpc(id);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-templates'] });
    }
  });
}
