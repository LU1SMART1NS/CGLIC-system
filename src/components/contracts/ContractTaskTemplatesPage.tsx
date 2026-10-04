import React from 'react';
import { TaskTemplatesPage } from '../task-templates/TaskTemplatesPage';
import type { TaskTemplatesKit } from '../task-templates/taskTemplatesKit';
import { useContractTaskTemplates } from '../../hooks/useContractTaskTemplates';
import { useSaveContractTaskTemplate } from '../../hooks/useSaveContractTaskTemplate';
import { useDeleteContractTaskTemplate } from '../../hooks/useDeleteContractTaskTemplate';
import { useSaveContractTaskTemplateMacrotask } from '../../hooks/useSaveContractTaskTemplateMacrotask';
import { useDeleteContractTaskTemplateMacrotask } from '../../hooks/useDeleteContractTaskTemplateMacrotask';
import { useSaveContractTaskTemplateTask } from '../../hooks/useSaveContractTaskTemplateTask';
import { useDeleteContractTaskTemplateTask } from '../../hooks/useDeleteContractTaskTemplateTask';

const kit: TaskTemplatesKit = {
  hooks: {
    useTemplates: useContractTaskTemplates,
    useSaveTemplate: useSaveContractTaskTemplate,
    useDeleteTemplate: useDeleteContractTaskTemplate,
    useSaveMacrotask: useSaveContractTaskTemplateMacrotask,
    useDeleteMacrotask: useDeleteContractTaskTemplateMacrotask,
    useSaveTask: useSaveContractTaskTemplateTask,
    useDeleteTask: useDeleteContractTaskTemplateTask
  },
  copy: {
    title: 'Modelos de Gestão',
    subtitle: 'Padronização de planos de trabalho, checklists de fiscalização e marcos de acompanhamento contratual.',
    createLabel: 'Criar novo modelo de gestão',
    namePlaceholder: 'Ex: Gestão de Contrato de TI e Licenciamento',
    descriptionPlaceholder: 'Ex: Checklist padrão com medições mensais, relatórios e atesto de notas fiscais',
    macrotaskPlaceholder: 'Adicionar nova macrotarefa (ex: 1. Fase Inicial / Medição Mensal)...',
    emptyMacrotasks: 'Nenhuma macrotarefa cadastrada. Adicione uma abaixo para estruturar o fluxo de fiscalização.',
    emptyDescription: 'Cadastre seu primeiro modelo acima para estruturar as rotinas contratuais da equipe.',
    activeHint: 'Modelos ativos podem ser aplicados diretamente na aba Tarefas & Fiscalização de qualquer contrato.',
    deleteWarning: 'Contratos que já aplicaram este modelo não serão afetados.'
  }
};

export const ContractTaskTemplatesPage: React.FC<{ embedded?: boolean }> = ({ embedded }) => (
  <TaskTemplatesPage kit={kit} embedded={embedded} />
);
