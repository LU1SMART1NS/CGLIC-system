import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteAtaTaskTemplateMacrotaskRpc } from '../adapters/ataManagementRpcAdapter';
import type { RpcGenericDeleteResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para excluir uma Macrotarefa de um Template de Ata
 * (as tarefas filhas são removidas em cascata).
 */
export function useDeleteAtaTaskTemplateMacrotask() {
  const queryClient = useQueryClient();

  return useMutation<RpcGenericDeleteResult, AppMutationError | Error, string>({
    mutationFn: async (id: string) => {
      return deleteAtaTaskTemplateMacrotaskRpc(id);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-templates'] });
    }
  });
}
