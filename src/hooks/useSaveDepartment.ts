import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveDepartmentRpc, type DepartmentInput } from '../adapters/departmentRpcAdapter';
import type { RpcDepartmentResult, AppMutationError } from '../types/rpc';
import { fetchDepartments } from '../services/unitService';

/**
 * Hook canônico do React Query para salvar (criar ou atualizar) unidades e departamentos oficiais.
 *
 * Arquitetura:
 * UI -> useSaveDepartment() -> saveDepartmentRpc() -> save_internal_department_atomic()
 *
 * Invariantes:
 * - retry: 0
 * - Invalidação canônica de ['internal-departments']
 * - Espelhamento secundário seguro em LocalStorage somente pós-sucesso
 */
export function useSaveDepartment() {
  const queryClient = useQueryClient();

  return useMutation<RpcDepartmentResult, AppMutationError | Error, DepartmentInput>({
    mutationFn: async (input: DepartmentInput) => {
      return saveDepartmentRpc(input);
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
