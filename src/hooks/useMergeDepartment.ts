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
 * - Espelhamento secundário seguro em LocalStorage somente pós-sucesso
 */
export function useMergeDepartment() {
  const queryClient = useQueryClient();

  return useMutation<RpcMergeDepartmentResult, AppMutationError | Error, MergeDepartmentVariables>({
    mutationFn: async ({ oldName, targetSigla }) => {
      return mergeDepartmentAllocationsRpc(oldName, targetSigla);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      // Invalidação das queries afetadas
      queryClient.invalidateQueries({ queryKey: ['internal-departments'] });
      queryClient.invalidateQueries({ queryKey: ['item-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['item-empenho-links'] });
      queryClient.invalidateQueries({ queryKey: ['item-unidades'] });

      // Espelhamento secundário no cache local de alocações pós-confirmação
      try {
        if (typeof localStorage !== 'undefined') {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('saldoarp-allocations-')) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                  let changed = false;
                  const updated = list.map((a: any) => {
                    if (a.unitName === variables.oldName) {
                      changed = true;
                      return { ...a, unitName: variables.targetSigla };
                    }
                    return a;
                  });
                  if (changed) {
                    localStorage.setItem(key, JSON.stringify(updated));
                  }
                }
              }
            }
          }
        }
      } catch {}
    }
  });
}
