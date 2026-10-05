import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveArpContractItemLinks } from '../services/arpContractLinkService';
import type { LinkContractToItemsParams } from '../types/arpContractLinks';

/**
 * Mutation do React Query para vincular um contrato oficial a vários itens da ARP de uma só vez.
 * Devolve a quantidade de itens vinculados.
 */
export function useLinkContractToItems() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, LinkContractToItemsParams>({
    mutationFn: saveArpContractItemLinks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-contract-links'] });
      // Aba "Contratos vinculados" da Ata 360 (useAtaLinkedContracts)
      queryClient.invalidateQueries({ queryKey: ['ata-linked-contracts'] });
      // Lista geral de vínculos: Central de Distribuição, propagação do gestor e escopo do perfil gestor
      queryClient.invalidateQueries({ queryKey: ['all-arp-item-contract-links'] });
    }
  });
}
