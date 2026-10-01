import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dismissContractSuggestion } from '../services/arpContractLinkService';
import type { DismissContractSuggestionParams } from '../types/arpContractLinks';

/**
 * Mutation do React Query para dismiss a sugestão de um contrato para um item da ARP.
 */
export function useDismissContractSuggestion() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DismissContractSuggestionParams>({
    mutationFn: dismissContractSuggestion,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['item-contract-dismissals', variables.itemKey]
      });
    }
  });
}
