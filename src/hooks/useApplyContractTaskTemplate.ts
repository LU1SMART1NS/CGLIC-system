import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  applyContractTaskTemplateRpc,
  type ApplyContractTaskTemplateInput
} from '../adapters/contractManagementRpcAdapter';
import type { RpcApplyContractTaskTemplateResult, AppMutationError } from '../types/rpc';
import { getContractManagementKey } from '../services/contractManagementService';

/**
 * Hook canônico do React Query para aplicar um Template de Gestão Contratual a um contrato.
 * Copia as macrotarefas/tarefas do template para o contrato de forma independente e atômica.
 */
export function useApplyContractTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation<RpcApplyContractTaskTemplateResult, AppMutationError | Error, ApplyContractTaskTemplateInput>({
    mutationFn: async (input: ApplyContractTaskTemplateInput) => {
      return applyContractTaskTemplateRpc(input);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      const contractKey = getContractManagementKey(variables.uasg, variables.numero, variables.ano);
      queryClient.invalidateQueries({ queryKey: ['contract-task-plan', contractKey] });
    }
  });
}
