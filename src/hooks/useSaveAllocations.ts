import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveAllocations } from '../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';
import type { InternalAllocation } from '../types';
import type { RpcAllocationResult, AppMutationError } from '../types/rpc';

export interface SaveAllocationsVariables {
  itemKey: string;
  allocations: InternalAllocation[];
  expectedVersion?: number | null;
}

/**
 * Hook canônico do React Query para mutação atômica e versionada de alocações departamentais.
 *
 * Arquitetura:
 * UI -> useSaveAllocations() -> saveAllocations() -> executeSaveAllocationsRpc() -> save_allocations_atomic()
 *
 * Invariantes:
 * - retry: 0 (sem retry automático em mutações com lock otimista)
 * - Invalidação cirúrgica de ['item-allocations', canonicalItemKey]
 * - Retenção de erro estruturado (AppMutationError / 40001)
 */
export function useSaveAllocations() {
  const queryClient = useQueryClient();

  return useMutation<RpcAllocationResult | void, AppMutationError | Error, SaveAllocationsVariables>({
    mutationFn: async ({ itemKey, allocations, expectedVersion }) => {
      return saveAllocations(itemKey, allocations, expectedVersion);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      const parsed = parseItemKey(variables.itemKey);
      const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

      // Invalidação cirúrgica exclusiva da chave do item afetado
      queryClient.invalidateQueries({
        queryKey: ['item-allocations', canonicalKey]
      });
    }
  });
}
