/**
 * Serviço de Orquestração e Agregação do Dashboard Gerencial (SaldoARP 3.0 — Fase 8-B)
 *
 * Princípios Fundamentais:
 * 1. O Dashboard é uma camada de leitura e agregação determinística — nunca uma nova fonte de dados.
 * 2. Reutilização estrita dos SSOTs oficiais:
 *    - Contratos e Eventos: contractValueEvolutionService, contractEventService;
 *    - Radar de Reajuste: contractReajusteRadarService;
 *    - Prazos e Alertas: centralPrazosService, temporalEngineService;
 *    - Execução Financeira: financialExecutionService, v_empenhos_resumo;
 *    - Saldo Físico de ARP: v_arp_item_saldo_detalhado;
 *    - Acompanhamento de Pagamentos: paymentFollowUpService.
 * 3. Funções puras para cálculos em memória e orquestração assíncrona paralela (Promise.all).
 */

import type {
  ContractDashboardRecord,
  ArpRecord,
  ContractManager,
  ContractTaskPlan,
  ContractEvent,
  SyncMetadata
} from '../types';
import type {
  ManagementDashboardReadModel,
  ManagementDashboardExecutiveKPIs,
  ManagementDashboardDeadlinesSummary,
  ManagementDashboardAttentionSummary,
  ManagementDashboardFinancialSummary,
  ManagementDashboardArpSummary,
  ManagementDashboardArpItemSummary,
  ManagementDashboardPaymentsSummary,
  ManagementDashboardFilters,
  ManagementDashboardFilterOption
} from '../types/managementDashboard';
import type { PaymentFollowUpCycle } from '../types/paymentFollowUp';

import { buildContractValueEvolutionModel } from './contractValueEvolutionService';
import { evaluateContractReajusteRadar } from './contractReajusteRadarService';
import { calculateFinancialBalances } from './financialExecutionService';
import { buildCentralPrazosItems, calculateCentralPrazosKPIs } from './centralPrazosService';
import { parseDateBRT, differenceInDays } from './temporalEngineService';
import { buildContractEventsFromOfficialData } from './contractEventService';
import { fetchContractsForDashboard } from './contractService';
import { fetchArpsFromDb } from './dbCacheService';
import { fetchAllContractManagers, fetchAllContractTaskPlans } from './contractManagementService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Auxiliar para cálculo de dias restantes de vigência
 */
export function getContractDaysRemaining(dataFim?: string, currentDate?: Date): number | null {
  if (!dataFim) return null;
  const target = parseDateBRT(dataFim);
  if (!target) return null;
  return differenceInDays(target, currentDate);
}

/**
 * 1. Cálculo puro dos KPIs Executivos do Dashboard (Contratos & Valor)
 */
export function calculateExecutiveKPIs(
  contracts: ContractDashboardRecord[] = [],
  eventsMap?: Record<string, ContractEvent[]>
): ManagementDashboardExecutiveKPIs {
  const totalContratos = contracts.length;
  let contratosAtivos = 0;
  let contratosEncerrados = 0;
  let contratosEmProrrogacao = 0;

  let valorOriginalTotal = 0;
  let valorVigenteTotal = 0;
  let deltaAcumuladoTotal = 0;

  for (const contract of contracts) {
    const statusVig = (contract.statusVigencia || '').toUpperCase();
    const isAtivo = statusVig === 'VIGENTE' || statusVig.includes('VENCER') || statusVig.includes('60D');
    const isEncerrado = statusVig === 'EXPIRADO' || statusVig === 'NÃO INFORMADO' || statusVig.includes('ENCERRAD') || statusVig.includes('RESCINDID');

    if (isAtivo) {
      contratosAtivos++;
    }
    if (isEncerrado) {
      contratosEncerrados++;
    }

    // Extrai eventos formais oficiais já processados ou do raw da API
    const events = eventsMap?.[contract.id] ||
      buildContractEventsFromOfficialData(
        contract,
        Array.isArray(contract.raw?.termos_aditivos) ? contract.raw.termos_aditivos : (Array.isArray(contract.raw?.aditivos) ? contract.raw.aditivos : [])
      );

    const hasActiveProrrogation = events.some(e => e.tipoEvento === 'PRORROGACAO');
    if (hasActiveProrrogation && isAtivo) {
      contratosEmProrrogacao++;
    }

    // Read model canônico de evolução de valor
    const evolution = buildContractValueEvolutionModel(contract, events);
    valorOriginalTotal += evolution.valorOriginal;
    valorVigenteTotal += evolution.valorVigente;
    deltaAcumuladoTotal += evolution.deltaAcumulado;
  }

  valorOriginalTotal = Number(valorOriginalTotal.toFixed(2));
  valorVigenteTotal = Number(valorVigenteTotal.toFixed(2));
  deltaAcumuladoTotal = Number(deltaAcumuladoTotal.toFixed(2));

  const percentualVariacaoAcumulada = valorOriginalTotal > 0
    ? Number(((deltaAcumuladoTotal / valorOriginalTotal) * 100).toFixed(2))
    : 0;

  return {
    totalContratos,
    contratosAtivos,
    contratosEncerrados,
    contratosEmProrrogacao,
    valorOriginalTotal,
    valorVigenteTotal,
    deltaAcumuladoTotal,
    percentualVariacaoAcumulada
  };
}

/**
 * 2. Cálculo puro do Resumo de Prazos e Vigência Contratual
 */
