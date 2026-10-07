import type { ContractDashboardRecord, ContractTask, ContractTaskPlan, TaskExecutionMode } from '../types';
import type { PaymentFollowUpCycle } from '../types/paymentFollowUp';
import type { DashboardAttentionItem } from '../types/managementDashboard';
import type { SeverityLevel } from '../design-system/tokens';
import { calculateAttentionSummary } from './dashboardService';
import { buildCentralPrazosItems } from './centralPrazosService';
import { parseDateBRT } from './temporalEngineService';
import { isLembreteNaJanela } from '../config/alertRules';
import type { AvisoPagamento } from './avisosPagamentoService';

export type ContractActionKind = 'TAREFA' | 'PAGAMENTO' | 'REAJUSTE' | 'LEMBRETE' | 'EMPENHO';

/** Empenho do contrato cuja quantidade ainda espera confirmação em um item da ata. */
export interface PendingEmpenhoQuantity {
  empenhoId: string;
  numeroEmpenho: string;
  itemKey: string;
  /** Texto do item para a lista (ex.: "Ata 00059/2025 · Item 1"). */
  itemLabel: string;
  /** Tela do item, onde a quantidade é confirmada. */
  href: string;
}

export interface ContractActionItem {
  id: string;
  kind: ContractActionKind;
  severity: SeverityLevel;
  title: string;
  description?: string;
  badgeLabel?: string;
  diasRelevantes?: number;
  dataAlvo?: string;
  taskId?: string;
  macrotaskName?: string;
  executionMode?: TaskExecutionMode;
  sistemaDestino?: string;
  /** Destino da ação quando ela leva a outra tela (empenho pendente → item da ata). */
  href?: string;
}

export interface ContractActionQueue {
  items: ContractActionItem[];
  counts: Record<SeverityLevel, number>;
  tarefasSemPrazo: number;
  /** Lembretes que o gestor marcou como resolvidos (não entram em items/counts). */
  dispensados: ContractActionItem[];
}

const SEVERITY_RANK: Record<SeverityLevel, number> = { CRITICA: 1, URGENTE: 2, ATENCAO: 3, INFO: 4 };

const KIND_BY_CATEGORY: Partial<Record<DashboardAttentionItem['category'], ContractActionKind>> = {
  TAREFA_ATRASADA: 'TAREFA',
  TAREFA_PROXIMA: 'TAREFA',
  PAGAMENTO_CRITICO: 'PAGAMENTO',
  REAJUSTE_RADAR: 'REAJUSTE'
};

function isTaskOpen(status?: string): boolean {
  return status !== 'CONCLUIDA' && status !== 'NAO_APLICAVEL';
}

function lembreteLabel(diasRestantes: number, atrasado: boolean): string {
  if (atrasado) return `Janela iniciada há ${Math.abs(diasRestantes)} dias`;
  if (diasRestantes === 0) return 'Janela inicia hoje';
  return `Janela em ${diasRestantes} dias`;
}

/**
 * Fila única do Contrato 360. Os itens CRÍTICA/URGENTE vêm do mesmo motor da
 * Visão Geral (calculateAttentionSummary) para que as contagens coincidam; os
 * extras locais (tarefas em 8–30 dias e lembretes de planejamento) entram só
 * como ATENCAO/INFO.
 */
