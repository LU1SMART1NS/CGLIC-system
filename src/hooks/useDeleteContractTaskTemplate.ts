import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteContractTaskTemplateRpc } from '../adapters/contractManagementRpcAdapter';
import type { RpcDeleteContractTaskTemplateResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para excluir um Template de Gestão Contratual.
 * Não afeta planos já aplicados a contratos (template_id vira NULL no backend).
 */
export function useDeleteContractTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation<RpcDeleteContractTaskTemplateResult, AppMutationError | Error, string>({
    mutationFn: async (id: string) => {
      return deleteContractTaskTemplateRpc(id);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-templates'] });
    }
  });
}
