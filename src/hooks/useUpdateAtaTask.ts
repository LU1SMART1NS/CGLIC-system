import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateAtaTaskRpc, definirSeiTarefaAtaRpc, type UpdateAtaTaskInput } from '../adapters/ataManagementRpcAdapter';
import type { RpcUpdateAtaTaskResult, AppMutationError } from '../types/rpc';
import { soMudaStatus } from './taskSeiUpdate';

/** `sei`: undefined mantém o número SEI; texto grava; null ou vazio retira. */
export type UpdateAtaTaskVars = UpdateAtaTaskInput & { sei?: string | null };

/**
 * Hook canônico do React Query para atualizar status/responsável/prazo/observação de uma tarefa
 * do plano de gestão de uma Ata.
 *
 * Como a tarefa não carrega o ataKey da query a invalidar, o chamador (UI) informa a
 * query key do plano a ser invalidada após o sucesso.
 */
export function useUpdateAtaTask(ataKey: string) {
  const queryClient = useQueryClient();

  return useMutation<RpcUpdateAtaTaskResult, AppMutationError | Error, UpdateAtaTaskVars>({
    mutationFn: async ({ sei, ...input }: UpdateAtaTaskVars) => {
      if (sei === undefined) return updateAtaTaskRpc(input);
      // Concluir com o número: uma só gravação (a RPC do número conclui pela RPC de status).
      if (input.status === 'CONCLUIDA' && soMudaStatus(input)) {
        return definirSeiTarefaAtaRpc({ taskId: input.taskId, sei, concluir: true });
      }
      await updateAtaTaskRpc(input);
      return definirSeiTarefaAtaRpc({ taskId: input.taskId, sei });
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-plan', ataKey] });
    }
  });
}
