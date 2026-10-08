import type { ArpRecord, AtaTaskPlan } from '../types';
import type { SeverityLevel } from '../design-system/tokens';
import { buildCentralPrazosItems } from './centralPrazosService';
import { classifyArpItemSaldo } from './balanceService';
import { differenceInBusinessDays, parseDateBRT } from './temporalEngineService';
import { quantidadeBaseSenasp } from '../utils/quantitativoSenasp';
import { classifyTarefaPrazo, isLembreteNaJanela } from '../config/alertRules';
import { toSentenceCaseIfAllCaps } from '../utils/textCase';
import { chaveAvisoLembrete, chaveAvisoSaldo } from './avisosResolvidosService';

export type AtaActionKind = 'SALDO' | 'TAREFA' | 'LEMBRETE';

export interface AtaActionItem {
  id: string;
  kind: AtaActionKind;
  severity: SeverityLevel;
  title: string;
  description?: string;
  badgeLabel?: string;
  diasRelevantes?: number;
  dataAlvo?: string;
  taskId?: string;
  macrotaskName?: string;
  numeroItem?: string;
  /** Chave para marcar como resolvido (saldo e lembrete); tarefa se resolve concluindo. */
  avisoChave?: string;
}

export interface AtaActionQueue {
  items: AtaActionItem[];
  counts: Record<SeverityLevel, number>;
  tarefasSemPrazo: number;
  /** Avisos marcados como resolvidos (não entram em items/counts). */
  dispensados: AtaActionItem[];
}

export interface AtaItemSaldoInput {
  numero_item?: number | string;
  descricao_item?: string;
  percentual_consumido?: number;
  quantidade_homologada?: number;
  quantidade_senasp?: number | null;
  quantidade_base_senasp?: number | null;
  quantidade_consumida?: number;
}

const SEVERITY_RANK: Record<SeverityLevel, number> = { CRITICA: 1, URGENTE: 2, ATENCAO: 3, INFO: 4 };

function isTaskOpen(status?: string): boolean {
  return status !== 'CONCLUIDA' && status !== 'NAO_APLICAVEL';
}

function lembreteLabel(diasRestantes: number, atrasado: boolean): string {
  if (atrasado) return `Janela iniciada há ${Math.abs(diasRestantes)} dias`;
  if (diasRestantes === 0) return 'Janela inicia hoje';
  return `Janela em ${diasRestantes} dias`;
}

function percentualDoSaldo(s: AtaItemSaldoInput): number {
  if (typeof s.percentual_consumido === 'number') return s.percentual_consumido;
  const homologada = quantidadeBaseSenasp(s);
  return homologada > 0 ? (Number(s.quantidade_consumida || 0) / homologada) * 100 : 0;
}

/**
 * Fila única da Ata 360, no mesmo formato da fila do Contrato 360
 * (contractActionQueueService): saldo de item (>50%), tarefas do plano com prazo
 * e lembretes de planejamento da vigência, em ordem de gravidade.
 *
 * Gravidade das tarefas segue o contrato: vencida = crítica, até 7 dias =
 * urgente, 8 a 30 dias = atenção. Lembretes são informativos.
 */
