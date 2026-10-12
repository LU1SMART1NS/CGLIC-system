import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteArpItemContractLink } from '../services/arpContractLinkService';

interface UnlinkParams {
  linkId: string;
  itemKey?: string;
  contractKey?: string;
}

/**
 * Mutation do React Query para remover o vínculo de um contrato oficial com o item da ARP.
 */
export function useUnlinkContractFromItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UnlinkParams>({
    // O empenho do item vem dos contratos vinculados: desfeito o vínculo, as notas do contrato saem do item sozinhas.
    mutationFn: async ({ linkId, itemKey }: UnlinkParams) => {
      await deleteArpItemContractLink(linkId, itemKey);
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
      // Lista geral de vínculos: Central de Distribuição, propagação do gestor e escopo do perfil gestor
      queryClient.invalidateQueries({ queryKey: ['all-arp-item-contract-links'] });
      queryClient.invalidateQueries({ queryKey: ['contratado-do-item'] });
      // Empenhado do item na Carteira (v_arp_item_contrato_empenhado depende dos vínculos).
      queryClient.invalidateQueries({ queryKey: ['contrato-empenho-distribuicao'] });
      queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
      // Desvincular grava o par como sugestão descartada (migration 95): o sistema não o refaz.
      queryClient.invalidateQueries({ queryKey: ['item-contract-dismissals'] });
      queryClient.invalidateQueries({ queryKey: ['vinculo-automatico'] });
    }
  });
}
