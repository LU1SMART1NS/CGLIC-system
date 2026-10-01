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

  it('lembretes dispensados saem da fila e vão para "dispensados"', () => {
    const base = buildAtaActionQueue({ arp, currentDate: HOJE });
    const primeiro = base.items.find((i) => i.kind === 'LEMBRETE')!;
    const queue = buildAtaActionQueue({ arp, dismissedReminderIds: [primeiro.id], currentDate: HOJE });
    expect(queue.items.find((i) => i.id === primeiro.id)).toBeUndefined();
    expect(queue.dispensados.map((d) => d.id)).toContain(primeiro.id);
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
import { instrumentStatusLabel } from '../../components/instrument360/Instrument360Hero';

describe('rótulos do cabeçalho 360', () => {
  it('encurta nomes de marcos para caber sob a linha da vida', () => {
    expect(shortMilestoneLabel('Planejamento de Prorrogação da Ata (180d)')).toBe('Prorrogação');
    expect(shortMilestoneLabel('Alerta de Exaustão de Vigência da ARP (90d)')).toBe('Nova licitação');
    expect(shortMilestoneLabel('Reajuste (24 meses)')).toBe('Reajuste 24m');
    expect(shortMilestoneLabel('Remessa aos Órgãos de Controle (60d)')).toBe('Órgãos de controle');
  });

  it('usa as faixas da Carteira na situação', () => {
    expect(instrumentStatusLabel('CRITICO', 10)).toBe('Crítico · vence em 10 dias');
    expect(instrumentStatusLabel('ATENCAO', 45)).toBe('Atenção · vence em 45 dias');
    expect(instrumentStatusLabel('EXPIRADO', -3)).toBe('Encerrada há 3 dias');
    expect(instrumentStatusLabel('REGULAR', 200, true)).toBe('Cancelada no PNCP');
  });
});