export function buildAtaActionQueue(params: {
  arp: ArpRecord;
  saldos?: AtaItemSaldoInput[];
  plan?: AtaTaskPlan | null;
  /** Chaves de avisos_resolvidos. */
  avisosResolvidos?: ReadonlySet<string>;
  currentDate?: Date;
}): AtaActionQueue {
  const { arp, saldos = [], plan = null, avisosResolvidos = new Set<string>(), currentDate } = params;
  const items: AtaActionItem[] = [];
  const dispensados: AtaActionItem[] = [];

  // 1. Saldo físico dos itens
  for (const s of saldos) {
    const { percentualConsumido, isCritico, isProximoLimite, severity } = classifyArpItemSaldo(percentualDoSaldo(s));
    if (!isCritico && !isProximoLimite) continue;
    const numeroItem = String(s.numero_item ?? '');
    const saldo: AtaActionItem = {
      id: `ATA-SALDO-${arp.numeroAtaRegistroPreco}-${numeroItem}`,
      kind: 'SALDO',
      severity,
      title: `Item ${numeroItem}${s.descricao_item ? ` · ${toSentenceCaseIfAllCaps(s.descricao_item)}` : ''}`,
      description: isCritico ? 'Saldo físico crítico: avaliar nova licitação ou remanejamento' : 'Saldo físico próximo do limite',
      badgeLabel: `${percentualConsumido.toFixed(1)}% consumido`,
      numeroItem,
      avisoChave: chaveAvisoSaldo(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, numeroItem, severity)
    };
    (avisosResolvidos.has(saldo.avisoChave!) ? dispensados : items).push(saldo);
  }

  // 2. Tarefas do plano de gestão
  let tarefasSemPrazo = 0;
  for (const macro of plan?.macrotarefas || []) {
    for (const task of macro.tarefas) {
      if (!isTaskOpen(task.status)) continue;
      const prazo = task.prazo ? parseDateBRT(task.prazo) : null;
      if (!prazo) {
        tarefasSemPrazo++;
        continue;
      }
      const dias = differenceInBusinessDays(prazo, currentDate);
      const nivelPrazo = classifyTarefaPrazo(dias);
      const severity: SeverityLevel | null = nivelPrazo === 'VENCIDA' ? 'CRITICA' : nivelPrazo === 'URGENTE' ? 'URGENTE' : nivelPrazo === 'PROXIMA' ? 'ATENCAO' : null;
      if (!severity) continue;
      items.push({
        id: `ATA-TASK-${task.id}`,
        kind: 'TAREFA',
        severity,
        title: task.nome,
        badgeLabel: dias < 0 ? `Vencida há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia útil' : 'dias úteis'}` : dias === 0 ? 'Vence hoje' : `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}`,
        diasRelevantes: dias,
        dataAlvo: task.prazo,
        taskId: task.id,
        macrotaskName: macro.nome
      });
    }
  }

  // 3. Lembretes de planejamento (prorrogação 180d / exaustão 90d)
  const fim = parseDateBRT(arp.dataVigenciaFinal);
  const vigenciaEncerrada = Boolean(fim && fim.getTime() < new Date(currentDate ?? new Date()).setHours(0, 0, 0, 0));
  if (!vigenciaEncerrada) {
    for (const p of buildCentralPrazosItems({ arps: [arp], currentDate })) {
      if (p.tipoItem !== 'GATILHO_OPERACIONAL') continue;
      const atrasado = p.estadoTemporal === 'ATRASADO';
      if (!isLembreteNaJanela({ diasRestantes: p.diasRestantes, atrasado, isAta: true })) continue;
      const lembrete: AtaActionItem = {
        id: p.id,
        kind: 'LEMBRETE',
        severity: 'INFO',
        title: p.regraNome,
        description: p.acaoDescricao,
        badgeLabel: lembreteLabel(p.diasRestantes, atrasado),
        diasRelevantes: p.diasRestantes,
        dataAlvo: p.dataAlvo,
        avisoChave: chaveAvisoLembrete(p.id)
      };
      (avisosResolvidos.has(lembrete.avisoChave!) ? dispensados : items).push(lembrete);
    }
  }

  items.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    const days = (a.diasRelevantes ?? 9999) - (b.diasRelevantes ?? 9999);
    if (days !== 0) return days;
    return a.id.localeCompare(b.id);
  });

  const counts: Record<SeverityLevel, number> = { CRITICA: 0, URGENTE: 0, ATENCAO: 0, INFO: 0 };
  for (const item of items) counts[item.severity]++;

  return { items, counts, tarefasSemPrazo, dispensados };
}
