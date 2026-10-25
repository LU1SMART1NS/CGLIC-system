import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mergeDepartmentAllocationsRpc } from '../adapters/departmentRpcAdapter';
import type { RpcMergeDepartmentResult, AppMutationError } from '../types/rpc';

export interface MergeDepartmentVariables {
  oldName: string;
  targetSigla: string;
}

/**
 * Hook canônico do React Query para saneamento / mesclagem administrativa de nomes de unidades em alocações.
 *
 * Arquitetura:
 * UI -> useMergeDepartment() -> mergeDepartmentAllocationsRpc() -> merge_internal_department_allocations_atomic()
 *
 * Invariantes:
 * - retry: 0
 * - Invalidação abrangente das queries de alocações, unidades e saldos
 */
export function useMergeDepartment() {
  const queryClient = useQueryClient();

  return useMutation<RpcMergeDepartmentResult, AppMutationError | Error, MergeDepartmentVariables>({
    mutationFn: async ({ oldName, targetSigla }) => {
      return mergeDepartmentAllocationsRpc(oldName, targetSigla);
    },
    retry: 0,
    onSuccess: () => {
      // Invalidação das queries afetadas
      queryClient.invalidateQueries({ queryKey: ['internal-departments'] });
      queryClient.invalidateQueries({ queryKey: ['item-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['item-empenho-links'] });
      queryClient.invalidateQueries({ queryKey: ['item-unidades'] });
    }
  });
}
