import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToastProvider } from '../../../design-system';
import { TaskTemplatesPage } from '../TaskTemplatesPage';
import type { TaskTemplatesKit, TemplateMutation } from '../taskTemplatesKit';

const mutation = (): TemplateMutation => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null });

function makeKit(templates: any[], label: string): TaskTemplatesKit {
  return {
    hooks: {
      useTemplates: () => ({ data: templates, isLoading: false, error: null }),
      useSaveTemplate: mutation,
      useDeleteTemplate: mutation,
      useSaveMacrotask: mutation,
      useDeleteMacrotask: mutation,
      useSaveTask: mutation,
      useDeleteTask: mutation
    },
    copy: {
      title: `Modelos de ${label}`,
      subtitle: 'sub',
      createLabel: `Criar modelo de ${label}`,
      namePlaceholder: 'n',
      descriptionPlaceholder: 'd',
      macrotaskPlaceholder: 'm',
      emptyMacrotasks: `Sem macrotarefas (${label})`,
      emptyDescription: `Cadastre o primeiro modelo de ${label}`,
      activeHint: 'hint',
      deleteWarning: 'w'
    }
  };
}

const render = (kit: TaskTemplatesKit) =>
  renderToStaticMarkup(
    <ToastProvider>
      <TaskTemplatesPage kit={kit} />
    </ToastProvider>
  );

describe('TaskTemplatesPage genérica (Atas e Contratos)', () => {
  it('usa os textos do kit e mostra o estado vazio', () => {
    const html = render(makeKit([], 'Ata'));
    expect(html).toContain('Modelos de Ata');
    expect(html).toContain('Criar modelo de Ata');
    expect(html).toContain('Cadastre o primeiro modelo de Ata');
  });

  it('lista os modelos recebidos pelo hook do kit', () => {
    const html = render(
      makeKit(
        [{ id: 't1', nome: 'Plano padrão', ativo: true, macrotarefas: [{ id: 'm1', templateId: 't1', nome: 'Fase 1', ordem: 0, tarefas: [] }] }],
        'Contrato'
      )
    );
    expect(html).toContain('Plano padrão');
    expect(html).toContain('Fase 1');
    expect(html).toContain('Modelos Disponíveis (1)');
  });
});
