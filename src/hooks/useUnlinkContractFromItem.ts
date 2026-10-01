import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteArpItemContractLink } from '../services/arpContractLinkService';
import { removeItemContractEmpenhos } from '../services/itemContractEmpenhoService';

interface UnlinkParams {
  linkId: string;
  itemKey?: string;
  /** Com itemKey, remove também do item os empenhos que esse contrato trouxe. */
  contractKey?: string;
}

/**
 * Mutation do React Query para remover o vínculo de um contrato oficial com o item da ARP.
 */
export function useUnlinkContractFromItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UnlinkParams>({
    mutationFn: async ({ linkId, itemKey, contractKey }: UnlinkParams) => {
      await deleteArpItemContractLink(linkId, itemKey);
      if (itemKey && contractKey) {
        try {
          await removeItemContractEmpenhos(itemKey, contractKey);
        } catch (err) {
          // O vínculo já foi desfeito; os empenhos do contrato saem do item na próxima sincronização.
          console.warn('Contrato desvinculado, mas os empenhos dele não foram removidos do item:', err);
        }
      }
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
      // Aba "Contratos vinculados" da Ata 360 (useAtaLinkedContracts)
      queryClient.invalidateQueries({
        queryKey: ['ata-linked-contracts']
      });
      queryClient.invalidateQueries({ queryKey: ['item-empenho-vinculos'] });
      queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    }
  });
}
