import type { ArpRecord, ContractDashboardRecord } from '../types';
import type { ContractEvent } from '../types/contractEvents';
import { buildCentralPrazosItems } from './centralPrazosService';
import { addYears } from './contractReajusteRadarService';
import { differenceInDays, formatDateISO, parseDateBRT } from './temporalEngineService';
import { VIGENCIA_RULES } from '../config/alertRules';

export type LifelineMilestoneState = 'PASSADO' | 'PROXIMO' | 'FUTURO';

export interface LifelineMilestone {
  id: string;
  label: string;
  date: string;
  pct: number;
  diasRestantes: number;
  state: LifelineMilestoneState;
}

/** Termo registrado no histórico do contrato (aditivo, apostilamento etc.), na data de assinatura. */
export interface LifelineEvent {
  id: string;
  /** Ex.: "Termo Aditivo 00001/2026" */
  label: string;
  date: string;
  pct: number;
}

/** Termos próximos demais para serem desenhados separados viram uma marca só. */
export interface LifelineEventCluster {
  pct: number;
  date: string;
  count: number;
  /** Uma linha por termo, com a data, para a dica da marca. */
  labels: string[];
}

export interface ContractLifeline {
  start: string;
  end: string;
  todayPct: number;
  diasParaFim: number;
  milestones: LifelineMilestone[];
  events?: LifelineEvent[];
}

/** Distância mínima, em % da vigência, para dois termos serem desenhados separados. */
export const EVENT_CLUSTER_PCT = 1.5;

/**
 * Termos do histórico dentro da vigência, na data de assinatura (ou, na falta dela, publicação ou efeito).
 * A celebração inicial fica de fora: é o início da própria linha.
 */
export function buildLifelineEvents(events: ContractEvent[] | undefined, start: Date, end: Date): LifelineEvent[] {
  if (!events || events.length === 0) return [];
  const span = end.getTime() - start.getTime();
  if (span <= 0) return [];

  const result: LifelineEvent[] = [];
  for (const event of events) {
    if (event.tipoEvento === 'CELEBRACAO') continue;
    const dateStr = event.dataAssinatura || event.dataPublicacao || event.dataVigenciaEfeito;
    const date = dateStr ? parseDateBRT(dateStr) : null;
    if (!date || date < start || date > end) continue;
    result.push({
      id: event.id,
      label: event.identificadorOficial,
      date: formatDateISO(date),
      pct: ((date.getTime() - start.getTime()) / span) * 100
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function clusterLifelineEvents(events: LifelineEvent[], thresholdPct = EVENT_CLUSTER_PCT): LifelineEventCluster[] {
  const clusters: LifelineEventCluster[] = [];
  let current: LifelineEvent[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0];
    clusters.push({
      pct: current.reduce((acc, e) => acc + e.pct, 0) / current.length,
      date: first.date,
      count: current.length,
      labels: current.map((e) => `${e.label} · ${e.date.split('-').reverse().join('/')}`)
    });
    current = [];
  };

  for (const event of events) {
    if (current.length > 0 && event.pct - current[current.length - 1].pct > thresholdPct) flush();
    current.push(event);
  }
  flush();
  return clusters;
}


export function buildContractLifeline(
  contract: ContractDashboardRecord,
  currentDate?: Date,
  events?: ContractEvent[]
): ContractLifeline | null {
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
      state: diasRestantes < 0 ? 'PASSADO' : diasRestantes <= VIGENCIA_RULES.aVencerAteDias ? 'PROXIMO' : 'FUTURO'
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

  const termos = buildLifelineEvents(events, start, end);

  return {
    start: formatDateISO(start),
    end: formatDateISO(end),
    todayPct: pctOf(today),
    diasParaFim: differenceInDays(end, currentDate),
    milestones,
    ...(termos.length > 0 ? { events: termos } : {})
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
      state: diasRestantes < 0 ? 'PASSADO' : diasRestantes <= VIGENCIA_RULES.aVencerAteDias ? 'PROXIMO' : 'FUTURO'
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
