import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveAtaTaskTemplateRpc, type AtaTaskTemplateInput } from '../adapters/ataManagementRpcAdapter';
import type { RpcAtaTaskTemplateResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para criar/atualizar o cabeçalho de um Template de Gestão de Ata.
 */
export function useSaveAtaTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation<RpcAtaTaskTemplateResult, AppMutationError | Error, AtaTaskTemplateInput>({
    mutationFn: async (input: AtaTaskTemplateInput) => {
      return saveAtaTaskTemplateRpc(input);
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-templates'] });
    }
  });
}
