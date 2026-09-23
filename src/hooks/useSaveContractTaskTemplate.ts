import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveContractTaskTemplateRpc, type ContractTaskTemplateInput } from '../adapters/contractManagementRpcAdapter';
import type { RpcContractTaskTemplateResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para criar/atualizar o cabeçalho de um Template de Gestão Contratual.
 */
export function useSaveContractTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation<RpcContractTaskTemplateResult, AppMutationError | Error, ContractTaskTemplateInput>({
    mutationFn: async (input: ContractTaskTemplateInput) => {
      return saveContractTaskTemplateRpc(input);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-templates'] });
    }
  });
}
