import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteDepartmentRpc } from '../adapters/departmentRpcAdapter';
import type { RpcDeleteDepartmentResult, AppMutationError } from '../types/rpc';
import { fetchDepartments } from '../services/unitService';

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
 * - Espelhamento secundário seguro em LocalStorage somente pós-sucesso
 */
export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation<RpcDeleteDepartmentResult, AppMutationError | Error, DeleteDepartmentVariables>({
    mutationFn: async ({ id, forceDeactivate }) => {
      return deleteDepartmentRpc(id, forceDeactivate);
    },
    retry: 0,
    onSuccess: async () => {
      // Invalidação canônica do catálogo de departamentos
      queryClient.invalidateQueries({
        queryKey: ['internal-departments']
      });

      // Espelhamento secundário defensivo em LocalStorage somente após confirmação do backend
      try {
        const updated = await fetchDepartments();
        localStorage.setItem('saldoarp-internal-departments', JSON.stringify(updated));
      } catch {}
    }
  });
}
