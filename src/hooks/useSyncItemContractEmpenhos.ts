import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  syncItemContractEmpenhos,
  removeItemContractEmpenhos,
  type SyncItemContractEmpenhosParams,
  type SyncItemContractEmpenhosSummary
} from '../services/itemContractEmpenhoService';
import { normalizeItemKey } from '../utils/itemKeyUtils';

function useInvalidateEmpenhoQueries() {
  const queryClient = useQueryClient();
  return (itemKey: string) => {
    queryClient.invalidateQueries({ queryKey: ['item-empenho-vinculos', itemKey] });
    // Saldos de item lidos da view v_arp_item_saldo_detalhado (Ata, busca de atas, dashboards)
    queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
  };
}

/** Lê os empenhos do contrato na API e atualiza os do item (ao vincular o contrato ou sob demanda). */
export function useSyncItemContractEmpenhos() {
  const invalidate = useInvalidateEmpenhoQueries();
  return useMutation<SyncItemContractEmpenhosSummary, Error, SyncItemContractEmpenhosParams>({
    mutationFn: syncItemContractEmpenhos,
    onSuccess: (_, v) => invalidate(normalizeItemKey(v.numeroAta, v.uasg, v.numeroItem))
  });
}

/** Remove do item os empenhos que o contrato trouxe (ao desvincular o contrato). */
export function useRemoveItemContractEmpenhos() {
  const invalidate = useInvalidateEmpenhoQueries();
  return useMutation<number, Error, { itemKey: string; contractKey: string }>({
    mutationFn: ({ itemKey, contractKey }) => removeItemContractEmpenhos(itemKey, contractKey),
    onSuccess: (_, v) => invalidate(v.itemKey)
  });
}
