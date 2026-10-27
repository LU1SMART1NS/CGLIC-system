import React from 'react';
import type { AtaTaskPlan } from '../../types';
import { useAtaTaskTemplates } from '../../hooks/useAtaTaskTemplates';
import { useApplyAtaTaskTemplate } from '../../hooks/useApplyAtaTaskTemplate';
import { useUpdateAtaTask } from '../../hooks/useUpdateAtaTask';
import { useAtaManager } from '../../hooks/useAtaManagers';
import {
  useStartAtaTaskPlan,
  useSaveAtaTaskMacrotask,
  useDeleteAtaTaskMacrotask,
  useDeleteAtaTaskModule,
  useRenameAtaTaskModule,
  useCreateAtaTask,
  useDeleteAtaTask
} from '../../hooks/useAtaTaskPlanEditing';
import { TaskPlanSection, type TaskPlanController, type TaskPlanLabels } from '../plan/TaskPlanSection';
import { useAuth } from '../../context/AuthContext';
import { useAjustarPrazoTarefa, useAtualizarModulo, useMarcarPedidoTarefa, useRegistrarRespostaTarefa } from '../../hooks/useModeloGestao';
import { podeConcluirTarefas } from '../../hooks/useAvisosResolvidos';

interface AtaTasksSectionProps {
  ataKey: string;
  plan: AtaTaskPlan | null;
  isLoading?: boolean;
}

const ATA_LABELS: TaskPlanLabels = {
  semPlanoTitulo: 'Nenhum modelo de gestão aplicado a esta ata',
  semPlanoDescricao: 'Selecione um roteiro operacional pré-configurado para acompanhar prorrogação, adesões e saldo físico desta ata.',
  gestorLabel: 'gestor da Ata',
  herancaMsg: 'Com o gestor da Ata selecionado, a tarefa acompanha automaticamente uma troca de gestor.',
  semGestorMsg: 'Esta ata ainda não tem gestor. Defina-o no topo da página (a tarefa passa a segui-lo) ou informe um responsável aqui.'
};

/** Controlador do plano de gestão de uma Ata: liga os hooks de Ata à tela compartilhada com o Contrato. */
function useAtaPlanController(ataKey: string): TaskPlanController {
  const { data: templates = [], isLoading: loadingTemplates } = useAtaTaskTemplates();
  const applyMutation = useApplyAtaTaskTemplate();
  const startMutation = useStartAtaTaskPlan(ataKey);
  const saveMacro = useSaveAtaTaskMacrotask(ataKey);
  const deleteMacro = useDeleteAtaTaskMacrotask(ataKey);
  const deleteModule = useDeleteAtaTaskModule(ataKey);
  const renameModule = useRenameAtaTaskModule(ataKey);
  const createTask = useCreateAtaTask(ataKey);
  const { data: manager } = useAtaManager(ataKey);
  // A consulta vê o plano sem botões: as RPCs das tarefas só aceitam gestor e coordenador.
  const { role } = useAuth();

  return {
    entityKey: ataKey,
    somenteLeitura: !podeConcluirTarefas(role),
    gestorNome: manager?.gestorNome || undefined,
    labels: ATA_LABELS,
    useUpdateTask: useUpdateAtaTask,
    useMarcarPedido: (key) => useMarcarPedidoTarefa('ata', key),
    useRegistrarResposta: (key) => useRegistrarRespostaTarefa('ata', key),
    useAjustarPrazo: (key) => useAjustarPrazoTarefa('ata', key),
    useAtualizarModulo: (key) => useAtualizarModulo('ata', key),
    useDeleteTask: useDeleteAtaTask,
    // Só os modelos ativos entram no "Aplicar modelo" (os 7 genéricos ficaram inativos na migration 210).
    templates: templates
      .filter((tpl) => tpl.ativo !== false)
      .map((tpl) => ({ id: tpl.id, nome: tpl.nome, quando: tpl.quando, processoTipo: tpl.processoTipo })),
    loadingTemplates,
    applyTemplate: {
      run: (templateId, onSuccess, moduloNome) => applyMutation.mutate({ ataKey, templateId, moduloNome }, { onSuccess }),
      isPending: applyMutation.isPending,
      error: applyMutation.error
    },
    startPlan: { run: () => startMutation.mutate({ ataKey }), isPending: startMutation.isPending, error: startMutation.error },
    saveMacrotask: { run: (vars) => saveMacro.mutate(vars), isPending: saveMacro.isPending, error: saveMacro.error },
    deleteMacrotask: { run: (id) => deleteMacro.mutate(id), isPending: deleteMacro.isPending, error: deleteMacro.error },
    deleteModule: { run: (vars) => deleteModule.mutate(vars), isPending: deleteModule.isPending, error: deleteModule.error },
    renameModule: { run: (vars) => renameModule.mutate(vars), isPending: renameModule.isPending, error: renameModule.error },
    createTask: { run: (vars) => createTask.mutate(vars), isPending: createTask.isPending, error: createTask.error }
  };
}

export const AtaTasksSection: React.FC<AtaTasksSectionProps> = ({ ataKey, plan, isLoading = false }) => {
  const controller = useAtaPlanController(ataKey);
  return <TaskPlanSection plan={plan} isLoading={isLoading} controller={controller} />;
};
