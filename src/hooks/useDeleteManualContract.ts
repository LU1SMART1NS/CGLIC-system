import { useMutation, useQueryClient } from '@tanstack/react-query';
import { executeDeleteContratoRpc } from '../adapters/contractRpcAdapter';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';
import type { AppMutationError, RpcDeleteContratoResult } from '../types/rpc';

export interface DeleteManualContractVariables {
  id: string;
  itemKey?: string;
}

/**
 * Hook canônico do React Query para exclusão transacional de contratos manuais (SaldoARP 3.0).
 *
 * Arquitetura:
 * UI -> useDeleteManualContract() -> executeDeleteContratoRpc() -> delete_manual_contrato_atomic()
 *
 * Invariantes:
 * - retry: 0 (sem retry automático em mutações de deleção)
 * - Exclusão em cascata automática de vínculos via FK ON DELETE CASCADE no PostgreSQL
 * - Invalidação cirúrgica de ['item-manual-contracts', canonicalKey] e ['item-contract-empenho-links', canonicalKey]
 * - Espelhamento secundário em LocalStorage exclusivamente pós-sucesso da RPC
 * - NÃO dispara mutação nem invalidação em arp_allocations, empenhos_manuais nem empenho_links
 */
export function useDeleteManualContract() {
  const queryClient = useQueryClient();

  return useMutation<RpcDeleteContratoResult, AppMutationError | Error, DeleteManualContractVariables>({
    mutationFn: async ({ id }) => {
      const res = await executeDeleteContratoRpc(id);
      return res as RpcDeleteContratoResult;
    },
    retry: 0,
    onSuccess: (data, variables) => {
      const rawKey = data?.item_key || variables.itemKey || '';
      const parsed = parseItemKey(rawKey);
      const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

      // 1. Invalidação cirúrgica do agregado de contratos e vínculos do item afetado
      queryClient.invalidateQueries({
        queryKey: ['item-manual-contracts', canonicalKey]
      });
      queryClient.invalidateQueries({
        queryKey: ['item-contract-empenho-links', canonicalKey]
      });

      // 2. Atualização segura do espelhamento secundário local pós-confirmação
      if (typeof localStorage !== 'undefined' && canonicalKey) {
        try {
          const ctrKey = `saldoarp-manual-contratos-${canonicalKey}`;
          const rawCtr = localStorage.getItem(ctrKey);
          if (rawCtr) {
            const list = JSON.parse(rawCtr);
            if (Array.isArray(list)) {
              const updated = list.filter((c: any) => c.id !== variables.id && c._manualId !== variables.id);
              localStorage.setItem(ctrKey, JSON.stringify(updated));
            }
          }

          const linkKey = `saldoarp-contrato-empenho-links-${canonicalKey}`;
          const rawLinks = localStorage.getItem(linkKey);
          if (rawLinks) {
            const linksList = JSON.parse(rawLinks);
            if (Array.isArray(linksList)) {
              const updatedLinks = linksList.filter((l: any) => l.contratoId !== variables.id && l.contrato_id !== variables.id);
              localStorage.setItem(linkKey, JSON.stringify(updatedLinks));
            }
          }
        } catch (e) {
          console.warn('Erro ao atualizar espelho do LocalStorage pós-deleção de contrato', e);
        }
      }
    }
  });
}
