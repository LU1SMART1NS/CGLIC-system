import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ContractActionQueue } from '../ContractActionQueue';
import type { ContractDashboardRecord, ContractTaskPlan } from '../../../types';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import { addDays, formatDateISO } from '../../../services/temporalEngineService';
import { buildContractActionQueue } from '../../../services/contractActionQueueService';

let mockCycles: PaymentFollowUpCycle[] = [];

vi.mock('../../../hooks/useUpdateContractTask', () => ({
  useUpdateContractTask: () => ({ mutate: vi.fn(), isPending: false })
}));

vi.mock('../../../hooks/useReminderDismissals', () => ({
  useReminderDismissals: () => ({
    dismissedIds: [],
    dismiss: { mutate: vi.fn(), isPending: false },
    restore: { mutate: vi.fn(), isPending: false }
  })
}));

const inDays = (n: number) => formatDateISO(addDays(new Date(), n));

const baseContract: ContractDashboardRecord = {
  id: '200331-00010-2026',
  numero: '00010',
  ano: 2026,
  numeroFormatado: '10/2026',
  uasg: '200331',
  objeto: 'Serviços de TI',
  fornecedorNome: 'TECH CORP',
  fornecedorCnpjCpf: '11.222.333/0001-44',
  valorInicial: 100000,
  valorGlobal: 100000,
  dataAssinatura: inDays(-30),
  dataVigenciaInicio: inDays(-30),
  dataVigenciaFim: inDays(900),
  statusVigencia: 'Vigente',
  fonteDados: 'PNCP'
} as ContractDashboardRecord;

function planWith(prazo: string | undefined, executionMode?: 'CONFIRMACAO'): ContractTaskPlan {
  return {
    id: 'plan-1',
    contractKey: baseContract.id,
    uasg: '200331',
    numero: '00010',
    ano: 2026,
    templateNome: 'Modelo',
    appliedAt: '2026-01-01T00:00:00Z',
    macrotarefas: [
      {
        id: 'macro-1',
        planId: 'plan-1',
        nome: 'Fiscalização',
        ordem: 1,
        tarefas: [
          {
            id: 'task-1',
            macrotaskId: 'macro-1',
            nome: 'Atestar nota fiscal',
            ordem: 1,
            status: 'PENDENTE',
            prazo,
            executionMode,
            criadoEm: '2026-01-01T00:00:00Z',
            atualizadoEm: '2026-01-01T00:00:00Z'
          }
        ]
      }
    ],
    progresso: { total: 1, concluidas: 0, pendentes: 1, emAndamento: 0, naoAplicaveis: 0, atrasadas: 0, percentual: 0 }
  } as ContractTaskPlan;
}

function render(contract: ContractDashboardRecord, plan: ContractTaskPlan | null, url = '/', pendingEmpenhos: Parameters<typeof buildContractActionQueue>[0]['pendingEmpenhos'] = []) {
  const queue = buildContractActionQueue({ contract, contractKey: contract.id, plan, paymentCycles: mockCycles, pendingEmpenhos });
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <ContractActionQueue queue={queue} contractKey={contract.id} plan={plan} onGoTo={() => {}} />
    </MemoryRouter>
  );
}

describe('ContractActionQueue', () => {
  it('mostra "Tudo em dia" quando não há nada a fazer', () => {
    mockCycles = [];
    const html = render(baseContract, null);
    expect(html).toContain('Tudo em dia com este contrato');
  });

  it('mostra tarefa vencida como crítica, com o resumo e o botão Concluir', () => {
    mockCycles = [];
    const html = render(baseContract, planWith(inDays(-3)));
    expect(html).toContain('Atestar nota fiscal');
    expect(html).toContain('data-testid="severity-badge-critica"');
    expect(html).toContain('data-testid="queue-count-critica"');
    expect(html).toContain('1 crítica');
    expect(html).toContain('Tarefa · Fiscalização');
    expect(html).toContain('Concluir');
  });

  it('usa o mesmo botão "Concluir" em tarefa de confirmação', () => {
    mockCycles = [];
    const html = render(baseContract, planWith(inDays(2), 'CONFIRMACAO'));
    expect(html).toContain('Concluir');
    expect(html).not.toContain('Confirmar oficialmente');
    expect(html).toContain('1 urgente');
  });

  it('mostra pagamento vencido com o botão para o ciclo', () => {
    mockCycles = [
      {
        cycleKey: 'c-1',
        contractKey: baseContract.id,
        competencia: '08/2026',
        input: { documentoAtestoSei: '123', valorAtesto: 1500 },
        prazos: { statusPrazo: 'VENCIDO', isVencida: true, diasUteisAteVencimento: -2, diasSemRespostaCgofi: 0 }
      } as unknown as PaymentFollowUpCycle
    ];
    const html = render(baseContract, null);
    expect(html).toContain('Fatura Vencida (123)');
    expect(html).toContain('Abrir ciclo');
  });

  it('mostra lembrete de prazo legal como informativo, com "Aplicar modelo" quando não há plano', () => {
    mockCycles = [];
    const html = render({ ...baseContract, dataVigenciaFim: inDays(109) }, null);
    expect(html).toContain('Início da Análise de Prorrogação');
    expect(html).toContain('data-testid="severity-badge-info"');
    expect(html).toContain('Aplicar modelo');
    expect(html).toContain('Resolvido');
    expect(html).not.toContain('data-testid="queue-count-critica"');
  });

  it('avisa quantas tarefas estão sem prazo', () => {
    mockCycles = [];
    const html = render(baseContract, planWith(undefined));
    expect(html).toContain('Tudo em dia com este contrato');
    expect(html).toContain('1 tarefa do plano está sem prazo definido');
  });

  it('destaca a linha indicada em ?item=', () => {
    mockCycles = [];
    const plan = planWith(inDays(-3));
    const first = render(baseContract, plan);
    const id = /data-action-id="([^"]+)"/.exec(first)![1];
    const html = render(baseContract, plan, `/?item=${encodeURIComponent(id)}`);
    expect(html).toContain('background-color:#eff6ff');
  });

  it('mostra o empenho com quantidade pendente e o botão que leva ao item da ata', () => {
    mockCycles = [];
    const html = render(baseContract, null, '/', [{ empenhoId: 'e1', numeroEmpenho: '2026NE000262', itemKey: '00059/2025-200331-00001', itemLabel: 'Ata 00059/2025 · Item 1', href: '/atas/detalhe/x/itens/1?aba=contratos' }]);
    expect(html).toContain('Confirmar a quantidade do empenho 2026NE000262');
    expect(html).toContain('Execução do contrato');
    expect(html).toContain('Ata 00059/2025 · Item 1');
    expect(html).toContain('title="Confirmar a quantidade no item da ata"');
    expect(html).not.toContain('Tudo em dia com este contrato');
  });
});