export function buildContractActionQueue(params: {
  contract: ContractDashboardRecord;
  contractKey: string;
  plan: ContractTaskPlan | null;
  paymentCycles?: PaymentFollowUpCycle[];
  pendingEmpenhos?: PendingEmpenhoQuantity[];
  /** Expectativa de pagamento: nota mensal que não chegou, entrega prevista sem nota (avisosPagamentoService). */
  avisosPagamento?: AvisoPagamento[];
  dismissedReminderIds?: string[];
  currentDate?: Date;
}): ContractActionQueue {
  const { contractKey, plan, paymentCycles = [], pendingEmpenhos = [], avisosPagamento = [], dismissedReminderIds = [], currentDate } = params;
  const dismissed = new Set(dismissedReminderIds);
  const dispensados: ContractActionItem[] = [];
  // Vigência encerrada: os lembretes de prorrogação (D-180/D-60) perdem o sentido.
  const fimVigencia = parseDateBRT(params.contract.dataVigenciaFim);
  const vigenciaEncerrada = Boolean(fimVigencia && fimVigencia.getTime() < (currentDate ?? new Date()).setHours(0, 0, 0, 0));
  const contract = params.contract.id ? params.contract : { ...params.contract, id: contractKey };
  const plans = plan ? { [contract.id]: plan } : {};

  const taskIndex = new Map<string, { task: ContractTask; macrotaskName: string }>();
  let tarefasSemPrazo = 0;
  for (const macro of plan?.macrotarefas || []) {
    for (const task of macro.tarefas) {
      taskIndex.set(task.id, { task, macrotaskName: macro.nome });
      if (isTaskOpen(task.status) && (!task.prazo || !parseDateBRT(task.prazo))) tarefasSemPrazo++;
    }
  }

  const withTaskDetails = (item: ContractActionItem): ContractActionItem => {
    const entry = item.taskId ? taskIndex.get(item.taskId) : undefined;
    if (!entry) return item;
    return {
      ...item,
      macrotaskName: entry.macrotaskName,
      executionMode: entry.task.executionMode,
      sistemaDestino: entry.task.sistemaDestino
    };
  };

  const items: ContractActionItem[] = [];

  const { items: funnelItems } = calculateAttentionSummary({
    contracts: [contract],
    plans,
    paymentCycles,
    currentDate
  });
  for (const f of funnelItems) {
    const kind = KIND_BY_CATEGORY[f.category];
    if (!kind) continue;
    items.push(
      withTaskDetails({
        id: f.id,
        kind,
        severity: f.severity,
        title: f.title,
        description: f.description,
        badgeLabel: f.badgeLabel,
        diasRelevantes: f.diasRelevantes,
        dataAlvo: f.dataAlvo,
        taskId: f.taskId
      })
    );
  }

  const prazos = buildCentralPrazosItems({ contracts: [contract], plans, currentDate });
  for (const p of prazos) {
    // Tarefas de 8 a 30 dias já vêm do funil (calculateAttentionSummary) como ATENÇÃO.
    if (p.tipoItem === 'GATILHO_OPERACIONAL') {
      const atrasado = p.estadoTemporal === 'ATRASADO';
      if (vigenciaEncerrada) continue;
      if (!isLembreteNaJanela({ diasRestantes: p.diasRestantes, atrasado, isAta: false })) continue;
      const lembrete: ContractActionItem = {
        id: `ACT-LEMBRETE-${p.id}`,
        kind: 'LEMBRETE',
        severity: 'INFO',
        title: p.regraNome,
        description: p.acaoDescricao,
        badgeLabel: lembreteLabel(p.diasRestantes, atrasado),
        diasRelevantes: p.diasRestantes,
        dataAlvo: p.dataAlvo
      };
      (dismissed.has(lembrete.id) ? dispensados : items).push(lembrete);
    }
  }

  // Quantidade de empenho pendente: a execução do contrato depende de o gestor confirmar no item da ata.
  for (const e of pendingEmpenhos) {
    items.push({
      id: `ACT-EMPENHO-${e.empenhoId}-${e.itemKey}`,
      kind: 'EMPENHO',
      severity: 'ATENCAO',
      title: `Confirmar a quantidade do empenho ${e.numeroEmpenho}`,
      description: e.itemLabel,
      badgeLabel: 'Pendente',
      href: e.href
    });
  }

  for (const a of avisosPagamento) {
    items.push({
      id: a.id,
      kind: 'PAGAMENTO',
      severity: a.severity,
      title: a.title,
      description: a.description,
      badgeLabel: a.badgeLabel,
      diasRelevantes: a.diasRelevantes,
      dataAlvo: a.dataAlvo
    });
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

  return { items, counts, tarefasSemPrazo, dispensados: dispensados };
}
