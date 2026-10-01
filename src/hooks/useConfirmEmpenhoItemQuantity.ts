import { useMutation, useQueryClient } from '@tanstack/react-query';
import { confirmEmpenhoItemQuantity } from '../services/itemEmpenhoVinculoService';

/** Confirma a quantidade de um empenho que a API não trouxe (ou a devolve a pendente, com nulo). */
export function useConfirmEmpenhoItemQuantity() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { itemKey: string; empenhoId: string; quantidade: number | null }>({
    mutationFn: confirmEmpenhoItemQuantity,
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['item-empenho-vinculos', v.itemKey] });
      queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    }
  });
}
