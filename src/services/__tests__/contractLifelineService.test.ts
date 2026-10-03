import { describe, it, expect } from 'vitest';
import type { ContractDashboardRecord } from '../../types';
import type { ContractEvent } from '../../types/contractEvents';
import { buildContractLifeline, buildLifelineEvents, clusterLifelineEvents } from '../contractLifelineService';
import { parseDateBRT } from '../temporalEngineService';
import { addDays, formatDateISO } from '../temporalEngineService';

const inDays = (n: number) => formatDateISO(addDays(new Date(), n));

const contract = {
  id: '200331-00010-2026',
  numero: '00010',
  ano: 2026,
  uasg: '200331',
  dataAssinatura: inDays(-400),
  dataVigenciaInicio: inDays(-400),
  dataVigenciaFim: inDays(109),
  statusVigencia: 'Vigente',
  fonteDados: 'PNCP'
} as ContractDashboardRecord;

describe('buildContractLifeline', () => {
  const lifeline = buildContractLifeline(contract)!;

  it('posiciona hoje entre o início e o fim e calcula os dias restantes', () => {
    expect(lifeline.diasParaFim).toBe(109);
    expect(lifeline.todayPct).toBeGreaterThan(70);
    expect(lifeline.todayPct).toBeLessThan(85);
  });

  it('marca o reajuste de 12 meses como já passado', () => {
    const reajuste = lifeline.milestones.find((m) => m.id === 'REAJUSTE-1');
    expect(reajuste).toMatchObject({ label: 'Reajuste (12 meses)', state: 'PASSADO' });
  });

  it('inclui os marcos legais de prorrogação em ordem de data', () => {
    const labels = lifeline.milestones.map((m) => m.label);
    expect(labels.some((l) => l.startsWith('Início da Análise de Prorrogação'))).toBe(true);
    const dates = lifeline.milestones.map((m) => m.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('marca como PROXIMO um marco que cai nos próximos 60 dias', () => {
    const remessa = lifeline.milestones.find((m) => m.diasRestantes >= 0 && m.diasRestantes <= 60);
    expect(remessa?.state).toBe('PROXIMO');
  });

  it('retorna null quando a vigência não está informada', () => {
    expect(buildContractLifeline({ ...contract, dataVigenciaFim: undefined })).toBeNull();
  });
});


describe('termos do histórico na linha da vida', () => {
  const termo = (id: string, tipoEvento: ContractEvent['tipoEvento'], dataAssinatura: string | undefined, label = `Termo ${id}`) =>
    ({ id, tipoEvento, identificadorOficial: label, dataAssinatura } as ContractEvent);

  it('desenha só os termos dentro da vigência e deixa a celebração de fora', () => {
    const eventos = [
      termo('cel', 'CELEBRACAO', inDays(-400)),
      termo('ta1', 'APOSTILAMENTO', inDays(-200)),
      termo('fora', 'PRORROGACAO', inDays(-900)),
      termo('sem-data', 'APOSTILAMENTO', undefined)
    ];
    const lifeline = buildContractLifeline(contract, undefined, eventos)!;
    expect(lifeline.events?.map((e) => e.id)).toEqual(['ta1']);
    expect(lifeline.events![0].pct).toBeGreaterThan(0);
    expect(lifeline.events![0].pct).toBeLessThan(lifeline.todayPct);
  });

  it('sem termos, a linha da vida não ganha a chave events', () => {
    expect(buildContractLifeline(contract)).not.toHaveProperty('events');
    expect(buildContractLifeline(contract, undefined, [termo('cel', 'CELEBRACAO', inDays(-400))])).not.toHaveProperty('events');
  });

  it('usa a publicação quando falta a assinatura', () => {
    const start = parseDateBRT('2025-01-01')!;
    const end = parseDateBRT('2026-01-01')!;
    const ev = { id: 'x', tipoEvento: 'APOSTILAMENTO', identificadorOficial: 'X', dataPublicacao: '2025-07-02' } as ContractEvent;
    expect(buildLifelineEvents([ev], start, end)[0].date).toBe('2025-07-02');
  });

  it('termos muito próximos viram uma marca com contagem', () => {
    const grupo = clusterLifelineEvents([
      { id: 'a', label: 'Termo A', date: '2025-08-22', pct: 20.0 },
      { id: 'b', label: 'Termo B', date: '2025-08-30', pct: 20.4 },
      { id: 'c', label: 'Termo C', date: '2026-04-28', pct: 33.6 }
    ]);
    expect(grupo).toHaveLength(2);
    expect(grupo[0]).toMatchObject({ count: 2 });
    expect(grupo[0].labels).toEqual(['Termo A · 22/08/2025', 'Termo B · 30/08/2025']);
    expect(grupo[1]).toMatchObject({ count: 1, pct: 33.6 });
  });
});
