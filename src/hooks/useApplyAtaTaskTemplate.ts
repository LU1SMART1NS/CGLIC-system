import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  applyAtaTaskTemplateRpc,
  type ApplyAtaTaskTemplateInput
} from '../adapters/ataManagementRpcAdapter';
import type { RpcApplyAtaTaskTemplateResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para aplicar um Template de Gestão de Ata a uma Ata.
 * Copia as macrotarefas/tarefas do template para a Ata de forma independente e atômica.
 */
export function useApplyAtaTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation<RpcApplyAtaTaskTemplateResult, AppMutationError | Error, ApplyAtaTaskTemplateInput>({
    mutationFn: async (input: ApplyAtaTaskTemplateInput) => {
      return applyAtaTaskTemplateRpc(input);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-plan', variables.ataKey] });
    }
  });
}
