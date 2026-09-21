import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveEmpenhoLinks } from '../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';
import type { RpcEmpenhoLinkResult, AppMutationError } from '../types/rpc';

export interface SaveEmpenhoLinksVariables {
  itemKey: string;
  links: Record<string, string>;
  expectedVersion: number;
}

/**
 * Hook canônico do React Query para mutação atômica e versionada de vínculos de empenhos.
 *
 * Arquitetura:
 * UI -> useSaveEmpenhoLinks() -> saveEmpenhoLinks() -> executeSaveEmpenhoLinksRpc() -> save_empenho_links_atomic()
 *
 * Invariantes:
 * - retry: 0 (sem retry automático em mutações com lock otimista)
 * - Invalidação cirúrgica de ['item-empenho-links', canonicalItemKey]
 * - Retenção de erro estruturado (AppMutationError / 40001)
 * - NÃO dispara mutação em allocations (empenhada_qty é derivado em memória pelo balanceService)
 */
export function useSaveEmpenhoLinks() {
  const queryClient = useQueryClient();

  return useMutation<RpcEmpenhoLinkResult | void, AppMutationError | Error, SaveEmpenhoLinksVariables>({
    mutationFn: async ({ itemKey, links, expectedVersion }) => {
      return saveEmpenhoLinks(itemKey, links, expectedVersion);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      const parsed = parseItemKey(variables.itemKey);
      const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

      // Invalidação cirúrgica exclusiva da chave do item afetado
      queryClient.invalidateQueries({
        queryKey: ['item-empenho-links', canonicalKey]
      });
    }
  });
}
