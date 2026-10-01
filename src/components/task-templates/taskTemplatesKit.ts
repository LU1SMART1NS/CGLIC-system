import React from 'react';

/** Formato comum dos modelos de gestão (Atas e Contratos têm a mesma estrutura). */
export interface TaskTemplateTask {
  id: string;
  nome: string;
  ordem: number;
  executionMode?: any;
}

export interface TaskTemplateMacrotask {
  id: string;
  templateId: string;
  nome: string;
  ordem: number;
  tarefas: TaskTemplateTask[];
}

export interface TaskTemplate {
  id: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
  macrotarefas: TaskTemplateMacrotask[];
}

/** Subconjunto do resultado de `useMutation` usado pela tela (métodos: aceita hooks com variáveis diferentes). */
export interface TemplateMutation {
  mutate(variables: any, options?: { onSuccess?: () => void; onError?: (error: any) => void }): void;
  reset(): void;
  isPending: boolean;
  isError: boolean;
  error: { message?: string } | null;
}

export interface TaskTemplatesHooks {
  useTemplates(): { data?: TaskTemplate[]; isLoading: boolean; error: Error | null };
  useSaveTemplate(): TemplateMutation;
  useDeleteTemplate(): TemplateMutation;
  useSaveMacrotask(): TemplateMutation;
  useDeleteMacrotask(): TemplateMutation;
  useSaveTask(): TemplateMutation;
  useDeleteTask(): TemplateMutation;
}

/** Textos que mudam entre Atas e Contratos. */
export interface TaskTemplatesCopy {
  title: string;
  subtitle: string;
  createLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  macrotaskPlaceholder: string;
  emptyMacrotasks: string;
  emptyDescription: string;
  activeHint: string;
  /** Complemento da confirmação de exclusão do modelo. */
  deleteWarning: string;
}

export interface TaskTemplatesKit {
  hooks: TaskTemplatesHooks;
  copy: TaskTemplatesCopy;
}

export const TaskTemplatesKitContext = React.createContext<TaskTemplatesKit | null>(null);

export function useTaskTemplatesKit(): TaskTemplatesKit {
  const ctx = React.useContext(TaskTemplatesKitContext);
  if (!ctx) throw new Error('TaskTemplatesPage deve receber um kit de hooks e textos');
  return ctx;
}
