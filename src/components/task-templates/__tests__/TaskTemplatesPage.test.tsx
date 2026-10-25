import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToastProvider } from '../../../design-system';
import { TaskTemplatesPage } from '../TaskTemplatesPage';
import type { TaskTemplatesKit, TemplateMutation } from '../taskTemplatesKit';

const auth = vi.hoisted(() => ({ role: 'admin' as string | null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ role: auth.role }) }));

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

const umModelo = [
  {
    id: 't1',
    nome: 'Plano padrão',
    ativo: true,
    macrotarefas: [{ id: 'm1', templateId: 't1', nome: 'Fase 1', ordem: 0, tarefas: [{ id: 'k1', nome: 'Conferir saldo', ordem: 0 }] }]
  }
];

describe('TaskTemplatesPage genérica (Atas e Contratos)', () => {
  beforeEach(() => {
    auth.role = 'admin';
  });

  it('usa os textos do kit e mostra o estado vazio', () => {
    const html = render(makeKit([], 'Ata'));
    expect(html).toContain('Modelos de Ata');
    expect(html).toContain('Novo modelo');
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
    expect(html).toContain('Modelos disponíveis');
  });

  it('coordenador vê os botões de criar, editar e excluir', () => {
    const html = render(makeKit(umModelo, 'Contrato'));
    expect(html).toContain('Novo modelo');
    expect(html).toContain('Excluir modelo Plano padrão');
    expect(html).toContain('Excluir tarefa');
    expect(html).toContain('Adicionar Macrotarefa');
    expect(html).not.toContain('Só o coordenador altera os modelos.');
  });

  it('gestor só vê os modelos, sem criar, editar ou excluir (migration 199)', () => {
    auth.role = 'gestor';
    const html = render(makeKit(umModelo, 'Contrato'));
    expect(html).toContain('Plano padrão');
    expect(html).toContain('Fase 1');
    expect(html).toContain('Conferir saldo');
    expect(html).toContain('Só o coordenador altera os modelos.');
    expect(html).not.toContain('Novo modelo');
    expect(html).not.toContain('Excluir modelo');
    expect(html).not.toContain('Renomear');
    expect(html).not.toContain('Excluir tarefa');
    expect(html).not.toContain('Adicionar Macrotarefa');
    expect(html).not.toContain('Desativar');
  });
});
