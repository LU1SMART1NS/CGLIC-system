import { describe, it, expect } from 'vitest';
import type { ContractDashboardRecord } from '../../types';
import { buildContractLifeline } from '../contractLifelineService';
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
