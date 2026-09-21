import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveManualEmpenhos } from '../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';
import type { Empenho } from '../types';
import type { RpcManualEmpenhoResult, AppMutationError } from '../types/rpc';

export interface SaveManualEmpenhosVariables {
  itemKey: string;
  empenhos: Empenho[];
  expectedVersion: number;
}

/**
 * Hook canônico do React Query para mutação atômica e versionada de empenhos manuais.
 *
 * Arquitetura:
 * UI -> useSaveManualEmpenhos() -> saveManualEmpenhos() -> executeSaveManualEmpenhosRpc() -> save_manual_empenhos_atomic()
 *
 * Invariantes:
 * - retry: 0 (sem retry automático em mutações com lock otimista / 40001)
 * - Invalidação cirúrgica de ['item-manual-empenhos', canonicalItemKey]
 * - Retenção de erro estruturado (AppMutationError / 40001)
 * - NÃO dispara mutação em arp_allocations nem empenho_links
 */
export function useSaveManualEmpenhos() {
  const queryClient = useQueryClient();

  return useMutation<RpcManualEmpenhoResult | void, AppMutationError | Error, SaveManualEmpenhosVariables>({
    mutationFn: async ({ itemKey, empenhos, expectedVersion }) => {
      return saveManualEmpenhos(itemKey, empenhos, expectedVersion);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      const parsed = parseItemKey(variables.itemKey);
      const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

      // Invalidação cirúrgica exclusiva da chave do item afetado
      queryClient.invalidateQueries({
        queryKey: ['item-manual-empenhos', canonicalKey]
      });
    }
  });
}
