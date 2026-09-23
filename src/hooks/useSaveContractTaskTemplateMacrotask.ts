import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveContractTaskTemplateMacrotaskRpc,
  type ContractTaskTemplateMacrotaskInput
} from '../adapters/contractManagementRpcAdapter';
import type { RpcContractTaskTemplateMacrotaskResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para criar/atualizar uma Macrotarefa de um Template.
 */
export function useSaveContractTaskTemplateMacrotask() {
  const queryClient = useQueryClient();

  return useMutation<RpcContractTaskTemplateMacrotaskResult, AppMutationError | Error, ContractTaskTemplateMacrotaskInput>({
    mutationFn: async (input: ContractTaskTemplateMacrotaskInput) => {
      return saveContractTaskTemplateMacrotaskRpc(input);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-templates'] });
    }
  });
}
