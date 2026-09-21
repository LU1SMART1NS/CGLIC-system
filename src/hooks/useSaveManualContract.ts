import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveManualContratoWithEmpenhos } from '../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';
import type { Contrato } from '../types';
import type { RpcContratoResult, AppMutationError } from '../types/rpc';

export interface SaveManualContractVariables {
  contrato: Contrato;
  empenhoIds: string[];
}

/**
 * Hook canônico do React Query para mutação transacional de contratos manuais + vínculos de empenhos.
 *
 * Arquitetura:
 * UI -> useSaveManualContract() -> saveManualContratoWithEmpenhos() -> executeSaveContratoRpc() -> save_manual_contrato_atomic()
 *
 * Invariantes:
 * - retry: 0 (sem retry automático em mutações transacionais)
 * - Invalidação cirúrgica de ['item-manual-contracts', canonicalKey] e ['item-contract-empenho-links', canonicalKey]
 * - Retenção de erro estruturado (AppMutationError / 23514 / RN-07)
 * - Persistência atômica conjunta de contrato e links
 * - NÃO dispara mutação em arp_allocations, empenho_manual_quantidades, empenhos_manuais nem empenho_links
 */
export function useSaveManualContract() {
  const queryClient = useQueryClient();

  return useMutation<RpcContratoResult | void, AppMutationError | Error, SaveManualContractVariables>({
    mutationFn: async ({ contrato, empenhoIds }) => {
      return saveManualContratoWithEmpenhos(contrato, empenhoIds);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      const rawKey = variables.contrato.arpId
        ? `${variables.contrato.arpId}-${variables.contrato.uasg}-${variables.contrato.itemId || '00001'}`
        : '';
      const parsed = parseItemKey(rawKey);
      const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

      // Invalidação cirúrgica exclusiva do agregado de contratos e vínculos do item afetado
      queryClient.invalidateQueries({
        queryKey: ['item-manual-contracts', canonicalKey]
      });
      queryClient.invalidateQueries({
        queryKey: ['item-contract-empenho-links', canonicalKey]
      });
    }
  });
}
