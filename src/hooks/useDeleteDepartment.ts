import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteDepartmentRpc } from '../adapters/departmentRpcAdapter';
import type { RpcDeleteDepartmentResult, AppMutationError } from '../types/rpc';

export interface DeleteDepartmentVariables {
  id: string;
  forceDeactivate?: boolean;
}

/**
 * Hook canônico do React Query para excluir ou desativar departamentos com segurança contra violação de integridade.
 *
 * Arquitetura:
 * UI -> useDeleteDepartment() -> deleteDepartmentRpc() -> delete_internal_department_atomic()
 *
 * Invariantes:
 * - retry: 0
 * - Invalidação canônica de ['internal-departments']
 */
export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation<RpcDeleteDepartmentResult, AppMutationError | Error, DeleteDepartmentVariables>({
    mutationFn: async ({ id, forceDeactivate }) => {
      return deleteDepartmentRpc(id, forceDeactivate);
    },
    retry: 0,
    onSuccess: () => {
      // Invalidação canônica do catálogo de departamentos
      queryClient.invalidateQueries({
        queryKey: ['internal-departments']
      });

    }
  });
}
