import { useMutation, useQueryClient } from '@tanstack/react-query';
import { restoreContractSuggestion } from '../services/arpContractLinkService';
import type { DismissContractSuggestionParams } from '../types/arpContractLinks';

/**
 * Mutation do React Query para restore a sugestão de um contrato para um item da ARP.
 */
export function useRestoreContractSuggestion() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DismissContractSuggestionParams>({
    mutationFn: restoreContractSuggestion,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['item-contract-dismissals', variables.itemKey]
      });
    }
  });
}
