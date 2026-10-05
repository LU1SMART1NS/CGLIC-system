import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractTasksSection } from '../ContractTasksSection';
import type { ContractDashboardRecord, ContractTask, ContractTaskPlan } from '../../../types';
import { addBusinessDays as addDays, formatDateISO } from '../../../services/temporalEngineService';

const { idle } = vi.hoisted(() => ({ idle: () => ({ mutate: () => {}, isPending: false, error: null }) }));

vi.mock('../../../hooks/useUpdateContractTask', () => ({ useUpdateContractTask: idle }));
vi.mock('../../../hooks/useApplyContractTaskTemplate', () => ({ useApplyContractTaskTemplate: idle }));
vi.mock('../../../hooks/useContractTaskTemplates', () => ({
  useContractTaskTemplates: () => ({ data: [], isLoading: false })
}));
vi.mock('../../../hooks/useContractManager', () => ({ useContractManager: () => ({ data: undefined }) }));
vi.mock('../../../hooks/useContractTaskPlanEditing', () => ({
  useStartContractTaskPlan: idle,
  useSaveContractTaskMacrotask: idle,
  useDeleteContractTaskMacrotask: idle,
  useDeleteContractTaskModule: idle,
  useRenameContractTaskModule: idle,
  useCreateContractTask: idle,
  useDeleteContractTask: idle
}));

const contract = { id: '200331-15-2026', uasg: '200331', numero: '15', ano: 2026 } as unknown as ContractDashboardRecord;

const task = (id: string, macrotaskId: string, overrides: Partial<ContractTask> = {}): ContractTask => ({
  id,
  macrotaskId,
  nome: `Tarefa ${id}`,
  ordem: 0,
  status: 'PENDENTE',
  criadoEm: 'x',
  atualizadoEm: 'x',
  ...overrides
});

const plan = {
  id: 'plan-1',
  contractKey: contract.id,
  uasg: '200331',
  numero: '15',
  ano: 2026,
  templateNome: 'Acompanhamento de Pagamento',
  appliedAt: '2026-09-29T00:00:00Z',
  progresso: { total: 3, concluidas: 0, pendentes: 3, emAndamento: 0, naoAplicaveis: 0, atrasadas: 1, percentual: 0 },
  macrotarefas: [
    {
      id: 'm-1',
      planId: 'plan-1',
      nome: 'Recepção do atesto',
      ordem: 0,
      modulo: { id: 'mod-pgto', nome: 'Acompanhamento de Pagamento', appliedAt: '2026-09-29T00:00:00Z' },
      tarefas: [task('t-1', 'm-1', { prazo: formatDateISO(addDays(new Date(), -2)) })]
    },
    {
      id: 'm-2',
      planId: 'plan-1',
      nome: 'Análise da alteração',
      ordem: 1,
      modulo: { id: 'mod-alt', nome: 'Alteração Administrativa', appliedAt: '2026-09-29T00:00:00Z' },
      tarefas: [task('t-2', 'm-2')]
    },
    {
      id: 'm-3',
      planId: 'plan-1',
      nome: 'Minha etapa',
      ordem: 2,
      origem: 'PERSONALIZADA',
      tarefas: [task('t-3', 'm-3')]
    }
  ]
} as unknown as ContractTaskPlan;

describe('ContractTasksSection — vários modelos', () => {
  const html = renderToStaticMarkup(<ContractTasksSection contract={contract} plan={plan} />);

  it('resume o plano pela quantidade de modelos, sem repetir os nomes no topo', () => {
    expect(html).toContain('2 modelos aplicados + etapas personalizadas');
    expect(html).not.toContain('Modelos aplicados:');
  });

  it('permite recolher cada módulo e recolher todos de uma vez', () => {
    expect(html.match(/title="Recolher módulo"/g)).toHaveLength(3);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Recolher todos');
  });

  it('mostra no cabeçalho do módulo quantas tarefas estão atrasadas', () => {
    expect(html).toContain('1 atrasada');
  });
});
