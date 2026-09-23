import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveContractTaskTemplateTaskRpc,
  type ContractTaskTemplateTaskInput
} from '../adapters/contractManagementRpcAdapter';
import type { RpcContractTaskTemplateTaskResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para criar/atualizar uma Tarefa dentro de uma Macrotarefa de Template.
 */
export function useSaveContractTaskTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation<RpcContractTaskTemplateTaskResult, AppMutationError | Error, ContractTaskTemplateTaskInput>({
    mutationFn: async (input: ContractTaskTemplateTaskInput) => {
      return saveContractTaskTemplateTaskRpc(input);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-templates'] });
    }
  });
}