export function calculateDeadlinesSummary(
  contracts: ContractDashboardRecord[] = [],
  currentDate?: Date
): ManagementDashboardDeadlinesSummary {
  let vencendo30Dias = 0;
  let vencendo60Dias = 0;
  let vencendo90Dias = 0;
  let contratosVencidos = 0;
  let prorrogaçõesEmCurso = 0;

  const itensVencendo: ManagementDashboardDeadlinesSummary['itensVencendo'] = [];

  for (const contract of contracts) {
    const contractKey = contract.id || `${contract.uasg || ''}-${contract.numero || ''}-${contract.ano || ''}`;
    const dias = getContractDaysRemaining(contract.dataVigenciaFim, currentDate);

    if (dias === null) continue;

    let faixa: '30D' | '60D' | '90D' | 'VENCIDO' | null = null;

    if (dias < 0) {
      contratosVencidos++;
      faixa = 'VENCIDO';
    } else if (dias <= 30) {
      vencendo30Dias++;
      faixa = '30D';
    } else if (dias <= 60) {
      vencendo60Dias++;
      faixa = '60D';
    } else if (dias <= 90) {
      vencendo90Dias++;
      faixa = '90D';
    }

    if (faixa) {
      const anoNum = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano || '0'), 10) || undefined);
      itensVencendo.push({
        contractKey,
        numeroContrato: contract.numeroFormatado || `${contract.numero}/${contract.ano}`,
        anoContrato: anoNum,
        fornecedorNome: contract.fornecedorNome,
        dataVigenciaFim: contract.dataVigenciaFim || '',
        diasRestantes: dias,
        faixa
      });
    }

    // Indicador aproximado de prorrogação em curso
    if (dias >= 0 && dias <= 180) {
      prorrogaçõesEmCurso++;
    }
  }

  itensVencendo.sort((a, b) => a.diasRestantes - b.diasRestantes);

  return {
    vencendo30Dias,
    vencendo60Dias,
    vencendo90Dias,
    contratosVencidos,
    prorrogaçõesEmCurso,
    itensVencendo
  };
}

/**
 * 3. Cálculo puro do Bloco "Atenção Agora"
 */
