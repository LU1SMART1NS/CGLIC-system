import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveEmpenhoManualQuantities } from '../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';
import type { RpcManualQuantityResult, AppMutationError } from '../types/rpc';

export interface SaveManualQuantitiesVariables {
  itemKey: string;
  quantities: Record<string, number>;
  expectedVersion: number;
}

/**
 * Hook canônico do React Query para mutação atômica e versionada de quantidades manuais de empenhos.
 *
 * Arquitetura:
 * UI -> useSaveManualQuantities() -> saveEmpenhoManualQuantities() -> executeSaveManualQuantitiesRpc() -> save_empenho_manual_quantities_atomic()
 *
 * Invariantes:
 * - retry: 0 (sem retry automático em mutações com lock otimista / 40001)
 * - Invalidação cirúrgica de ['item-manual-quantities', canonicalItemKey]
 * - Retenção de erro estruturado (AppMutationError / 40001)
 * - NÃO dispara mutação em arp_allocations, empenhos_manuais nem empenho_links
 */
export function useSaveManualQuantities() {
  const queryClient = useQueryClient();

  return useMutation<RpcManualQuantityResult | void, AppMutationError | Error, SaveManualQuantitiesVariables>({
    mutationFn: async ({ itemKey, quantities, expectedVersion }) => {
      return saveEmpenhoManualQuantities(itemKey, quantities, expectedVersion);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      const parsed = parseItemKey(variables.itemKey);
      const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

      // Invalidação cirúrgica exclusiva da chave do item afetado
      queryClient.invalidateQueries({
        queryKey: ['item-manual-quantities', canonicalKey]
      });
    }
  });
}
