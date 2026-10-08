import type { ContractDashboardRecord, ContractTask, ContractTaskPlan, TaskExecutionMode } from '../types';
import type { PaymentFollowUpCycle } from '../types/paymentFollowUp';
import type { DashboardAttentionItem } from '../types/managementDashboard';
import type { SeverityLevel } from '../design-system/tokens';
import { calculateAttentionSummary } from './dashboardService';
import { buildCentralPrazosItems } from './centralPrazosService';
import { parseDateBRT } from './temporalEngineService';
import { isLembreteNaJanela } from '../config/alertRules';
import type { AvisoPagamento } from './avisosPagamentoService';
import { chaveAvisoLembrete } from './avisosResolvidosService';

export type ContractActionKind = 'TAREFA' | 'PAGAMENTO' | 'REAJUSTE' | 'LEMBRETE';

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
  /** Chave para marcar como resolvido (reajuste e lembrete); tarefa se resolve concluindo. */
  avisoChave?: string;
}

export interface ContractActionQueue {
  items: ContractActionItem[];
  counts: Record<SeverityLevel, number>;
  tarefasSemPrazo: number;
  /** Avisos marcados como resolvidos (não entram em items/counts). */
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
  /** Expectativa de pagamento: nota mensal que não chegou, entrega prevista sem nota (avisosPagamentoService). */
  avisosPagamento?: AvisoPagamento[];
  /** Chaves de avisos_resolvidos. */
  avisosResolvidos?: ReadonlySet<string>;
  currentDate?: Date;
}): ContractActionQueue {
  const { contractKey, plan, paymentCycles = [], avisosPagamento = [], avisosResolvidos = new Set<string>(), currentDate } = params;
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

  const { items: funnelItems, resolvidos = [] } = calculateAttentionSummary({
    contracts: [contract],
    plans,
    paymentCycles,
    avisosResolvidos,
    currentDate
  });
  for (const f of [...funnelItems, ...resolvidos]) {
    const kind = KIND_BY_CATEGORY[f.category];
    if (!kind) continue;
    (resolvidos.includes(f) ? dispensados : items).push(
      withTaskDetails({
        id: f.id,
        kind,
        severity: f.severity,
        title: f.title,
        description: f.description,
        badgeLabel: f.badgeLabel,
        diasRelevantes: f.diasRelevantes,
        dataAlvo: f.dataAlvo,
        taskId: f.taskId,
        avisoChave: f.avisoChave
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
        dataAlvo: p.dataAlvo,
        avisoChave: chaveAvisoLembrete(p.id)
      };
      (avisosResolvidos.has(lembrete.avisoChave!) ? dispensados : items).push(lembrete);
    }
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
