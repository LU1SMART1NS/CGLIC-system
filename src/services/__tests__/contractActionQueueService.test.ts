import { describe, it, expect } from 'vitest';
import type { ContractDashboardRecord, ContractTask, ContractTaskPlan } from '../../types';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';
import { buildContractActionQueue } from '../contractActionQueueService';
import { calculateAttentionSummary } from '../dashboardService';
import { addDays, formatDateISO } from '../temporalEngineService';

const KEY = '200331-00010-2026';
const inDays = (n: number) => formatDateISO(addDays(new Date(), n));

const contract: ContractDashboardRecord = {
  id: KEY,
  numero: '00010',
  ano: 2026,
  numeroFormatado: '10/2026',
  uasg: '200331',
  objeto: 'Serviços de TI',
  fornecedorNome: 'TECH CORP',
  fornecedorCnpjCpf: '11.222.333/0001-44',
  valorInicial: 100000,
  valorGlobal: 100000,
  dataAssinatura: inDays(-345),
  dataVigenciaInicio: inDays(-345),
  dataVigenciaFim: inDays(109),
  statusVigencia: 'Vigente',
  fonteDados: 'PNCP'
} as ContractDashboardRecord;

function task(id: string, overrides: Partial<ContractTask>): ContractTask {
  return {
    id,
    macrotaskId: 'macro-1',
    nome: `Tarefa ${id}`,
    ordem: 1,
    status: 'PENDENTE',
    criadoEm: '2026-01-01T00:00:00Z',
    atualizadoEm: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

const plan: ContractTaskPlan = {
  id: 'plan-1',
  contractKey: KEY,
  uasg: '200331',
  numero: '00010',
  ano: 2026,
  templateNome: 'Modelo de execução',
  appliedAt: '2026-01-01T00:00:00Z',
  macrotarefas: [
    {
      id: 'macro-1',
      planId: 'plan-1',
      nome: 'Fiscalização',
      ordem: 1,
      tarefas: [
        task('vencida', { prazo: inDays(-3) }),
        task('em3dias', { prazo: inDays(3), executionMode: 'CONFIRMACAO' }),
        task('em15dias', { prazo: inDays(15) }),
        task('em60dias', { prazo: inDays(60) }),
        task('concluida', { prazo: inDays(3), status: 'CONCLUIDA' }),
        task('semPrazo', {})
      ]
    }
  ],
  progresso: { total: 6, concluidas: 1, pendentes: 5, emAndamento: 0, naoAplicaveis: 0, atrasadas: 1, percentual: 16 }
} as ContractTaskPlan;

const overdueCycle = {
  cycleKey: `${KEY}-PGTO-2026-08-123`,
  contractKey: KEY,
  competencia: '08/2026',
  input: { documentoAtestoSei: '123', valorAtesto: 1500 },
  prazos: { statusPrazo: 'VENCIDO', isVencida: true, diasUteisAteVencimento: -2, diasSemRespostaCgofi: 0 }
} as unknown as PaymentFollowUpCycle;

describe('buildContractActionQueue', () => {
  const queue = buildContractActionQueue({ contract, contractKey: KEY, plan, paymentCycles: [overdueCycle] });

  it('tem os mesmos itens CRÍTICA/URGENTE da Visão Geral, na mesma ordem', () => {
    const funnel = calculateAttentionSummary({ contracts: [contract], plans: { [KEY]: plan }, paymentCycles: [overdueCycle] });
    const pick = (list: { id: string; severity: string }[]) =>
      list.filter((i) => i.severity === 'CRITICA' || i.severity === 'URGENTE').map((i) => [i.id, i.severity]);

    expect(pick(queue.items)).toEqual(pick(funnel.items));
    expect(pick(queue.items).length).toBeGreaterThanOrEqual(3);
  });

  it('traz tarefa vencida, pagamento vencido e tarefa em 3 dias com a ação ligada à tarefa', () => {
    const vencida = queue.items.find((i) => i.taskId === 'vencida');
    const em3 = queue.items.find((i) => i.taskId === 'em3dias');
    const pgto = queue.items.find((i) => i.kind === 'PAGAMENTO');

    expect(vencida).toMatchObject({ kind: 'TAREFA', severity: 'CRITICA', macrotaskName: 'Fiscalização' });
    expect(em3).toMatchObject({ kind: 'TAREFA', severity: 'URGENTE', executionMode: 'CONFIRMACAO' });
    expect(pgto).toMatchObject({ severity: 'CRITICA' });
  });

  it('classifica tarefa entre 8 e 30 dias úteis como ATENÇÃO e deixa de fora as de prazo distante', () => {
    // 15 dias corridos = 8 a 11 dias úteis, conforme o dia da semana e os feriados do período.
    expect(queue.items.find((i) => i.taskId === 'em15dias')).toMatchObject({ severity: 'ATENCAO', badgeLabel: expect.stringMatching(/^\d+ dias úteis$/) });
    expect(queue.items.find((i) => i.taskId === 'em60dias')).toBeUndefined();
  });

  it('não mostra tarefa concluída, nem mesmo com prazo próximo', () => {
    expect(queue.items.find((i) => i.taskId === 'concluida')).toBeUndefined();
  });

  it('mostra os lembretes de prazo legal como INFO, depois das pendências', () => {
    const lembretes = queue.items.filter((i) => i.kind === 'LEMBRETE');
    expect(lembretes.length).toBeGreaterThan(0);
    expect(lembretes.every((l) => l.severity === 'INFO')).toBe(true);
    expect(queue.items.findIndex((i) => i.kind === 'LEMBRETE')).toBeGreaterThan(
      queue.items.findIndex((i) => i.taskId === 'em15dias')
    );
  });

  it('conta tarefas abertas sem prazo e totaliza por severidade', () => {
    expect(queue.tarefasSemPrazo).toBe(1);
    const total = Object.values(queue.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(queue.items.length);
  });

  it('fica vazia para contrato sem plano, sem ciclos e com vigência longa', () => {
    const longo = { ...contract, dataAssinatura: inDays(-30), dataVigenciaInicio: inDays(-30), dataVigenciaFim: inDays(900) };
    const empty = buildContractActionQueue({ contract: longo, contractKey: KEY, plan: null });
    expect(empty.items).toEqual([]);
    expect(empty.tarefasSemPrazo).toBe(0);
  });

  describe('lembretes de prazo legal (D-180/D-60)', () => {
    it('lembretes dispensados saem de items/counts e vão para dispensados', () => {
      const ids = queue.items.filter((i) => i.kind === 'LEMBRETE').map((i) => i.id);
      expect(ids.length).toBeGreaterThan(0);

      const q = buildContractActionQueue({ contract, contractKey: KEY, plan, dismissedReminderIds: [ids[0]] });
      expect(q.items.some((i) => i.id === ids[0])).toBe(false);
      expect(q.dispensados.map((i) => i.id)).toEqual([ids[0]]);
      expect(q.counts.INFO).toBe(queue.counts.INFO - 1);
    });

    it('não gera lembretes de prorrogação para contrato com vigência encerrada', () => {
      const expirado = { ...contract, dataVigenciaInicio: inDays(-1200), dataVigenciaFim: inDays(-400), statusVigencia: 'Expirado' } as ContractDashboardRecord;
      const q = buildContractActionQueue({ contract: expirado, contractKey: KEY, plan: null });
      expect(q.items.filter((i) => i.kind === 'LEMBRETE')).toEqual([]);
      expect(q.dispensados).toEqual([]);
    });
  });

  describe('quantidade de empenho pendente', () => {
    it('vira ação de atenção que leva ao item da ata', () => {
      const q = buildContractActionQueue({ contract, contractKey: KEY, plan: null, pendingEmpenhos: [{ empenhoId: 'e1', numeroEmpenho: '2026NE000262', itemKey: '00059/2025-200331-00001', itemLabel: 'Ata 00059/2025 · Item 1', href: '/atas/detalhe/x/itens/1?aba=contratos' }] });
      const item = q.items.find((i) => i.kind === 'EMPENHO');
      expect(item).toMatchObject({
        severity: 'ATENCAO',
        title: 'Confirmar a quantidade do empenho 2026NE000262',
        description: 'Ata 00059/2025 · Item 1',
        href: '/atas/detalhe/x/itens/1?aba=contratos'
      });
      expect(q.counts.ATENCAO).toBeGreaterThanOrEqual(1);
    });

    it('não gera ação quando não há empenho pendente', () => {
      const q = buildContractActionQueue({ contract, contractKey: KEY, plan: null });
      expect(q.items.some((i) => i.kind === 'EMPENHO')).toBe(false);
    });
  });

  describe('expectativa de pagamento', () => {
    it('nota mensal que não chegou vira ação de pagamento com a gravidade do aviso', () => {
      const q = buildContractActionQueue({
        contract, contractKey: KEY, plan: null,
        avisosPagamento: [{ id: 'AVISO-NOTA-MENSAL-x', tipo: 'NOTA_MENSAL_NAO_CHEGOU', severity: 'URGENTE', title: 'Nota de setembro ainda não chegou', description: 'd', badgeLabel: 'Nota de setembro não chegou', contractKey: KEY, diasRelevantes: -12, targetUrl: '/x' }]
      });
      expect(q.items.find((i) => i.id === 'AVISO-NOTA-MENSAL-x')).toMatchObject({ kind: 'PAGAMENTO', severity: 'URGENTE', badgeLabel: 'Nota de setembro não chegou' });
      expect(q.counts.URGENTE).toBeGreaterThanOrEqual(1);
    });
  });
});
