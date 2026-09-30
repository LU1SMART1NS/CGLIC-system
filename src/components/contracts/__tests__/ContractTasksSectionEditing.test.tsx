import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractTasksSection } from '../ContractTasksSection';
import { describeResponsavel } from '../planTaskEditing';
import type { ContractDashboardRecord, ContractTaskPlan } from '../../../types';

const mocks = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  deleteTaskMutate: vi.fn(),
  createTaskMutate: vi.fn(),
  saveMacroMutate: vi.fn(),
  deleteMacroMutate: vi.fn(),
  startPlanMutate: vi.fn(),
  applyMutate: vi.fn()
}));

const idle = (mutate: any) => ({ mutate, isPending: false, error: null });

vi.mock('../../../hooks/useUpdateContractTask', () => ({ useUpdateContractTask: () => idle(mocks.updateMutate) }));
vi.mock('../../../hooks/useApplyContractTaskTemplate', () => ({ useApplyContractTaskTemplate: () => idle(mocks.applyMutate) }));
vi.mock('../../../hooks/useContractTaskTemplates', () => ({
  useContractTaskTemplates: () => ({ data: [{ id: 'tpl-1', nome: 'Execução Contratual' }], isLoading: false })
}));
vi.mock('../../../hooks/useContractManager', () => ({
  useContractManager: () => ({ data: { gestorNome: 'Maria Gestora' } })
}));
vi.mock('../../../hooks/useContractTaskPlanEditing', () => ({
  useStartContractTaskPlan: () => idle(mocks.startPlanMutate),
  useSaveContractTaskMacrotask: () => idle(mocks.saveMacroMutate),
  useDeleteContractTaskMacrotask: () => idle(mocks.deleteMacroMutate),
  useDeleteContractTaskModule: () => idle(vi.fn()),
  useCreateContractTask: () => idle(mocks.createTaskMutate),
  useDeleteContractTask: () => idle(mocks.deleteTaskMutate)
}));

const contract = { id: '200331-15-2026', uasg: '200331', numero: '15', ano: 2026 } as unknown as ContractDashboardRecord;

const plan: ContractTaskPlan = {
  id: 'plan-1',
  contractKey: '200331-15-2026',
  uasg: '200331',
  numero: '15',
  ano: 2026,
  templateNome: 'Plano personalizado',
  appliedAt: '2026-09-01T00:00:00Z',
  progresso: { total: 2, concluidas: 0, pendentes: 2, emAndamento: 0, naoAplicaveis: 0, atrasadas: 0, percentual: 0 },
  macrotarefas: [
    {
      id: 'ctmt-1',
      planId: 'plan-1',
      nome: 'Conferência',
      ordem: 0,
      tarefas: [
        { id: 'ctt-1', macrotaskId: 'ctmt-1', nome: 'Do modelo', ordem: 0, status: 'PENDENTE', criadoEm: 'x', atualizadoEm: 'x' },
        { id: 'ctt-2', macrotaskId: 'ctmt-1', nome: 'Minha tarefa', ordem: 1, status: 'PENDENTE', origem: 'PERSONALIZADA', responsavelNome: 'João Fiscal', criadoEm: 'x', atualizadoEm: 'x' }
      ]
    }
  ]
};

describe('describeResponsavel', () => {
  it('usa o responsável próprio, senão o gestor herdado, senão nada', () => {
    expect(describeResponsavel('João Fiscal', 'Maria Gestora')).toBe('João Fiscal');
    expect(describeResponsavel(undefined, 'Maria Gestora')).toBe('Maria Gestora (gestor)');
    expect(describeResponsavel(undefined, undefined)).toBeNull();
  });
});

describe('ContractTasksSection — plano editável pelo gestor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o gestor do contrato como responsável herdado e o responsável próprio quando existir', () => {
    const html = renderToStaticMarkup(<ContractTasksSection contract={contract} plan={plan} />);
    expect(html).toContain('Resp: Maria Gestora (gestor)');
    expect(html).toContain('Resp: João Fiscal');
  });

  it('marca tarefas criadas pelo gestor como Personalizada', () => {
    const html = renderToStaticMarkup(<ContractTasksSection contract={contract} plan={plan} />);
    expect(html.match(/Personalizada/g)).toHaveLength(1);
  });

  it('oferece criar tarefa, criar etapa, excluir tarefa/etapa, renomear etapa e acrescentar modelo', () => {
    const html = renderToStaticMarkup(<ContractTasksSection contract={contract} plan={plan} />);
    expect(html).toContain('Adicionar tarefa');
    expect(html).toContain('Nova etapa');
    expect(html).toContain('aria-label="Excluir tarefa"');
    expect(html).toContain('aria-label="Excluir etapa"');
    expect(html).toContain('aria-label="Renomear etapa"');
    expect(html).toContain('Aplicar modelo');
  });

  it('plano criado do zero não exibe rótulo "Modelo:"', () => {
    const html = renderToStaticMarkup(<ContractTasksSection contract={contract} plan={plan} />);
    expect(html).toContain('Plano personalizado');
    expect(html).not.toContain('Modelo: Plano personalizado');
  });

  it('sem plano: oferece "Começar do zero" além de aplicar modelo', () => {
    const html = renderToStaticMarkup(<ContractTasksSection contract={contract} plan={null} />);
    expect(html).toContain('Começar do zero');
    expect(html).toContain('Aplicar Modelo');
  });
});
