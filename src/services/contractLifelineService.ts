import type { ArpRecord, ContractDashboardRecord } from '../types';
import { buildCentralPrazosItems } from './centralPrazosService';
import { addYears } from './contractReajusteRadarService';
import { differenceInDays, formatDateISO, parseDateBRT } from './temporalEngineService';

export type LifelineMilestoneState = 'PASSADO' | 'PROXIMO' | 'FUTURO';

export interface LifelineMilestone {
  id: string;
  label: string;
  date: string;
  pct: number;
  diasRestantes: number;
  state: LifelineMilestoneState;
}

export interface ContractLifeline {
  start: string;
  end: string;
  todayPct: number;
  diasParaFim: number;
  milestones: LifelineMilestone[];
}

const PROXIMO_DIAS = 60;

export function buildContractLifeline(contract: ContractDashboardRecord, currentDate?: Date): ContractLifeline | null {
  const startStr = contract.dataVigenciaInicio || contract.dataAssinatura;
  const endStr = contract.dataVigenciaFim;
  const start = startStr ? parseDateBRT(startStr) : null;
  const end = endStr ? parseDateBRT(endStr) : null;
  if (!start || !end || end <= start) return null;

  const span = end.getTime() - start.getTime();
  const pctOf = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start.getTime()) / span) * 100));
  const today = currentDate ? new Date(currentDate) : new Date();
  today.setHours(0, 0, 0, 0);

  const milestones: LifelineMilestone[] = [];
  const push = (id: string, label: string, date: Date) => {
    const diasRestantes = differenceInDays(date, currentDate);
    milestones.push({
      id,
      label,
      date: formatDateISO(date),
      pct: pctOf(date),
      diasRestantes,
      state: diasRestantes < 0 ? 'PASSADO' : diasRestantes <= PROXIMO_DIAS ? 'PROXIMO' : 'FUTURO'
    });
  };

  const baseStr = contract.dataAssinatura || contract.dataVigenciaInicio;
  const base = baseStr ? parseDateBRT(baseStr) : null;
  if (base) {
    for (let ano = 1; ano <= 10; ano++) {
      const d = addYears(base, ano);
      if (d >= end) break;
      if (d > start) push(`REAJUSTE-${ano}`, `Reajuste (${ano * 12} meses)`, d);
    }
  }

  for (const item of buildCentralPrazosItems({ contracts: [contract], currentDate })) {
    if (item.tipoItem !== 'GATILHO_OPERACIONAL') continue;
    const d = parseDateBRT(item.dataAlvo);
    if (d && d >= start && d <= end) push(item.id, item.regraNome, d);
  }

  milestones.sort((a, b) => a.date.localeCompare(b.date));

  return {
    start: formatDateISO(start),
    end: formatDateISO(end),
    todayPct: pctOf(today),
    diasParaFim: differenceInDays(end, currentDate),
    milestones
  };
}

/**
 * Linha da vida da Ata: vigência inicial → final, com os marcos de planejamento
 * (prorrogação 180d, exaustão 90d) do mesmo motor dos lembretes da Ata 360.
 */
export function buildAtaLifeline(arp: ArpRecord, currentDate?: Date): ContractLifeline | null {
  const start = parseDateBRT(arp.dataVigenciaInicial || arp.dataAssinatura);
  const end = parseDateBRT(arp.dataVigenciaFinal);
  if (!start || !end || end <= start) return null;

  const span = end.getTime() - start.getTime();
  const pctOf = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start.getTime()) / span) * 100));
  const today = currentDate ? new Date(currentDate) : new Date();
  today.setHours(0, 0, 0, 0);

  const milestones: LifelineMilestone[] = [];
  for (const item of buildCentralPrazosItems({ arps: [arp], currentDate })) {
    if (item.tipoItem !== 'GATILHO_OPERACIONAL') continue;
    const d = parseDateBRT(item.dataAlvo);
    if (!d || d < start || d > end) continue;
    const diasRestantes = differenceInDays(d, currentDate);
    milestones.push({
      id: item.id,
      label: item.regraNome,
      date: formatDateISO(d),
      pct: pctOf(d),
      diasRestantes,
      state: diasRestantes < 0 ? 'PASSADO' : diasRestantes <= PROXIMO_DIAS ? 'PROXIMO' : 'FUTURO'
    });
  }
  milestones.sort((a, b) => a.date.localeCompare(b.date));

  return {
    start: formatDateISO(start),
    end: formatDateISO(end),
    todayPct: pctOf(today),
    diasParaFim: differenceInDays(end, currentDate),
    milestones
  };
}
