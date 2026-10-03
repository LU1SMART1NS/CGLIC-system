import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AtaTasksSection } from '../AtaTasksSection';
import { ContractTasksSection } from '../../contracts/ContractTasksSection';
import type { AtaTask, AtaTaskPlan, ContractDashboardRecord, ContractTask, ContractTaskPlan } from '../../../types';

const { idle } = vi.hoisted(() => ({ idle: () => ({ mutate: () => {}, isPending: false, error: null }) }));

vi.mock('../../../hooks/useUpdateAtaTask', () => ({ useUpdateAtaTask: idle }));
vi.mock('../../../hooks/useApplyAtaTaskTemplate', () => ({ useApplyAtaTaskTemplate: idle }));
vi.mock('../../../hooks/useAtaTaskTemplates', () => ({ useAtaTaskTemplates: () => ({ data: [], isLoading: false }) }));
vi.mock('../../../hooks/useAtaManagers', () => ({ useAtaManager: () => ({ data: { gestorNome: 'Maria Gestora' } }) }));
vi.mock('../../../hooks/useAtaTaskPlanEditing', () => ({
  useStartAtaTaskPlan: idle,
  useSaveAtaTaskMacrotask: idle,
  useDeleteAtaTaskMacrotask: idle,
  useDeleteAtaTaskModule: idle,
  useRenameAtaTaskModule: idle,
  useCreateAtaTask: idle,
  useDeleteAtaTask: idle
}));

vi.mock('../../../hooks/useUpdateContractTask', () => ({ useUpdateContractTask: idle }));
vi.mock('../../../hooks/useApplyContractTaskTemplate', () => ({ useApplyContractTaskTemplate: idle }));
vi.mock('../../../hooks/useContractTaskTemplates', () => ({ useContractTaskTemplates: () => ({ data: [], isLoading: false }) }));
vi.mock('../../../hooks/useContractManager', () => ({ useContractManager: () => ({ data: { gestorNome: 'Maria Gestora' } }) }));
vi.mock('../../../hooks/useContractTaskPlanEditing', () => ({
  useStartContractTaskPlan: idle,
  useSaveContractTaskMacrotask: idle,
  useDeleteContractTaskMacrotask: idle,
  useDeleteContractTaskModule: idle,
  useRenameContractTaskModule: idle,
  useCreateContractTask: idle,
  useDeleteContractTask: idle
}));

const progresso = { total: 2, concluidas: 1, pendentes: 1, emAndamento: 0, naoAplicaveis: 0, atrasadas: 0, percentual: 50 };
const base = { ordem: 0, criadoEm: 'x', atualizadoEm: 'x' };

const ataPlan: AtaTaskPlan = {
  id: 'plan-ata',
  ataKey: '00011/2026',
  templateNome: 'Gestão de Plano',
  appliedAt: '2026-09-29T00:00:00Z',
  progresso,
  macrotarefas: [
    {
      id: 'm-1',
      planId: 'plan-ata',
      nome: 'Prorrogação',
      ordem: 0,
      tarefas: [
        { ...base, id: 't-1', macrotaskId: 'm-1', nome: 'Consultar fornecedor', status: 'CONCLUIDA' } as AtaTask,
        { ...base, id: 't-2', macrotaskId: 'm-1', nome: 'Elaborar minuta', status: 'PENDENTE', responsavelNome: 'João Fiscal' } as AtaTask
      ]
    }
  ]
};

const contract = { id: '200331-15-2026', uasg: '200331', numero: '15', ano: 2026 } as unknown as ContractDashboardRecord;
const contractPlan: ContractTaskPlan = {
  id: 'plan-c',
  contractKey: contract.id,
  uasg: '200331',
  numero: '15',
  ano: 2026,
  templateNome: 'Gestão de Plano',
  appliedAt: '2026-09-29T00:00:00Z',
  progresso,
  macrotarefas: [
    {
      id: 'm-1',
      planId: 'plan-c',
      nome: 'Prorrogação',
      ordem: 0,
      tarefas: [
        { ...base, id: 't-1', macrotaskId: 'm-1', nome: 'Consultar fornecedor', status: 'CONCLUIDA' } as ContractTask,
        { ...base, id: 't-2', macrotaskId: 'm-1', nome: 'Elaborar minuta', status: 'PENDENTE', responsavelNome: 'João Fiscal' } as ContractTask
      ]
    }
  ]
};

describe('AtaTasksSection — mesma tela do plano de gestão do Contrato', () => {
  it('mostra o resumo no SummaryBar, as etapas e o gestor herdado', () => {
    const html = renderToStaticMarkup(<AtaTasksSection ataKey="00011/2026" plan={ataPlan} />);
    expect(html).toContain('data-testid="task-plan-summary"');
    expect(html).toContain('1 modelo aplicado');
    expect(html).toContain('1 de 2');
    expect(html).toContain('Resp: João Fiscal');
    expect(html).toContain('aria-label="Renomear etapa"');
    expect(html).toContain('aria-label="Excluir tarefa"');
    expect(html).toContain('Adicionar tarefa');
    expect(html).toContain('Nova etapa');
  });

  it('sem plano, mostra o estado vazio do design system com o texto da Ata', () => {
    const html = renderToStaticMarkup(<AtaTasksSection ataKey="00011/2026" plan={null} />);
    expect(html).toContain('data-testid="task-plan-empty"');
    expect(html).toContain('Nenhum Modelo de Gestão aplicado a esta Ata');
    expect(html).toContain('Começar do zero');
    expect(html).toContain('Aplicar Modelo');
    expect(html).not.toContain('Nenhum Modelo de Gestão aplicado a este contrato');
  });

  it('carregando usa o esqueleto compartilhado, não um texto solto', () => {
    const html = renderToStaticMarkup(<AtaTasksSection ataKey="00011/2026" plan={null} isLoading />);
    expect(html).toContain('data-testid="task-plan-loading-loading"');
    expect(html).not.toContain('Carregando plano de tarefas');
  });

  it('Ata e Contrato desenham a mesma tela: só mudam os textos do instrumento', () => {
    const ata = renderToStaticMarkup(<AtaTasksSection ataKey="00011/2026" plan={ataPlan} />);
    const contrato = renderToStaticMarkup(<ContractTasksSection contract={contract} plan={contractPlan} />);
    const estrutura = (html: string) =>
      Array.from(html.matchAll(/data-testid="([^"]+)"|aria-label="([^"]+)"/g)).map((m) => m[1] ?? m[2]);
    expect(estrutura(ata)).toEqual(estrutura(contrato));
  });
});
