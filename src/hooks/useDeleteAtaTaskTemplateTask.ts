import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteAtaTaskTemplateTaskRpc } from '../adapters/ataManagementRpcAdapter';
import type { RpcGenericDeleteResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para excluir uma Tarefa de um Template de Ata.
 */
export function useDeleteAtaTaskTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation<RpcGenericDeleteResult, AppMutationError | Error, string>({
    mutationFn: async (id: string) => {
      return deleteAtaTaskTemplateTaskRpc(id);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-templates'] });
    }
  });
}
