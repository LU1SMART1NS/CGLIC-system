import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateContractTaskRpc,
  definirSeiTarefaContratoRpc,
  type UpdateContractTaskInput
} from '../adapters/contractManagementRpcAdapter';
import type { RpcUpdateContractTaskResult, AppMutationError } from '../types/rpc';
import { soMudaStatus } from './taskSeiUpdate';

/** `sei`: undefined mantém o número SEI; texto grava; null ou vazio retira. */
export type UpdateContractTaskVars = UpdateContractTaskInput & { sei?: string | null };

/**
 * Hook canônico do React Query para atualizar status/responsável/prazo/observação de uma tarefa
 * do plano de gestão de um contrato.
 *
 * Como a tarefa não carrega o contractKey da query a invalidar, o chamador (UI) informa a
 * query key do plano a ser invalidada após o sucesso.
 */
export function useUpdateContractTask(contractKey: string) {
  const queryClient = useQueryClient();

  return useMutation<RpcUpdateContractTaskResult, AppMutationError | Error, UpdateContractTaskVars>({
    mutationFn: async ({ sei, ...input }: UpdateContractTaskVars) => {
      if (sei === undefined) return updateContractTaskRpc(input);
      // Concluir com o número: uma só gravação (a RPC do número conclui pela RPC de status).
      if (input.status === 'CONCLUIDA' && soMudaStatus(input)) {
        return definirSeiTarefaContratoRpc({ taskId: input.taskId, sei, concluir: true });
      }
      await updateContractTaskRpc(input);
      return definirSeiTarefaContratoRpc({ taskId: input.taskId, sei });
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-plan', contractKey] });
    }
  });
}
