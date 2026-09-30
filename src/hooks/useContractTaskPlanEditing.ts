import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  startContractTaskPlanRpc,
  saveContractTaskMacrotaskRpc,
  deleteContractTaskMacrotaskRpc,
  deleteContractTaskModuleRpc,
  createContractTaskRpc,
  deleteContractTaskRpc,
  type DeleteTaskPlanModuleInput,
  type StartContractTaskPlanInput,
  type SaveContractTaskMacrotaskInput,
  type CreateContractTaskInput
} from '../adapters/contractManagementRpcAdapter';
import type {
  RpcStartTaskPlanResult,
  RpcTaskPlanMacrotaskResult,
  RpcCreateTaskResult,
  RpcGenericDeleteResult,
  AppMutationError
} from '../types/rpc';

/**
 * Hooks do Plano de Gestão editável pelo gestor do contrato: iniciar plano vazio,
 * criar/renomear/excluir etapas e criar/excluir tarefas. Todos invalidam o plano do contrato.
 * (Renomear/editar tarefa continua em useUpdateContractTask.)
 */
function usePlanMutation<TResult, TInput>(contractKey: string, mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation<TResult, AppMutationError | Error, TInput>({
    mutationFn,
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-task-plan', contractKey] });
    }
  });
}

export const useStartContractTaskPlan = (contractKey: string) =>
  usePlanMutation<RpcStartTaskPlanResult, StartContractTaskPlanInput>(contractKey, startContractTaskPlanRpc);

export const useSaveContractTaskMacrotask = (contractKey: string) =>
  usePlanMutation<RpcTaskPlanMacrotaskResult, SaveContractTaskMacrotaskInput>(contractKey, saveContractTaskMacrotaskRpc);

export const useDeleteContractTaskMacrotask = (contractKey: string) =>
  usePlanMutation<RpcGenericDeleteResult, string>(contractKey, deleteContractTaskMacrotaskRpc);

export const useDeleteContractTaskModule = (contractKey: string) =>
  usePlanMutation<RpcGenericDeleteResult, DeleteTaskPlanModuleInput>(contractKey, deleteContractTaskModuleRpc);

export const useCreateContractTask = (contractKey: string) =>
  usePlanMutation<RpcCreateTaskResult, CreateContractTaskInput>(contractKey, createContractTaskRpc);

export const useDeleteContractTask = (contractKey: string) =>
  usePlanMutation<RpcGenericDeleteResult, string>(contractKey, deleteContractTaskRpc);
