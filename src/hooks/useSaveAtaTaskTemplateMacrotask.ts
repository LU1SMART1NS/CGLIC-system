import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveAtaTaskTemplateMacrotaskRpc,
  type AtaTaskTemplateMacrotaskInput
} from '../adapters/ataManagementRpcAdapter';
import type { RpcAtaTaskTemplateMacrotaskResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para criar/atualizar uma Macrotarefa de um Template de Ata.
 */
export function useSaveAtaTaskTemplateMacrotask() {
  const queryClient = useQueryClient();

  return useMutation<RpcAtaTaskTemplateMacrotaskResult, AppMutationError | Error, AtaTaskTemplateMacrotaskInput>({
    mutationFn: async (input: AtaTaskTemplateMacrotaskInput) => {
      return saveAtaTaskTemplateMacrotaskRpc(input);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-templates'] });
    }
  });
}