export function calculateAttentionSummary(params: {
  contracts?: ContractDashboardRecord[];
  arps?: ArpRecord[];
  managers?: Record<string, ContractManager>;
  plans?: Record<string, ContractTaskPlan>;
  eventsMap?: Record<string, ContractEvent[]>;
  paymentCycles?: PaymentFollowUpCycle[];
  arpItems?: Array<{ percentual_consumido?: number }>;
  currentDate?: Date;
}): ManagementDashboardAttentionSummary {
  const {
    contracts = [],
    arps = [],
    managers = {},
    plans = {},
    eventsMap = {},
    paymentCycles = [],
    arpItems = [],
    currentDate
  } = params;

  // A) Radar de Reajustes / Repactuações
  const radarsReajuste: ReturnType<typeof evaluateContractReajusteRadar>[] = [];
  let radarsUrgentesCount = 0;

  for (const contract of contracts) {
    const events = eventsMap[contract.id] ||
      buildContractEventsFromOfficialData(
        contract,
        Array.isArray(contract.raw?.termos_aditivos) ? contract.raw.termos_aditivos : (Array.isArray(contract.raw?.aditivos) ? contract.raw.aditivos : [])
      );

    const alert = evaluateContractReajusteRadar({
      contract,
      events,
      currentDate
    });

    if (alert) {
      radarsReajuste.push(alert);
      if (alert.nivel === 'URGENTE' || alert.nivel === 'HOJE' || alert.nivel === 'VENCIDA') {
        radarsUrgentesCount++;
      }
    }
  }

  // B) Central de Prazos KPIs
  const prazosItems = buildCentralPrazosItems({
    contracts,
    arps,
    managers,
    plans,
    currentDate
  });
  const prazosKpis = calculateCentralPrazosKPIs(prazosItems);

  // C) Pagamentos Críticos
  const pagamentosCriticos = paymentCycles.filter(
    (c) => c.prazos?.statusPrazo === 'CRITICO' || c.prazos?.statusPrazo === 'VENCIDO' || (c.prazos?.diasSemRespostaCgofi ?? 0) > 5
  );
  const pagamentosCriticosCount = pagamentosCriticos.length;

  // D) Atas Críticas (consumo >= 85%)
  const atasCriticas = (arpItems || []).filter(
    (i: any) => (Number(i.percentual_consumido) || 0) >= 85
  );
  const atasCriticasCount = atasCriticas.length;

  const tarefasVencidasCount = prazosKpis.atrasadas || 0;
  const overdueTasksCount = tarefasVencidasCount;
  const upcomingTasksCount = (prazosKpis.venceHoje || 0) + (prazosKpis.proximos7Dias || 0);
  const reajusteAlertsCount = radarsReajuste.length;
  const paymentAlertsCount = pagamentosCriticosCount;

  // E) Construção determinística da lista de sinais de atenção
  const items: import('../types/managementDashboard').DashboardAttentionItem[] = [];

  // 1. Tarefas Atrasadas e Próximas da Central de Prazos
  for (const pItem of prazosItems) {
    if (pItem.estadoTemporal === 'ATRASADO') {
      items.push({
        id: `ATT-TASK-OVERDUE-${pItem.id}`,
        category: 'TAREFA_ATRASADA',
        severity: 'CRITICA',
        title: pItem.acaoDescricao || pItem.regraNome || 'Tarefa Contratual Vencida',
        description: `${pItem.identificadorFormatado}${pItem.fornecedorNome ? ` (${pItem.fornecedorNome})` : ''} — Vencida há ${Math.abs(pItem.diasRestantes)} dias`,
        contractKey: pItem.contractKey,
        numeroContrato: pItem.identificadorFormatado,
        arpKey: pItem.arpKey,
        diasRelevantes: pItem.diasRestantes,
        dataAlvo: pItem.dataAlvo,
        targetUrl: pItem.contractKey ? `/contratos/${pItem.contractKey}` : undefined,
        badgeLabel: `Vencida (${pItem.diasRestantes}d)`
      });
    } else if (pItem.estadoTemporal === 'VENCE_HOJE') {
      items.push({
        id: `ATT-TASK-TODAY-${pItem.id}`,
        category: 'TAREFA_PROXIMA',
        severity: 'URGENTE',
        title: pItem.acaoDescricao || pItem.regraNome || 'Tarefa Vencendo Hoje',
        description: `${pItem.identificadorFormatado} — Vence hoje!`,
        contractKey: pItem.contractKey,
        numeroContrato: pItem.identificadorFormatado,
        arpKey: pItem.arpKey,
        diasRelevantes: 0,
        dataAlvo: pItem.dataAlvo,
        targetUrl: pItem.contractKey ? `/contratos/${pItem.contractKey}` : undefined,
        badgeLabel: 'Vence Hoje'
      });
    } else if (pItem.diasRestantes > 0 && pItem.diasRestantes <= 7) {
      items.push({
        id: `ATT-TASK-UPCOMING-${pItem.id}`,
        category: 'TAREFA_PROXIMA',
        severity: 'URGENTE',
        title: pItem.acaoDescricao || pItem.regraNome || 'Tarefa Próxima do Vencimento',
        description: `${pItem.identificadorFormatado} — Vence em ${pItem.diasRestantes} dias (${pItem.marcoEvento})`,
        contractKey: pItem.contractKey,
        numeroContrato: pItem.identificadorFormatado,
        arpKey: pItem.arpKey,
        diasRelevantes: pItem.diasRestantes,
        dataAlvo: pItem.dataAlvo,
        targetUrl: pItem.contractKey ? `/contratos/${pItem.contractKey}` : undefined,
        badgeLabel: `${pItem.diasRestantes} dias`
      });
    } else if (pItem.tipoItem === 'GATILHO_OPERACIONAL' && pItem.diasRestantes > 7 && pItem.diasRestantes <= 60) {
      items.push({
        id: `ATT-PRORROG-${pItem.id}`,
        category: 'PRORROGACAO_PROXIMA',
        severity: 'ATENCAO',
        title: pItem.regraNome || 'Marco de Planejamento de Prorrogação',
        description: `${pItem.identificadorFormatado} — Janela preventiva de análise (${pItem.diasRestantes} dias restantes)`,
        contractKey: pItem.contractKey,
        numeroContrato: pItem.identificadorFormatado,
        arpKey: pItem.arpKey,
        diasRelevantes: pItem.diasRestantes,
        dataAlvo: pItem.dataAlvo,
        targetUrl: pItem.contractKey ? `/contratos/${pItem.contractKey}` : undefined,
        badgeLabel: `${pItem.diasRestantes} dias`
      });
    }
  }

  // 2. Pagamentos com Atenção
  for (const cycle of paymentCycles) {
    const isVencido = cycle.prazos?.statusPrazo === 'VENCIDO' || cycle.prazos?.isVencida;
    const isCritico = cycle.prazos?.statusPrazo === 'CRITICO';
    const isAtrasoCgofi = (cycle.prazos?.diasSemRespostaCgofi ?? 0) > 5;

    if (isVencido || isCritico || isAtrasoCgofi) {
      const severity = isVencido ? 'CRITICA' : 'URGENTE';
      const docSei = cycle.input?.documentoAtestoSei || 'Atesto';
      const valorFmt = (cycle.input?.valorAtesto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      items.push({
        id: `ATT-PGTO-${cycle.cycleKey || cycle.contractKey}-${cycle.competencia || 'PGTO'}`,
        category: 'PAGAMENTO_CRITICO',
        severity,
        title: isAtrasoCgofi
          ? `Aguardando CGOFI há ${cycle.prazos?.diasSemRespostaCgofi} dias úteis (${docSei})`
          : `Fatura ${isVencido ? 'Vencida' : 'com Vencimento Crítico'} (${docSei})`,
        description: `Contrato ${cycle.contractKey} — Competência ${cycle.competencia || 'N/D'} (${valorFmt})`,
        contractKey: cycle.contractKey,
        cycleKey: cycle.cycleKey,
        diasRelevantes: cycle.prazos?.diasUteisAteVencimento,
        targetUrl: `/contratos/${cycle.contractKey}`,
        badgeLabel: isVencido ? 'Fatura Vencida' : `${cycle.prazos?.diasUteisAteVencimento ?? 0} dias úteis`
      });
    }
  }

  // 3. Radars de Reajuste / Repactuação
  for (const alert of (radarsReajuste || []).filter(Boolean)) {
    if (!alert) continue;
    const isUrgente = alert.nivel === 'URGENTE' || alert.nivel === 'HOJE' || alert.nivel === 'VENCIDA';
    const severity = alert.nivel === 'VENCIDA' ? 'CRITICA' : (isUrgente ? 'URGENTE' : 'ATENCAO');
    const numDisplay = alert.numeroContrato ? `${alert.numeroContrato}${alert.anoContrato ? `/${alert.anoContrato}` : ''}` : alert.contractKey;

    items.push({
      id: `ATT-REAJUSTE-${alert.contractKey}-${alert.ciclo}`,
      category: 'REAJUSTE_RADAR',
      severity,
      title: alert.titulo || 'Radar de Reajuste / Repactuação',
      description: `Contrato ${numDisplay} — ${alert.descricao || ''}`,
      contractKey: alert.contractKey,
      numeroContrato: numDisplay,
      diasRelevantes: alert.diasRestantes,
      dataAlvo: alert.dataAniversario,
      targetUrl: `/contratos/${alert.contractKey}`,
      badgeLabel: alert.nivel === 'VENCIDA' ? 'Data-Base Vencida' : `${alert.diasRestantes} dias`
    });
  }

  // 4. Atas com Consumo Crítico (>= 85%)
  for (const aItem of atasCriticas as any[]) {
    const rawPerc = aItem.percentual_consumido ?? aItem.percentualConsumido;
    const perc = Number(rawPerc) || 0;
    const roundedPerc = Number(perc.toFixed(2));
    const severity = roundedPerc >= 100 ? 'CRITICA' : (roundedPerc >= 85 ? 'URGENTE' : 'ATENCAO');
    const numAta = aItem.numero_ata || aItem.numeroAta;
    const numItem = aItem.numero_item || aItem.numeroItem;
    const descItem = aItem.descricao_item || aItem.descricaoItem || 'Item de ARP';
    const uasgItem = aItem.codigo_uasg || aItem.codigoUasg || aItem.uasg || '200331';
    const itemKey = aItem.item_key || aItem.itemKey || (numAta && numItem ? `${numAta}-${uasgItem}-${numItem}` : aItem.id || `ITEM-${Math.random()}`);

    items.push({
      id: `ATT-ARP-ITEM-${itemKey}`,
      category: 'ATA_CRITICA',
      severity,
      title: `Consumo Crítico em Ata (${roundedPerc.toFixed(1)}%)`,
      description: `Ata ${numAta || 's/n'} — Item ${numItem || 's/n'}: ${descItem}`,
      arpKey: itemKey,
      numeroAta: numAta,
      contractKey: aItem.contract_key || aItem.contractKey,
      diasRelevantes: 0,
      targetUrl: numAta ? `/atas/${numAta}` : undefined,
      badgeLabel: `${roundedPerc.toFixed(1)}% consumido`
    });
  }

  // Deduplicação determinística rigorosa
  const deduplicatedItems: import('../types/managementDashboard').DashboardAttentionItem[] = [];
  const seenAttentionIds = new Set<string>();
  for (const it of items) {
    if (!seenAttentionIds.has(it.id)) {
      seenAttentionIds.add(it.id);
      deduplicatedItems.push(it);
    }
  }

  // Ordenação determinística: Severidade (CRITICA=1, URGENTE=2, ATENCAO=3, INFO=4) -> diasRelevantes asc -> id asc
  const severityRank: Record<string, number> = {
    CRITICA: 1,
    URGENTE: 2,
    ATENCAO: 3,
    INFO: 4
  };

  deduplicatedItems.sort((a, b) => {
    const rankA = severityRank[a.severity] || 99;
    const rankB = severityRank[b.severity] || 99;
    if (rankA !== rankB) return rankA - rankB;

    const daysA = a.diasRelevantes ?? 9999;
    const daysB = b.diasRelevantes ?? 9999;
    if (daysA !== daysB) return daysA - daysB;

    return a.id.localeCompare(b.id);
  });

  let criticalCount = 0;
  for (const item of deduplicatedItems) {
    if (item.severity === 'CRITICA' || item.severity === 'URGENTE') {
      criticalCount++;
    }
  }

  const totalAlertasAtivos = deduplicatedItems.length;

  return {
    totalAlertasAtivos,
    criticalCount,
    overdueTasksCount,
    upcomingTasksCount,
    paymentAlertsCount,
    reajusteAlertsCount,
    atasCriticasCount,
    radarsReajuste: radarsReajuste.filter(Boolean) as any[],
    radarsUrgentesCount,
    pagamentosCriticosCount,
    tarefasVencidasCount,
    prazosKpis,
    items: deduplicatedItems
  };
}

/**
 * 4. Cálculo puro da Execução Financeira Oficial (Empenhos, Liquidações, Pagamentos, RP)
 */
export function calculateFinancialSummary(
  empenhos: Array<{
    empenho_key?: string;
    numero_empenho?: string;
    ano_empenho?: number | string;
    numero_contrato?: string;
    fornecedor_nome?: string;
    fornecedor_razao_social?: string;
    valor_empenhado?: number;
    valor_liquidado?: number;
    valor_pago?: number;
    valor_rpinscrito?: number;
    valor_rp_pago?: number;
    valor_rpp_inscrito?: number;
    valor_rpp_pago?: number;
    valor_rpnp_inscrito?: number;
    valor_rpnp_pago?: number;
  }> = []
): ManagementDashboardFinancialSummary {
  let totalEmpenhado = 0;
  let totalLiquidado = 0;
  let totalPago = 0;
  let totalRpInscrito = 0;
  let totalRpPago = 0;
  let rppInscrito = 0;
  let rppPago = 0;
  let rpnpInscrito = 0;
  let rpnpPago = 0;

  const empenhoDetails: import('../types/managementDashboard').ManagementDashboardEmpenhoDetail[] = [];
  const seenKeys = new Set<string>();

  for (let idx = 0; idx < empenhos.length; idx++) {
    const emp = empenhos[idx];
    const empAny = emp as any;
    const empNum = empAny.numero_oficial || empAny.numero_empenho || empAny.numero || empAny.id || '';
    const anoNum = typeof empAny.ano_exercicio === 'number'
      ? empAny.ano_exercicio
      : (typeof empAny.ano_empenho === 'number'
          ? empAny.ano_empenho
          : parseInt(String(empAny.ano_empenho || empAny.ano_exercicio || '0'), 10) || undefined);
    const empKey = empAny.canonical_key || empAny.empenho_key || (empNum ? `${empNum}-${anoNum || ''}` : (empAny.id || `anon_${idx}`));

    if (!seenKeys.has(empKey)) {
      seenKeys.add(empKey);

      const vEmp = Number(emp.valor_empenhado || 0);
      const vLiq = Number(emp.valor_liquidado || 0);
      const vPag = Number(emp.valor_pago || 0);
      const vRpIns = Number(emp.valor_rpinscrito || 0);
      const vRpPag = Number(emp.valor_rp_pago || 0);

      totalEmpenhado += vEmp;
      totalLiquidado += vLiq;
      totalPago += vPag;
      totalRpInscrito += vRpIns;
      totalRpPago += vRpPag;

      rppInscrito += Number(emp.valor_rpp_inscrito || 0);
      rppPago += Number(emp.valor_rpp_pago || 0);
      rpnpInscrito += Number(emp.valor_rpnp_inscrito || 0);
      rpnpPago += Number(emp.valor_rpnp_pago || 0);
      const saldoALiq = Math.max(0, vEmp - vLiq);
      const saldoAPag = Math.max(0, vLiq - vPag);
      const saldoNaoExec = Math.max(0, vEmp - vPag);
      const percExec = vEmp > 0 ? Number(((vPag / vEmp) * 100).toFixed(2)) : 0;

      const contNum = empAny.numero_contrato || empAny.contract_key || (empAny.contract_keys && empAny.contract_keys.length > 0 ? empAny.contract_keys[0] : undefined);
      const fornNome = empAny.credor_nome || empAny.fornecedor_nome || empAny.fornecedor_razao_social || empAny.credor;

      empenhoDetails.push({
        empenhoKey: empKey,
        numeroEmpenho: empNum,
        ano: anoNum,
        contratoNumero: contNum,
        fornecedorNome: fornNome,
        valorEmpenhado: Number(vEmp.toFixed(2)),
        valorLiquidado: Number(vLiq.toFixed(2)),
        valorPago: Number(vPag.toFixed(2)),
        saldoALiquidar: Number(saldoALiq.toFixed(2)),
        saldoAPagar: Number(saldoAPag.toFixed(2)),
        saldoNaoExecutado: Number(saldoNaoExec.toFixed(2)),
        percentualExecutado: percExec
      });
    }
  }

  const balances = calculateFinancialBalances(
    totalEmpenhado,
    totalLiquidado,
    totalPago,
    totalRpInscrito,
    totalRpPago
  );

  empenhoDetails.sort((a, b) => b.valorEmpenhado - a.valorEmpenhado);

  const taxaPagamentoSobreEmpenhadoPercentual = totalEmpenhado > 0
    ? Number(((totalPago / totalEmpenhado) * 100).toFixed(2))
    : 0;

  return {
    totalEmpenhado: Number(totalEmpenhado.toFixed(2)),
    totalLiquidado: Number(totalLiquidado.toFixed(2)),
    totalPago: Number(totalPago.toFixed(2)),
    saldoALiquidar: Number(balances.saldoALiquidar.toFixed(2)),
    saldoAPagar: Number(balances.saldoAPagar.toFixed(2)),
    saldoNaoExecutado: Number(balances.saldoNaoExecutado.toFixed(2)),
    totalRpInscrito: Number(totalRpInscrito.toFixed(2)),
    totalRpPago: Number(totalRpPago.toFixed(2)),
    saldoRpPendente: Number(balances.saldoRpPendente.toFixed(2)),
    rppInscrito: Number(rppInscrito.toFixed(2)),
    rppPago: Number(rppPago.toFixed(2)),
    rpnpInscrito: Number(rpnpInscrito.toFixed(2)),
    rpnpPago: Number(rpnpPago.toFixed(2)),
    taxaLiquidacaoPercentual: balances.taxaLiquidacaoPercentual,
    taxaPagamentoPercentual: balances.taxaPagamentoPercentual,
    taxaPagamentoSobreEmpenhadoPercentual,
    topEmpenhos: empenhoDetails,
    burnRateMensalDisponivel: false // Marcado como GAP futuro para Fase 8-F
  };
}

export function calculateArpSummary(
  arps: ArpRecord[] = [],
  itemsSaldo: Array<{
    item_key?: string;
    numero_ata?: string;
    codigo_uasg?: string;
    numero_item?: number | string;
    descricao_item?: string;
    fornecedor_razao_social?: string;
    quantidade_homologada?: number;
    quantidade_consumida?: number;
    saldo_disponivel?: number;
    percentual_consumido?: number;
    total_empenhos_vinculados?: number;
    contract_key?: string;
  }> = []
): ManagementDashboardArpSummary {
  const totalAtas = arps.length;
  const totalItens = itemsSaldo.length;

  let quantidadeHomologadaTotal = 0;
  let quantidadeEmpenhadaTotal = 0;

  const itemSummaries: ManagementDashboardArpItemSummary[] = itemsSaldo.map((item, idx) => {
    const qtdHomologada = Number(item.quantidade_homologada || 0);
    const qtdConsumida = Number(item.quantidade_consumida || 0);
    const saldo = Number(typeof item.saldo_disponivel === 'number' ? item.saldo_disponivel : (qtdHomologada - qtdConsumida));
    const percentual = Number(
      typeof item.percentual_consumido === 'number'
        ? item.percentual_consumido
        : (qtdHomologada > 0 ? (qtdConsumida / qtdHomologada) * 100 : 0)
    );

    quantidadeHomologadaTotal += qtdHomologada;
    quantidadeEmpenhadaTotal += qtdConsumida;

    const roundedPercentual = Number(percentual.toFixed(2));
    const isCritico = roundedPercentual >= 85;
    const isProximoLimite = roundedPercentual >= 70 && roundedPercentual < 85;

    return {
      itemKey: item.item_key || `ITEM-${idx + 1}`,
      numeroAta: item.numero_ata || 'N/D',
      codigoUasg: item.codigo_uasg,
      numeroItem: item.numero_item || idx + 1,
      descricaoItem: item.descricao_item,
      fornecedorNome: item.fornecedor_razao_social,
      quantidadeHomologada: qtdHomologada,
      quantidadeConsumida: qtdConsumida,
      saldoDisponivel: saldo,
      percentualConsumido: roundedPercentual,
      isCritico,
      isProximoLimite,
      totalEmpenhosVinculados: item.total_empenhos_vinculados,
      contractKey: item.contract_key
    };
  });

  const itensCriticosCount = itemSummaries.filter((i) => i.isCritico).length;
  const itensProximosLimiteCount = itemSummaries.filter((i) => i.isProximoLimite).length;

  const saldoFisicoTotal = quantidadeHomologadaTotal - quantidadeEmpenhadaTotal;
  const percentualConsumoGlobal = quantidadeHomologadaTotal > 0
    ? Number(((quantidadeEmpenhadaTotal / quantidadeHomologadaTotal) * 100).toFixed(2))
    : 0;

  // Ordenação determinística:
  // 1. Maior percentual de consumo desc
  // 2. Menor saldo físico asc
  // 3. Identificação do item asc
  const sortedItems = [...itemSummaries].sort((a, b) => {
    if (b.percentualConsumido !== a.percentualConsumido) {
      return b.percentualConsumido - a.percentualConsumido;
    }
    if (a.saldoDisponivel !== b.saldoDisponivel) {
      return a.saldoDisponivel - b.saldoDisponivel;
    }
    return a.itemKey.localeCompare(b.itemKey);
  });

  const topItensConsumidos = sortedItems.slice(0, 10);
  const itensCriticosDetalhe = sortedItems.filter((i) => i.isCritico || i.isProximoLimite);

  return {
    totalAtas,
    totalItens,
    itensCriticosCount,
    itensProximosLimiteCount,
    quantidadeHomologadaTotal,
    quantidadeEmpenhadaTotal,
    saldoFisicoTotal,
    percentualConsumoGlobal,
    topItensConsumidos,
    itensCriticosDetalhe: itensCriticosDetalhe.length > 0 ? itensCriticosDetalhe : topItensConsumidos
  };
}

/**
 * 6. Cálculo puro do Acompanhamento de Faturamento e Pagamentos
 */
export function calculatePaymentsSummary(
  cycles: PaymentFollowUpCycle[] = []
): ManagementDashboardPaymentsSummary {
  const totalCiclos = cycles.length;
  let ciclosAbertosCount = 0;
  let ciclosConcluidosCount = 0;
  let ciclosCriticosCount = 0;
  let ciclosAtrasoCgofiCount = 0;
  let faturasVencidasCount = 0;
  let faturasVenceHojeCount = 0;
  let faturasProximasVencimentoCount = 0;
  let envioCgofiAtrasadoCount = 0;
  let documentacaoPendenteCount = 0;
  let margemEnvioEstreitaCount = 0;

  const distribuicaoPorEstado: Record<string, number> = {
    RECEBIDO: 0,
    ATRIBUIDO: 0,
    EM_INSTRUCAO: 0,
    PENDENTE_DOCUMENTACAO: 0,
    DESPACHO_ELABORADO: 0,
    ENVIADO_CGOFI: 0,
    AGUARDANDO_CGOFI: 0,
    DEVOLVIDO_FISCAL: 0,
    PAGAMENTO_CONFIRMADO: 0,
    CONCLUIDO: 0,
    CANCELADO: 0
  };

  let totalDiasCgofi = 0;
  let countCgofi = 0;

  for (const cycle of cycles) {
    const status = cycle.status || 'RECEBIDO';
    distribuicaoPorEstado[status] = (distribuicaoPorEstado[status] || 0) + 1;

    const isFinalizado =
      status === 'CONCLUIDO' ||
      status === 'PAGAMENTO_CONFIRMADO' ||
      status === 'CANCELADO';

    if (isFinalizado) {
      ciclosConcluidosCount++;
    } else {
      ciclosAbertosCount++;
    }

    if (status === 'PENDENTE_DOCUMENTACAO') {
      documentacaoPendenteCount++;
    }

    const isVencida = cycle.prazos?.statusPrazo === 'VENCIDO' || cycle.prazos?.isVencida;
    const diasUteisAteVencimento = cycle.prazos?.diasUteisAteVencimento;

    if (!isFinalizado) {
      if (isVencida) {
        faturasVencidasCount++;
      } else if (diasUteisAteVencimento === 0) {
        faturasVenceHojeCount++;
      } else if (diasUteisAteVencimento !== undefined && diasUteisAteVencimento > 0 && diasUteisAteVencimento <= 3) {
        faturasProximasVencimentoCount++;
      }

      if (cycle.prazos?.statusPrazo === 'CRITICO' || isVencida) {
        ciclosCriticosCount++;
      }

      if ((cycle.prazos?.diasSemRespostaCgofi ?? 0) > 5) {
        ciclosAtrasoCgofiCount++;
      }

      if (
        (status === 'EM_INSTRUCAO' || status === 'DESPACHO_ELABORADO' || status === 'RECEBIDO') &&
        ((cycle.prazos?.margemEnvioDiasUteis ?? 99) < 0 || isVencida)
      ) {
        envioCgofiAtrasadoCount++;
      }

      if (
        (status === 'EM_INSTRUCAO' || status === 'DESPACHO_ELABORADO') &&
        cycle.prazos?.margemEnvioDiasUteis !== undefined &&
        cycle.prazos.margemEnvioDiasUteis >= 0 &&
        cycle.prazos.margemEnvioDiasUteis <= 2
      ) {
        margemEnvioEstreitaCount++;
      }
    }

    // Cálculo do tempo médio CGOFI para ciclos com envio e OB/conclusão
    if (cycle.input?.dataEnvioCgofi && (cycle.input?.dataOrdemBancaria || cycle.concluidoEm)) {
      const diasResposta = cycle.prazos?.diasSemRespostaCgofi;
      if (typeof diasResposta === 'number' && diasResposta >= 0) {
        totalDiasCgofi += diasResposta;
        countCgofi++;
      }
    }
  }

  const tempoMedioCgofiDisponivel = countCgofi > 0;
  const tempoMedioCgofiDias = tempoMedioCgofiDisponivel
    ? Number((totalDiasCgofi / countCgofi).toFixed(1))
    : undefined;

  const ciclosRecentes = [...cycles]
    .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
    .slice(0, 5);

  const severityRank: Record<string, number> = {
    VENCIDO: 1,
    CRITICO: 2,
    ATENCAO: 3,
    NORMAL: 4
  };

  const openCycles = cycles.filter(
    (c) => c.status !== 'CONCLUIDO' && c.status !== 'CANCELADO'
  );

  const ciclosAbertosDetalhe = [...openCycles].sort((a, b) => {
    const rankA = severityRank[a.prazos?.statusPrazo || 'NORMAL'] || 99;
    const rankB = severityRank[b.prazos?.statusPrazo || 'NORMAL'] || 99;
    if (rankA !== rankB) return rankA - rankB;

    const daysA = a.prazos?.diasUteisAteVencimento ?? 9999;
    const daysB = b.prazos?.diasUteisAteVencimento ?? 9999;
    if (daysA !== daysB) return daysA - daysB;

    const cgofiA = a.prazos?.diasSemRespostaCgofi ?? 0;
    const cgofiB = b.prazos?.diasSemRespostaCgofi ?? 0;
    if (cgofiA !== cgofiB) return cgofiB - cgofiA;

    return (a.cycleKey || '').localeCompare(b.cycleKey || '');
  });

  return {
    totalCiclos,
    ciclosAbertosCount,
    ciclosConcluidosCount,
    ciclosCriticosCount,
    ciclosAtrasoCgofiCount,
    faturasVencidasCount,
    faturasVenceHojeCount,
    faturasProximasVencimentoCount,
    envioCgofiAtrasadoCount,
    documentacaoPendenteCount,
    margemEnvioEstreitaCount,
    distribuicaoPorEstado,
    ciclosRecentes,
    ciclosAbertosDetalhe,
    tempoMedioCgofiDisponivel,
    tempoMedioCgofiDias
  };
}

/**
 * Constrói o Read Model unificado determinístico
 */
export function buildManagementDashboardReadModel(params: {
  uasg?: string;
  contracts?: ContractDashboardRecord[];
  arps?: ArpRecord[];
  managers?: Record<string, ContractManager>;
  plans?: Record<string, ContractTaskPlan>;
  eventsMap?: Record<string, ContractEvent[]>;
  empenhos?: Array<any>;
  itemsSaldo?: Array<any>;
  paymentCycles?: PaymentFollowUpCycle[];
  syncInfo?: SyncMetadata;
  currentDate?: Date;
  filters?: ManagementDashboardFilters;
}): ManagementDashboardReadModel {
  const uasg = params.filters?.uasg || params.uasg || '200331';
  const currentDate = params.currentDate || new Date();
  const dataCalculo = currentDate.toISOString();

  // 1. Extração dos Filtros Disponíveis (a partir da base total não-filtrada para a UASG)
  const rawContracts = params.contracts || [];
  const rawArps = params.arps || [];
  const rawItemsSaldo = params.itemsSaldo || [];
  const rawEmpenhos = params.empenhos || [];
  const rawPaymentCycles = params.paymentCycles || [];
  const rawEventsMap = params.eventsMap || {};
  const rawManagers = params.managers || {};
  const rawPlans = params.plans || {};

  const availableContracts: ManagementDashboardFilterOption[] = rawContracts.map((c) => {
    const key = c.id || `${c.numero || ''}${c.ano ? `/${c.ano}` : ''}`;
    const num = c.numero ? `${c.numero}${c.ano ? `/${c.ano}` : ''}` : key;
    return {
      key,
      label: `Contrato ${num}`,
      sublabel: c.fornecedorNome || c.objeto
    };
  });

  const seenAtas = new Set<string>();
  const availableAtas: ManagementDashboardFilterOption[] = [];
  for (const a of rawArps) {
    const num = a.numeroAtaRegistroPreco || (a as any).numeroAta || (a as any).numero || (a as any).id;
    if (num && !seenAtas.has(num)) {
      seenAtas.add(num);
      availableAtas.push({
        key: num,
        label: `Ata ${num}`,
        sublabel: a.objeto
      });
    }
  }
  for (const item of rawItemsSaldo) {
    const num = item.numero_ata || item.numeroAta;
    if (num && !seenAtas.has(num)) {
      seenAtas.add(num);
      availableAtas.push({
        key: num,
        label: `Ata ${num}`,
        sublabel: item.descricao_item
      });
    }
  }

  // 2. Aplicação Determinística dos Filtros
  const f = params.filters || {};
  let filteredContracts = rawContracts;
  let filteredArps = rawArps;
  let filteredItemsSaldo = rawItemsSaldo;
  let filteredEmpenhos = rawEmpenhos;
  let filteredPaymentCycles = rawPaymentCycles;
  let filteredEventsMap = rawEventsMap;
  let filteredManagers = rawManagers;
  let filteredPlans = rawPlans;

  if (f.contractKey) {
    filteredContracts = filteredContracts.filter((c) => {
      const key = c.id || `${c.numero || ''}${c.ano ? `/${c.ano}` : ''}`;
      const num = c.numero ? `${c.numero}${c.ano ? `/${c.ano}` : ''}` : '';
      return key === f.contractKey || num === f.contractKey || c.id === f.contractKey || c.numero === f.contractKey;
    });

    const activeContractKeys = new Set(
      filteredContracts.flatMap((c) => [c.id, c.numero, `${c.numero}/${c.ano}`]).filter(Boolean)
    );

    // Empenhos vinculados ao contrato
    filteredEmpenhos = filteredEmpenhos.filter((emp) => {
      const empContrato = emp.numero_contrato || emp.contrato_id || emp.contratoNumero || emp.contract_key;
      const contractKeysList: string[] = Array.isArray(emp.contract_keys)
        ? emp.contract_keys
        : emp.contract_key ? [emp.contract_key] : [];
      return (
        (empContrato && (activeContractKeys.has(empContrato) || empContrato === f.contractKey)) ||
        contractKeysList.some((k: string) => activeContractKeys.has(k) || k === f.contractKey)
      );
    });

    // Ciclos de pagamento vinculados ao contrato
    filteredPaymentCycles = filteredPaymentCycles.filter((cycle) => {
      return cycle.contractKey === f.contractKey || activeContractKeys.has(cycle.contractKey);
    });

    // Itens de ARP vinculados ao contrato
    filteredItemsSaldo = filteredItemsSaldo.filter((item) => {
      const itemContract = item.contract_key || item.contractKey;
      return itemContract && (itemContract === f.contractKey || activeContractKeys.has(itemContract));
    });

    // Planos, gestores e eventos
    filteredManagers = Object.fromEntries(
      Object.entries(rawManagers).filter(([k]) => k === f.contractKey || activeContractKeys.has(k))
    );
    filteredPlans = Object.fromEntries(
      Object.entries(rawPlans).filter(([k]) => k === f.contractKey || activeContractKeys.has(k))
    );
    filteredEventsMap = Object.fromEntries(
      Object.entries(rawEventsMap).filter(([k]) => k === f.contractKey || activeContractKeys.has(k))
    );
  }

  if (f.numeroAta) {
    filteredArps = filteredArps.filter((a) => (a.numeroAtaRegistroPreco || (a as any).numeroAta || (a as any).numero || (a as any).id) === f.numeroAta);
    filteredItemsSaldo = filteredItemsSaldo.filter((item) => (item.numero_ata || item.numeroAta) === f.numeroAta);

    // Empenhos vinculados aos itens desta Ata
    const matchingItemKeys = new Set(filteredItemsSaldo.map((i) => i.item_key || i.itemKey));
    filteredEmpenhos = filteredEmpenhos.filter((emp) => {
      const ataNum = emp.numero_ata || emp.arp_id;
      const itemKey = emp.item_key || emp.itemKey;
      return ataNum === f.numeroAta || (itemKey && matchingItemKeys.has(itemKey));
    });
  }

  if (f.statusContrato && f.statusContrato !== 'TODOS') {
    filteredContracts = filteredContracts.filter((c) => {
      const statusVig = (c.statusVigencia || (c as any).status || '').toUpperCase();
      const isAtivo = statusVig === 'VIGENTE' || statusVig.includes('VENCER') || statusVig.includes('60D') || statusVig === 'ATIVO' || !statusVig;
      const isEncerrado = statusVig === 'EXPIRADO' || statusVig === 'NÃO INFORMADO' || statusVig.includes('ENCERRAD') || statusVig.includes('RESCINDID') || statusVig === 'CONCLUIDO';

      if (f.statusContrato === 'ATIVO') return isAtivo && !isEncerrado;
      if (f.statusContrato === 'ENCERRADO') return isEncerrado;
      if (f.statusContrato === 'EM_PRORROGACAO') {
        const events = filteredEventsMap[c.id] || [];
        const hasProrrog = events.some(e => e.tipoEvento === 'PRORROGACAO') || (c as any).emProrrogacao;
        return Boolean(hasProrrog);
      }
      return true;
    });
  }

  // 3. Recalcula todos os blocos determinísticos sobre os dados filtrados
  const executive = calculateExecutiveKPIs(filteredContracts, filteredEventsMap);
  const deadlines = calculateDeadlinesSummary(filteredContracts, currentDate);
  const attention = calculateAttentionSummary({
    contracts: filteredContracts,
    arps: filteredArps,
    managers: filteredManagers,
    plans: filteredPlans,
    eventsMap: filteredEventsMap,
    paymentCycles: filteredPaymentCycles,
    arpItems: filteredItemsSaldo,
    currentDate
  });
  const financial = calculateFinancialSummary(filteredEmpenhos);
  const arp = calculateArpSummary(filteredArps, filteredItemsSaldo);
  const payments = calculatePaymentsSummary(filteredPaymentCycles);

  return {
    uasg,
    dataCalculo,
    executive,
    deadlines,
    attention,
    financial,
    arp,
    payments,
    filtersApplied: f,
    availableFilters: {
      contracts: availableContracts,
      atas: availableAtas
    },
    syncInfo: params.syncInfo
  };
}

/**
 * 7. Consulta assíncrona consolidada via Supabase / Serviços oficiais (Promise.all)
 */
export async function fetchManagementDashboardData(
  filtersOrUasg: string | ManagementDashboardFilters = '200331',
  currentDate?: Date
): Promise<ManagementDashboardReadModel> {
  const filters: ManagementDashboardFilters = typeof filtersOrUasg === 'string'
    ? { uasg: filtersOrUasg.trim() || '200331' }
    : { ...filtersOrUasg, uasg: (filtersOrUasg.uasg || '200331').trim() };

  const cleanUasg = filters.uasg || '200331';

  // Execução paralela das fontes soberanas
  const [
    contracts,
    arpsRes,
    managers,
    plans,
    empenhosResumo,
    arpItemsSaldo
  ] = await Promise.all([
    fetchContractsForDashboard(cleanUasg, false).catch((err) => {
      console.warn('Erro ao consultar contratos para o dashboard:', err);
      return [] as ContractDashboardRecord[];
    }),
    fetchArpsFromDb(cleanUasg).catch((err) => {
      console.warn('Erro ao consultar ARPs para o dashboard:', err);
      return { arps: [], syncInfo: { isCachedInDb: false } };
    }),
    fetchAllContractManagers(cleanUasg).catch((err) => {
      console.warn('Erro ao consultar gestores para o dashboard:', err);
      return {} as Record<string, ContractManager>;
    }),
    fetchAllContractTaskPlans(cleanUasg).catch((err) => {
      console.warn('Erro ao consultar planos de tarefas para o dashboard:', err);
      return {} as Record<string, ContractTaskPlan>;
    }),
    fetchEmpenhosResumoFromDb(cleanUasg),
    fetchArpItemSaldosFromDb(cleanUasg)
  ]);

  const paymentCycles = fetchAllPaymentCyclesFromStorage(contracts);

  return buildManagementDashboardReadModel({
    uasg: cleanUasg,
    contracts,
    arps: arpsRes.arps,
    managers,
    plans,
    empenhos: empenhosResumo,
    itemsSaldo: arpItemsSaldo,
    paymentCycles,
    filters,
    syncInfo: arpsRes.syncInfo,
    currentDate
  });
}

/**
 * Consulta síncrona/segura a ciclos de faturamento persistidos no storage
 */
export function fetchAllPaymentCyclesFromStorage(contracts?: ContractDashboardRecord[]): PaymentFollowUpCycle[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const cycles: PaymentFollowUpCycle[] = [];
  const seenKeys = new Set<string>();

  try {
    if (contracts && contracts.length > 0) {
      for (const c of contracts) {
        if (!c) continue;
        const contractKey = c.id || (c as any).contractKey || `${c.numero || ''}${c.ano ? `/${c.ano}` : ''}`;
        if (!contractKey) continue;
        const key = `saldoarp:payment-cycles:${contractKey}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item && item.cycleKey && !seenKeys.has(item.cycleKey)) {
                  seenKeys.add(item.cycleKey);
                  cycles.push(item);
                }
              }
            }
          } catch {}
        }
      }
    }

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('saldoarp:payment-cycles:')) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item && item.cycleKey && !seenKeys.has(item.cycleKey)) {
                  seenKeys.add(item.cycleKey);
                  cycles.push(item);
                }
              }
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar ciclos de pagamento do storage:', err);
  }

  return cycles;
}

/**
 * Consulta segura à view SQL v_empenhos_resumo enriquecida com vínculos de contrato
 */
export async function fetchEmpenhosResumoFromDb(_uasg?: string): Promise<any[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const allEmpenhos: any[] = [];
    const pageSize = 1000;
    let from = 0;

    // Busca paginada em v_empenhos_resumo para suportar universos superiores a 1.000 registros
    while (true) {
      const { data, error } = await supabase
        .from('v_empenhos_resumo')
        .select('*')
        .range(from, from + pageSize - 1);

      if (error || !data || data.length === 0) break;
      allEmpenhos.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    if (allEmpenhos.length === 0) return [];

    // Busca vínculos de contratos na tabela canônica contrato_empenhos de forma paginada e segura
    try {
      const linksByEmpenho = new Map<string, string[]>();
      let linkFrom = 0;

      while (true) {
        const { data: links, error: linkErr } = await supabase
          .from('contrato_empenhos')
          .select('empenho_id, contract_key, valor_vinculado')
          .range(linkFrom, linkFrom + pageSize - 1);

        if (linkErr || !links || links.length === 0) break;

        for (const l of links) {
          const key = String(l.empenho_id);
          if (!linksByEmpenho.has(key)) {
            linksByEmpenho.set(key, []);
          }
          if (l.contract_key && !linksByEmpenho.get(key)!.includes(l.contract_key)) {
            linksByEmpenho.get(key)!.push(l.contract_key);
          }
        }

        if (links.length < pageSize) break;
        linkFrom += pageSize;
      }

      return allEmpenhos.map((item: any) => {
        const empId = String(item.empenho_id || item.id || '');
        const contractKeys = linksByEmpenho.get(empId) || [];
        return {
          ...item,
          contract_keys: contractKeys,
          contract_key: contractKeys[0] || item.contract_key || undefined
        };
      });
    } catch (linkErr) {
      console.warn('Erro ao consultar vínculos contrato_empenhos:', linkErr);
    }

    return allEmpenhos;
  } catch (err) {
    console.warn('Erro ao consultar v_empenhos_resumo:', err);
    return [];
  }
}

/**
 * Consulta segura à view SQL v_arp_item_saldo_detalhado
 */
export async function fetchArpItemSaldosFromDb(uasg?: string): Promise<any[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    let query = supabase.from('v_arp_item_saldo_detalhado').select('*');
    if (uasg) {
      query = query.eq('codigo_uasg', uasg);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data;
  } catch (err) {
    console.warn('Erro ao consultar v_arp_item_saldo_detalhado:', err);
    return [];
  }
}
