import React from 'react';
import { TaskTemplatesPage } from '../task-templates/TaskTemplatesPage';
import type { TaskTemplatesKit } from '../task-templates/taskTemplatesKit';
import { useAtaTaskTemplates } from '../../hooks/useAtaTaskTemplates';
import { useSaveAtaTaskTemplate } from '../../hooks/useSaveAtaTaskTemplate';
import { useDeleteAtaTaskTemplate } from '../../hooks/useDeleteAtaTaskTemplate';
import { useSaveAtaTaskTemplateMacrotask } from '../../hooks/useSaveAtaTaskTemplateMacrotask';
import { useDeleteAtaTaskTemplateMacrotask } from '../../hooks/useDeleteAtaTaskTemplateMacrotask';
import { useSaveAtaTaskTemplateTask } from '../../hooks/useSaveAtaTaskTemplateTask';
import { useDeleteAtaTaskTemplateTask } from '../../hooks/useDeleteAtaTaskTemplateTask';

const kit: TaskTemplatesKit = {
  hooks: {
    useTemplates: useAtaTaskTemplates,
    useSaveTemplate: useSaveAtaTaskTemplate,
    useDeleteTemplate: useDeleteAtaTaskTemplate,
    useSaveMacrotask: useSaveAtaTaskTemplateMacrotask,
    useDeleteMacrotask: useDeleteAtaTaskTemplateMacrotask,
    useSaveTask: useSaveAtaTaskTemplateTask,
    useDeleteTask: useDeleteAtaTaskTemplateTask
  },
  copy: {
    title: 'Modelos de Gestão de Atas',
    subtitle: 'Padronização de planos de acompanhamento, checklists e marcos de gestão de Atas de Registro de Preço.',
    createLabel: 'Criar novo modelo de gestão de Ata',
    namePlaceholder: 'Ex: Gestão de Ata de Equipamentos de Proteção',
    descriptionPlaceholder: 'Ex: Checklist padrão de acompanhamento de saldo físico e adesões',
    macrotaskPlaceholder: 'Adicionar nova macrotarefa (ex: 1. Planejamento de Prorrogação)...',
    emptyMacrotasks: 'Nenhuma macrotarefa cadastrada. Adicione uma abaixo para estruturar o acompanhamento da Ata.',
    emptyDescription: 'Cadastre seu primeiro modelo acima para estruturar as rotinas de acompanhamento de Atas.',
    activeHint: 'Modelos ativos podem ser aplicados diretamente na Visão 360° de qualquer Ata.',
    deleteWarning: 'Atas que já aplicaram este modelo não serão afetadas.'
  }
};

export const AtaTaskTemplatesPage: React.FC = () => <TaskTemplatesPage kit={kit} />;
