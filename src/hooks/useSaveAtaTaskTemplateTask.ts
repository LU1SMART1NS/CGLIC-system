import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveAtaTaskTemplateTaskRpc,
  type AtaTaskTemplateTaskInput
} from '../adapters/ataManagementRpcAdapter';
import type { RpcAtaTaskTemplateTaskResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para criar/atualizar uma Tarefa dentro de uma Macrotarefa de Template de Ata.
 */
export function useSaveAtaTaskTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation<RpcAtaTaskTemplateTaskResult, AppMutationError | Error, AtaTaskTemplateTaskInput>({
    mutationFn: async (input: AtaTaskTemplateTaskInput) => {
      return saveAtaTaskTemplateTaskRpc(input);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-templates'] });
    }
  });
}
