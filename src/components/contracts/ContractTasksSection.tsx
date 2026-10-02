import React from 'react';
import type { ContractDashboardRecord, ContractTaskPlan } from '../../types';
import { useContractTaskTemplates } from '../../hooks/useContractTaskTemplates';
import { useApplyContractTaskTemplate } from '../../hooks/useApplyContractTaskTemplate';
import { useUpdateContractTask } from '../../hooks/useUpdateContractTask';
import { useContractManager } from '../../hooks/useContractManager';
import {
  useStartContractTaskPlan,
  useSaveContractTaskMacrotask,
  useDeleteContractTaskMacrotask,
  useDeleteContractTaskModule,
  useCreateContractTask,
  useDeleteContractTask
} from '../../hooks/useContractTaskPlanEditing';
import { getContractManagementKey } from '../../services/contractManagementService';
import { TaskPlanSection, type TaskPlanController, type TaskPlanLabels } from '../plan/TaskPlanSection';

interface ContractTasksSectionProps {
  contract: ContractDashboardRecord;
  plan: ContractTaskPlan | null;
  isLoading?: boolean;
}

const CONTRACT_LABELS: TaskPlanLabels = {
  semPlanoTitulo: 'Nenhum Modelo de Gestão aplicado a este contrato',
  semPlanoDescricao:
    'Selecione um roteiro operacional pré-configurado (Lei nº 14.133/2021) para acompanhar as etapas de execução, prorrogação e encerramento.',
  gestorLabel: 'gestor do contrato',
  herancaMsg: 'Com o gestor do contrato selecionado, a tarefa acompanha automaticamente uma troca de Gestor Titular.',
  semGestorMsg:
    'Este contrato ainda não tem Gestor Titular. Defina-o no topo da página (a tarefa passa a segui-lo) ou informe um responsável aqui.'
};

/** Controlador do plano de gestão de um contrato: liga os hooks de contrato à tela compartilhada. */
function useContractPlanController(contract: ContractDashboardRecord): TaskPlanController {
  const contractKey = contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano);
  const anoNum = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);
  const { data: templates = [], isLoading: loadingTemplates } = useContractTaskTemplates();
  const applyMutation = useApplyContractTaskTemplate();
  const startMutation = useStartContractTaskPlan(contractKey);
  const saveMacro = useSaveContractTaskMacrotask(contractKey);
  const deleteMacro = useDeleteContractTaskMacrotask(contractKey);
  const deleteModule = useDeleteContractTaskModule(contractKey);
  const createTask = useCreateContractTask(contractKey);
  const { data: manager } = useContractManager(contractKey);

  return {
    entityKey: contractKey,
    gestorNome: manager?.gestorNome || undefined,
    labels: CONTRACT_LABELS,
    useUpdateTask: useUpdateContractTask,
    useDeleteTask: useDeleteContractTask,
    templates,
    loadingTemplates,
    applyTemplate: {
      run: (templateId, onSuccess) =>
        applyMutation.mutate({ uasg: contract.uasg, numero: contract.numero, ano: anoNum, templateId }, { onSuccess }),
      isPending: applyMutation.isPending,
      error: applyMutation.error
    },
    startPlan: {
      run: () => startMutation.mutate({ uasg: contract.uasg, numero: contract.numero, ano: anoNum }),
      isPending: startMutation.isPending,
      error: startMutation.error
    },
    saveMacrotask: { run: (vars) => saveMacro.mutate(vars), isPending: saveMacro.isPending, error: saveMacro.error },
    deleteMacrotask: { run: (id) => deleteMacro.mutate(id), isPending: deleteMacro.isPending, error: deleteMacro.error },
    deleteModule: { run: (vars) => deleteModule.mutate(vars), isPending: deleteModule.isPending, error: deleteModule.error },
    createTask: { run: (vars) => createTask.mutate(vars), isPending: createTask.isPending, error: createTask.error }
  };
}

export const ContractTasksSection: React.FC<ContractTasksSectionProps> = ({ contract, plan, isLoading = false }) => {
  const controller = useContractPlanController(contract);
  return <TaskPlanSection plan={plan} isLoading={isLoading} controller={controller} />;
};
