import type { ArpRecord, AtaTaskPlan } from '../types';
import type { SeverityLevel } from '../design-system/tokens';
import { buildCentralPrazosItems } from './centralPrazosService';
import { classifyArpItemSaldo } from './balanceService';
import { differenceInBusinessDays, parseDateBRT } from './temporalEngineService';
import { quantidadeBaseSenasp } from '../utils/quantitativoSenasp';
import { classifyTarefaPrazo, isLembreteNaJanela } from '../config/alertRules';
import { toSentenceCaseIfAllCaps } from '../utils/textCase';
import { chaveAvisoLembrete, chaveAvisoSaldo } from './avisosResolvidosService';
import type { RegistroFornecedorPncp } from './fornecedorAtaPncpService';

/** CADASTRO: a ata veio do PNCP sem fornecedor e precisa da indicação do coordenador (atas_fornecedor_pncp). */
export type AtaActionKind = 'SALDO' | 'TAREFA' | 'LEMBRETE' | 'CADASTRO';

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
  /** Pendência de fornecedor (kind CADASTRO): estado do registro em atas_fornecedor_pncp. */
  fornecedorEstado?: RegistroFornecedorPncp['estado'];
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

/** Texto da compra como as telas mostram ("90039/2025"). */
function compraDoRegistro(r: RegistroFornecedorPncp, arp: ArpRecord): string {
  const numero = r.numeroCompra || arp.numeroCompra;
  const ano = r.anoCompra || arp.anoCompra;
  return numero && ano ? `${numero}/${ano}` : numero || 'não informada';
}

/**
 * Aviso de cadastro da ata publicada no PNCP sem fornecedor. PENDENTE: o coordenador precisa indicar (atenção).
 * INDICADO sem itens no banco: aguardando a sincronização (informativo); com itens, nada a fazer. DIVERGENTE: o
 * Compras.gov.br publicou outro fornecedor (urgente). CONFERIDO: nada.
 */
export function pendenciaDeFornecedor(arp: ArpRecord, registro: RegistroFornecedorPncp | null | undefined, itensNoBanco: number): AtaActionItem | null {
  if (!registro) return null;
  const compra = compraDoRegistro(registro, arp);
  const id = `ATA-FORNECEDOR-${registro.numeroControlePncp}`;
  if (registro.estado === 'PENDENTE') {
    const atas = registro.atasNaCompra ?? 0;
    return {
      id,
      kind: 'CADASTRO',
      severity: 'ATENCAO',
      title: 'Fornecedor não informado pelo PNCP',
      description: atas > 1
        ? `a compra ${compra} gerou ${atas} atas e o PNCP não diz qual fornecedor é desta`
        : `a compra ${compra} tem mais de um fornecedor e o PNCP não diz qual é o desta ata`,
      badgeLabel: 'sem itens',
      fornecedorEstado: 'PENDENTE'
    };
  }
  if (registro.estado === 'DIVERGENTE') {
    return {
      id,
      kind: 'CADASTRO',
      severity: 'URGENTE',
      title: 'Fornecedor indicado diverge do Compras.gov.br',
      description: `indicado ${registro.fornecedorNome || registro.fornecedorIdentificador}; a fonte publicou ${registro.fonteFornecedorNome || registro.fonteFornecedorIdentificador}`,
      badgeLabel: 'conferir itens',
      fornecedorEstado: 'DIVERGENTE'
    };
  }
  if (registro.estado === 'INDICADO' && itensNoBanco === 0) {
    return {
      id,
      kind: 'CADASTRO',
      severity: 'INFO',
      title: `Fornecedor indicado: ${registro.fornecedorNome || registro.fornecedorIdentificador}`,
      description: 'os itens entram na próxima sincronização de atas',
      badgeLabel: 'aguardando sincronização',
      fornecedorEstado: 'INDICADO'
    };
  }
  return null;
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
  /** Registro da ata em atas_fornecedor_pncp (ata publicada no PNCP sem fornecedor). */
  fornecedorPncp?: RegistroFornecedorPncp | null;
  /** Itens da ata já gravados no banco (com itens, a indicação já surtiu efeito). */
  itensNoBanco?: number;
  currentDate?: Date;
}): AtaActionQueue {
  const { arp, saldos = [], plan = null, avisosResolvidos = new Set<string>(), fornecedorPncp = null, itensNoBanco = 0, currentDate } = params;
  const items: AtaActionItem[] = [];
  const dispensados: AtaActionItem[] = [];

  // 0. Fornecedor da ata não informado pelo PNCP: sem "Resolvido" (dispensar deixaria a ata sem itens);
  // some ao indicar o fornecedor ou quando o Compras.gov.br publicar a ata.
  const cadastro = pendenciaDeFornecedor(arp, fornecedorPncp, itensNoBanco);
  if (cadastro) items.push(cadastro);

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
