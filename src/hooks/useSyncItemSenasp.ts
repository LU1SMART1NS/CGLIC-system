import { useMutation, useQueryClient } from '@tanstack/react-query';
import { syncItemSenaspQuantity, type SyncItemSenaspParams, type SyncItemSenaspResult } from '../services/itemSenaspSyncService';

/**
 * Lê as unidades do item na API e grava o quantitativo SENASP. Usado pelo botão Atualizar do Item; a
 * gravação em lote dos itens pendentes é feita em segundo plano (saldosItensSyncService).
 */
export function useSyncItemSenasp() {
  const queryClient = useQueryClient();
  return useMutation<SyncItemSenaspResult, Error, SyncItemSenaspParams>({
    mutationFn: syncItemSenaspQuantity,
    onSuccess: (r) => {
      if (r.quantidade != null) queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    }
  });
}
