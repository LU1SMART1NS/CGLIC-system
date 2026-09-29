import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteAtaTaskTemplateRpc } from '../adapters/ataManagementRpcAdapter';
import type { RpcDeleteAtaTaskTemplateResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para excluir um Template de Gestão de Ata.
 * Não afeta planos já aplicados a Atas (template_id vira NULL no backend).
 */
export function useDeleteAtaTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation<RpcDeleteAtaTaskTemplateResult, AppMutationError | Error, string>({
    mutationFn: async (id: string) => {
      return deleteAtaTaskTemplateRpc(id);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-templates'] });
    }
  });
}
