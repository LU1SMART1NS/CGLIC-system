import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orchestrateItemEmpenhoSync } from '../services/empenhoOrchestrationService';
import { parseItemKey } from '../utils/itemKeyUtils';
import type { OrchestrationResult, ItemTarget } from '../types/empenhoSync';

export interface SyncItemEmpenhosParams {
  unitPrice?: number;
  contracts?: ItemTarget['contracts'];
}

/**
 * Hook React Query para orquestração on-demand de sincronização de empenhos de Item de Ata.
 * 
 * Invariantes Invioláveis:
 * 1. O hook NÃO contém lógica contábil, de normalização ou reconciliação.
 * 2. Delega integralmente a execução para `orchestrateItemEmpenhoSync`.
 * 3. Invalida exclusivamente as query keys necessárias (Item, Unidades e Saldo M18).
 */
export function useSyncItemEmpenhos(itemKey: string) {
  const queryClient = useQueryClient();

  return useMutation<OrchestrationResult, Error, SyncItemEmpenhosParams | void>({
    mutationFn: async (params) => {
      const target: ItemTarget = {
        tipo: 'ITEM',
        itemKey,
        unitPrice: params?.unitPrice,
        contracts: params?.contracts
      };
      return orchestrateItemEmpenhoSync(target);
    },
    onSuccess: () => {
      // Invalidação cirúrgica de caches de Item e Saldo M18
      const parsed = parseItemKey(itemKey);

      if (parsed.numeroAta && parsed.uasg && parsed.itemNum) {
        queryClient.invalidateQueries({
          queryKey: ['item-empenhos', parsed.numeroAta, parsed.uasg, parsed.itemNum]
        });
        queryClient.invalidateQueries({
          queryKey: ['item-unidades', parsed.numeroAta, parsed.uasg, parsed.itemNum]
        });
        if (parsed.itemNum !== String(parsed.itemNumInteger)) {
          queryClient.invalidateQueries({
            queryKey: ['item-empenhos', parsed.numeroAta, parsed.uasg, String(parsed.itemNumInteger)]
          });
          queryClient.invalidateQueries({
            queryKey: ['item-unidades', parsed.numeroAta, parsed.uasg, String(parsed.itemNumInteger)]
          });
        }
      }

      queryClient.invalidateQueries({
        queryKey: ['v_arp_item_saldo_detalhado', itemKey]
      });
      queryClient.invalidateQueries({
        queryKey: ['v_arp_item_saldo_detalhado']
      });
      queryClient.invalidateQueries({
        queryKey: ['v_arp_item_empenhos_resumo', itemKey]
      });
      queryClient.invalidateQueries({
        queryKey: ['v_empenhos_resumo']
      });
      queryClient.invalidateQueries({
        queryKey: ['item-allocations', itemKey]
      });
    }
  });
}
