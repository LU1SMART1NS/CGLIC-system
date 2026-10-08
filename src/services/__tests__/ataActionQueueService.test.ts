import { describe, it, expect } from 'vitest';
import { buildAtaActionQueue } from '../ataActionQueueService';
import { buildAtaLifeline } from '../contractLifelineService';
import type { ArpRecord, AtaTaskPlan } from '../../types';

const HOJE = new Date('2026-09-30T12:00:00');

const arp = {
  numeroAtaRegistroPreco: '00059/2025',
  codigoUnidadeGerenciadora: '200331',
  dataAssinatura: '2025-10-10',
  dataVigenciaInicial: '2025-10-10',
  dataVigenciaFinal: '2026-10-10'
} as ArpRecord;

const task = (id: string, prazo: string | undefined, status = 'PENDENTE') => ({
  id,
  macrotaskId: 'm1',
  nome: `Tarefa ${id}`,
  ordem: 1,
  status,
  prazo,
  criadoEm: '',
  atualizadoEm: ''
});

const plan = {
  id: 'p1',
  ataKey: '00059/2025',
  templateNome: 'Modelo',
  appliedAt: '',
  macrotarefas: [
    {
      id: 'm1',
      planId: 'p1',
      nome: 'Prorrogação',
      ordem: 1,
      tarefas: [
        task('vencida', '2026-09-20'),
        task('urgente', '2026-10-03'),
        task('atencao', '2026-10-20'),
        task('longe', '2026-12-30'),
        task('sem-prazo', undefined),
        task('concluida', '2026-09-01', 'CONCLUIDA')
      ]
    }
  ],
  progresso: {}
} as unknown as AtaTaskPlan;

describe('buildAtaActionQueue — fila única da Ata 360', () => {
  it('classifica saldo, tarefas e lembretes com as mesmas regras do Contrato 360', () => {
    const queue = buildAtaActionQueue({
      arp,
      saldos: [
        { numero_item: '1', descricao_item: 'Tablet', percentual_consumido: 100 },
        { numero_item: '2', percentual_consumido: 90 },
        { numero_item: '3', percentual_consumido: 75 },
        { numero_item: '4', percentual_consumido: 10 }
      ],
      plan,
      currentDate: HOJE
    });

    const byId = Object.fromEntries(queue.items.map((i) => [i.id, i]));
    expect(byId['ATA-SALDO-00059/2025-1'].severity).toBe('CRITICA');
    expect(byId['ATA-SALDO-00059/2025-2'].severity).toBe('URGENTE');
    expect(byId['ATA-SALDO-00059/2025-3'].severity).toBe('ATENCAO');
    expect(byId['ATA-SALDO-00059/2025-4']).toBeUndefined();

    expect(byId['ATA-TASK-vencida'].severity).toBe('CRITICA');
    expect(byId['ATA-TASK-urgente'].severity).toBe('URGENTE');
    expect(byId['ATA-TASK-atencao'].severity).toBe('ATENCAO');
    expect(byId['ATA-TASK-longe']).toBeUndefined();
    expect(byId['ATA-TASK-concluida']).toBeUndefined();
    expect(queue.tarefasSemPrazo).toBe(1);

    // Vigência termina em 10 dias: lembretes de 180d/90d já abertos entram como informativos
    const lembretes = queue.items.filter((i) => i.kind === 'LEMBRETE');
    expect(lembretes.length).toBeGreaterThan(0);
    expect(lembretes.every((l) => l.severity === 'INFO')).toBe(true);

    // Ordenação por gravidade
    const ranks = queue.items.map((i) => ['CRITICA', 'URGENTE', 'ATENCAO', 'INFO'].indexOf(i.severity));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(queue.counts.CRITICA).toBe(2);
  });

  it('avisos resolvidos (lembrete e saldo) saem da fila e vão para "dispensados"', () => {
    const saldos = [{ numero_item: '1', percentual_consumido: 100 }];
    const base = buildAtaActionQueue({ arp, saldos, currentDate: HOJE });
    const lembrete = base.items.find((i) => i.kind === 'LEMBRETE')!;
    const saldo = base.items.find((i) => i.kind === 'SALDO')!;
    expect(lembrete.avisoChave).toMatch(/^LEMBRETE::ARP::/);
    expect(saldo.avisoChave).toMatch(/^SALDO::/);
    const queue = buildAtaActionQueue({ arp, saldos, avisosResolvidos: new Set([lembrete.avisoChave!, saldo.avisoChave!]), currentDate: HOJE });
    expect(queue.items.find((i) => i.id === lembrete.id || i.id === saldo.id)).toBeUndefined();
    expect(queue.dispensados.map((d) => d.id)).toEqual(expect.arrayContaining([lembrete.id, saldo.id]));
  });

  it('saldo resolvido volta quando o nível piora', () => {
    const atencao = buildAtaActionQueue({ arp, saldos: [{ numero_item: '00007', percentual_consumido: 60 }], currentDate: HOJE }).items[0];
    const pior = buildAtaActionQueue({
      arp,
      saldos: [{ numero_item: '7', percentual_consumido: 100 }],
      avisosResolvidos: new Set([atencao.avisoChave!]),
      currentDate: HOJE
    });
    expect(pior.items.filter((i) => i.kind === 'SALDO')).toHaveLength(1);
  });

  it('ata encerrada não gera lembretes de planejamento', () => {
    const queue = buildAtaActionQueue({ arp: { ...arp, dataVigenciaFinal: '2026-01-01' }, currentDate: HOJE });
    expect(queue.items.filter((i) => i.kind === 'LEMBRETE')).toHaveLength(0);
  });
});

