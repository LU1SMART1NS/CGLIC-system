import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  syncContractItemQuantity,
  type SyncContractItemQuantityParams,
  type SyncContractItemQuantityResult
} from '../services/contractItemQuantitySyncService';

/** Lê a quantidade contratada do item no contrato (API) e grava a cópia no vínculo. */
export function useSyncContractItemQuantity() {
  const queryClient = useQueryClient();
  return useMutation<SyncContractItemQuantityResult, Error, SyncContractItemQuantityParams>({
    mutationFn: syncContractItemQuantity,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-contract-links'] });
      queryClient.invalidateQueries({ queryKey: ['ata-linked-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    }
  });
}
