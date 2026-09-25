import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveArpItemContractLink } from '../services/arpContractLinkService';
import type { LinkContractToItemParams, ArpItemContractLink } from '../types/arpContractLinks';

/**
 * Mutation do React Query para criar ou atualizar o vínculo de um contrato oficial com o item da ARP.
 */
export function useLinkContractToItem() {
  const queryClient = useQueryClient();

  return useMutation<ArpItemContractLink, Error, LinkContractToItemParams>({
    mutationFn: async (params: LinkContractToItemParams) => {
      return saveArpItemContractLink(params);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['item-contract-links', variables.itemKey]
      });
      // Invalidação ampla para garantir atualização em telas agregadas
      queryClient.invalidateQueries({
        queryKey: ['item-contract-links']
      });
    }
  });
}