describe('buildAtaLifeline — linha da vida da ata', () => {
  it('vai da vigência inicial à final, com os marcos de planejamento', () => {
    const lifeline = buildAtaLifeline(arp, HOJE)!;
    expect(lifeline.start).toBe('2025-10-10');
    expect(lifeline.end).toBe('2026-10-10');
    expect(lifeline.diasParaFim).toBe(10);
    expect(lifeline.milestones.length).toBeGreaterThan(0);
  });

  it('retorna null sem vigência válida', () => {
    expect(buildAtaLifeline({ ...arp, dataVigenciaFinal: '' } as ArpRecord)).toBeNull();
  });
});

import { shortMilestoneLabel } from '../../components/instrument360/HealthStripParts';
import { instrumentSituationLabel } from '../../components/instrument360/Instrument360Hero';
import { vigenciaTile } from '../../components/atas/Ata360Header';

describe('rótulos do cabeçalho 360', () => {
  it('nomeia os marcos de 180 e 90 dias como planejamento, não como o ato em si', () => {
    expect(shortMilestoneLabel('Planejamento de Prorrogação da Ata (180d)')).toBe('Planejamento de prorrogação');
    expect(shortMilestoneLabel('Início da Análise de Prorrogação (180d)')).toBe('Início da análise de prorrogação');
    expect(shortMilestoneLabel('Alerta de Exaustão de Vigência da ARP (90d)')).toBe('Planejar nova licitação');
    expect(shortMilestoneLabel('Remessa aos Órgãos de Controle (60d)')).toBe('Remessa aos órgãos de controle');
    expect(shortMilestoneLabel('Consulta de Interesse ao Fornecedor (120d)')).toBe('Consulta ao fornecedor');
  });

  it('mantém o número de meses no marco de reajuste', () => {
    expect(shortMilestoneLabel('Reajuste (24 meses)')).toBe('Reajuste (24 meses)');
  });

  it('a situação ao lado do título não leva os dias (ficam no indicador de vigência)', () => {
    expect(instrumentSituationLabel('CRITICO')).toBe('Vigente');
    expect(instrumentSituationLabel('ATENCAO')).toBe('Vigente');
    expect(instrumentSituationLabel('REGULAR')).toBe('Vigente');
    expect(instrumentSituationLabel('EXPIRADO')).toBe('Encerrada');
    expect(instrumentSituationLabel('SEM_DATA')).toBe('Vigência não informada');
    expect(instrumentSituationLabel('REGULAR', true)).toBe('Cancelada no PNCP');
  });

  it('o indicador de vigência usa as faixas da Carteira: crítico até 30 dias, atenção até 90', () => {
    expect(vigenciaTile('CRITICO', 8)).toEqual({ tone: 'CRITICA', badge: 'Crítico', value: '8 dias' });
    expect(vigenciaTile('ATENCAO', 45)).toEqual({ tone: 'ATENCAO', badge: 'Atenção', value: '45 dias' });
    expect(vigenciaTile('REGULAR', 278)).toEqual({ value: '278 dias' });
    expect(vigenciaTile('CRITICO', 1).value).toBe('1 dia');
    expect(vigenciaTile('CRITICO', 0).value).toBe('Vence hoje');
    expect(vigenciaTile('EXPIRADO', -3)).toEqual({ tone: 'CRITICA', badge: 'Encerrada', value: 'Encerrada' });
    expect(vigenciaTile('SEM_DATA', null)).toEqual({ value: '—' });
  });
});
