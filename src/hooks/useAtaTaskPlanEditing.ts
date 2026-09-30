import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  startAtaTaskPlanRpc,
  saveAtaTaskMacrotaskRpc,
  deleteAtaTaskMacrotaskRpc,
  deleteAtaTaskModuleRpc,
  createAtaTaskRpc,
  deleteAtaTaskRpc,
  type DeleteAtaTaskModuleInput,
  type SaveAtaTaskMacrotaskInput,
  type CreateAtaTaskInput
} from '../adapters/ataManagementRpcAdapter';
import type {
  RpcStartTaskPlanResult,
  RpcTaskPlanMacrotaskResult,
  RpcCreateTaskResult,
  RpcGenericDeleteResult,
  AppMutationError
} from '../types/rpc';

/**
 * Hooks do Plano de Gestão da Ata editável pelo gestor: iniciar plano vazio,
 * criar/renomear/excluir etapas e criar/excluir tarefas. Todos invalidam o plano da Ata.
 * (Renomear/editar tarefa continua em useUpdateAtaTask.)
 */
function usePlanMutation<TResult, TInput>(ataKey: string, mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation<TResult, AppMutationError | Error, TInput>({
    mutationFn,
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ata-task-plan', ataKey] });
    }
  });
}

export const useStartAtaTaskPlan = (ataKey: string) =>
  usePlanMutation<RpcStartTaskPlanResult, { ataKey: string }>(ataKey, startAtaTaskPlanRpc);

export const useSaveAtaTaskMacrotask = (ataKey: string) =>
  usePlanMutation<RpcTaskPlanMacrotaskResult, SaveAtaTaskMacrotaskInput>(ataKey, saveAtaTaskMacrotaskRpc);

export const useDeleteAtaTaskMacrotask = (ataKey: string) =>
  usePlanMutation<RpcGenericDeleteResult, string>(ataKey, deleteAtaTaskMacrotaskRpc);

export const useDeleteAtaTaskModule = (ataKey: string) =>
  usePlanMutation<RpcGenericDeleteResult, DeleteAtaTaskModuleInput>(ataKey, deleteAtaTaskModuleRpc);

export const useCreateAtaTask = (ataKey: string) =>
  usePlanMutation<RpcCreateTaskResult, CreateAtaTaskInput>(ataKey, createAtaTaskRpc);

export const useDeleteAtaTask = (ataKey: string) =>
  usePlanMutation<RpcGenericDeleteResult, string>(ataKey, deleteAtaTaskRpc);
