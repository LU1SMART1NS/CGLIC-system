import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteArpItemContractLink } from '../services/arpContractLinkService';

interface UnlinkParams {
  linkId: string;
  itemKey?: string;
}

/**
 * Mutation do React Query para remover o vínculo de um contrato oficial com o item da ARP.
 */
export function useUnlinkContractFromItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UnlinkParams>({
    mutationFn: async ({ linkId, itemKey }: UnlinkParams) => {
      return deleteArpItemContractLink(linkId, itemKey);
    },
    onSuccess: (_, variables) => {
      if (variables.itemKey) {
        queryClient.invalidateQueries({
          queryKey: ['item-contract-links', variables.itemKey]
        });
      }
      queryClient.invalidateQueries({
        queryKey: ['item-contract-links']
      });
    }
  });
}
