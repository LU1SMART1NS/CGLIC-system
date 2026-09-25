/**
 * Serviço de Domínio para Acompanhamento de Pagamentos e Faturamento (SaldoARP 3.0 - Fase 7.4-C)
 * 
 * Responsabilidades:
 * 1. Geração determinística e estável de cycleKey para ciclos de faturamento/atesto.
 * 2. Cálculo rigoroso de prazos em dias úteis com normalização America/Sao_Paulo (reutilizando temporalEngineService).
 * 3. Emissão de alertas operacionais preditivos para a Central de Atenção.
 * 4. Determinação do estado do workflow baseado nas etapas executadas e evidências oficiais registradas.
 * 5. Garantia absoluta de isolamento: não altera nem sobrescreve grandezas financeiras em public.empenhos.
 */

import {
  parseDateBRT,
  formatDateISO,
  differenceInBusinessDays
} from './temporalEngineService';
import type {
  PaymentCycleInput,
  PaymentCyclePrazos,
  PaymentFollowUpCycle,
  PaymentWorkflowStatus,
  PaymentAlert
} from '../types/paymentFollowUp';
import type { FinancialBalances } from '../types/financialExecution';

/**
 * Gera a chave canônica determinística do ciclo operacional de pagamento
 * Formato: {contractKey}-PGTO-{YYYYMM}-{DocIdNormalizado}
 */
export function buildPaymentCycleKey(
  contractKey: string,
  competencia: string,
  docAtestoOrNumeroFatura: string
): string {
  const cleanContract = (contractKey || 'UNKNOWN').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  const cleanComp = (competencia || 'GERAL').trim().replace(/[^0-9]/g, '').slice(0, 6) || 'GERAL';
  const cleanDoc = (docAtestoOrNumeroFatura || 'ATESTO')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();

  return `${cleanContract}-PGTO-${cleanComp}-${cleanDoc}`;
}

/**
 * Calcula os prazos e indicadores dinâmicos do ciclo em dias úteis utilizando o temporalEngineService
 */
export function calculatePaymentCyclePrazos(
  input: PaymentCycleInput,
  baseDate?: Date | string
): PaymentCyclePrazos {
  const hoje = baseDate 
    ? (typeof baseDate === 'string' ? parseDateBRT(baseDate) || new Date() : new Date(baseDate))
    : new Date();
  hoje.setHours(0, 0, 0, 0);

  const dataAtesto = parseDateBRT(input.dataAssinaturaAtesto) || hoje;
  const dataVencimento = parseDateBRT(input.dataVencimentoFatura) || hoje;
  const dataEnvio = input.dataEnvioCgofi ? parseDateBRT(input.dataEnvioCgofi) : null;
  const dataOb = input.dataOrdemBancaria ? parseDateBRT(input.dataOrdemBancaria) : null;

  // 1. Dias úteis até o vencimento (dataVencimento - hoje)
  const isVencida = dataVencimento.getTime() < hoje.getTime();
  const diasUteisAteVencimento = differenceInBusinessDays(dataVencimento, hoje);

  // 2. Janela total de trabalho (dataVencimento - dataAtesto)
  const janelaTotalDiasUteis = Math.max(0, differenceInBusinessDays(dataVencimento, dataAtesto));

  // 3. Dias sem resposta da CGOFI (dataFinalComparacao - dataEnvio)
  let diasSemRespostaCgofi = 0;
  if (dataEnvio) {
    const dataFim = dataOb || hoje;
    diasSemRespostaCgofi = Math.max(0, differenceInBusinessDays(dataFim, dataEnvio));
  }

  // 4. Margem no envio (dataVencimento - dataEnvio)
  let margemEnvioDiasUteis = 0;
  if (dataEnvio) {
    margemEnvioDiasUteis = differenceInBusinessDays(dataVencimento, dataEnvio);
  }

  // Classificação do status do prazo
  let statusPrazo: PaymentCyclePrazos['statusPrazo'] = 'NORMAL';
  if (isVencida) {
    statusPrazo = 'VENCIDO';
  } else if (diasUteisAteVencimento <= 3) {
    statusPrazo = 'CRITICO';
  } else if (diasUteisAteVencimento <= 7) {
    statusPrazo = 'ATENCAO';
  }

  return {
    diasUteisAteVencimento,
    janelaTotalDiasUteis,
    diasSemRespostaCgofi,
    margemEnvioDiasUteis,
    isVencida,
    statusPrazo
  };
}

/**
 * Emite os alertas operacionais do ciclo de faturamento/pagamento para a Central de Atenção
 */
export function derivePaymentCycleAlerts(
  cycleKey: string,
  contractKey: string,
  status: PaymentWorkflowStatus,
  input: PaymentCycleInput,
  prazos: PaymentCyclePrazos,
  empenhoBalances?: Partial<FinancialBalances>,
  baseDate?: Date | string
): PaymentAlert[] {
  const alerts: PaymentAlert[] = [];
  const hoje = baseDate 
    ? (typeof baseDate === 'string' ? parseDateBRT(baseDate) || new Date() : new Date(baseDate))
    : new Date();
  hoje.setHours(0, 0, 0, 0);

  const dataAtesto = parseDateBRT(input.dataAssinaturaAtesto) || hoje;
  const isFinalizado = status === 'CONCLUIDO' || status === 'PAGAMENTO_CONFIRMADO' || status === 'CANCELADO';

  if (!isFinalizado) {
    // 1. Alerta Crítico / Vencido: Fatura com vencimento próximo ou ultrapassado
    if (status !== 'ENVIADO_CGOFI' && status !== 'AGUARDANDO_CGOFI') {
      if (prazos.isVencida) {
        alerts.push({
          id: `${cycleKey}-ALERT-VENCIDA`,
          cycleKey,
          contractKey,
          nivel: 'CRITICO',
          tipo: 'PAGAMENTO_FATURA_VENCIDA',
          mensagem: `FATURA VENCIDA (${input.documentoAtestoSei || 'Atesto'}): prazo fatal expirado sem remessa à CGOFI!`,
          diasRelevantes: Math.abs(prazos.diasUteisAteVencimento),
          dataReferencia: input.dataVencimentoFatura
        });
      } else if (prazos.diasUteisAteVencimento <= 3) {
        alerts.push({
          id: `${cycleKey}-ALERT-VENCIMENTO-IMINENTE`,
          cycleKey,
          contractKey,
          nivel: 'CRITICO',
          tipo: 'PAGAMENTO_VENCIMENTO_IMINENTE',
          mensagem: `Vencimento iminente em ${prazos.diasUteisAteVencimento} dias úteis (${input.documentoAtestoSei || 'Atesto'}) pendente de remessa à CGOFI!`,
          diasRelevantes: prazos.diasUteisAteVencimento,
          dataReferencia: input.dataVencimentoFatura
        });
      }
    }

    // 2. Alerta de Atenção: Atesto recebido há mais de 2 dias úteis sem atribuição
    if (status === 'RECEBIDO' && !input.responsavelNome) {
      const diasSemAtribuicao = differenceInBusinessDays(hoje, dataAtesto);
      if (diasSemAtribuicao > 2) {
        alerts.push({
          id: `${cycleKey}-ALERT-PENDENTE-ATRIBUICAO`,
          cycleKey,
          contractKey,
          nivel: 'ATENCAO',
          tipo: 'ATESTO_PENDENTE_ATRIBUICAO',
          mensagem: `Atesto recebido há ${diasSemAtribuicao} dias úteis sem servidor atribuído para confecção.`,
          diasRelevantes: diasSemAtribuicao,
          dataReferencia: input.dataAssinaturaAtesto
        });
      }
    }

    // 3. Alerta de Acompanhamento: Processo na CGOFI há mais de 5 dias úteis sem confirmação de OB
    if (status === 'AGUARDANDO_CGOFI' || (status === 'ENVIADO_CGOFI' && !input.numeroOrdemBancaria)) {
      if (prazos.diasSemRespostaCgofi > 5) {
        alerts.push({
          id: `${cycleKey}-ALERT-CGOFI-SEM-RESPOSTA`,
          cycleKey,
          contractKey,
          nivel: 'ATENCAO',
          tipo: 'CGOFI_SEM_RESPOSTA',
          mensagem: `Processo remetido à CGOFI há ${prazos.diasSemRespostaCgofi} dias úteis sem confirmação de Ordem Bancária.`,
          diasRelevantes: prazos.diasSemRespostaCgofi,
          dataReferencia: input.dataEnvioCgofi
        });
      }
    }

    // 4. Alerta Informativo / Verificação: Saldo de empenho insuficiente para o atesto
    if (empenhoBalances && empenhoBalances.saldoALiquidar !== undefined) {
      if (empenhoBalances.saldoALiquidar < input.valorAtesto) {
        alerts.push({
          id: `${cycleKey}-ALERT-SALDO-INSUFICIENTE`,
          cycleKey,
          contractKey,
          nivel: 'ATENCAO',
          tipo: 'EMPENHO_SEM_SALDO_SUFICIENTE',
          mensagem: `Atenção: Saldo a liquidar do empenho selecionado (R$ ${empenhoBalances.saldoALiquidar.toFixed(2)}) é inferior ao valor do atesto (R$ ${input.valorAtesto.toFixed(2)}).`,
          dataReferencia: formatDateISO(hoje)
        });
      }
    }
  }

  return alerts;
}

/**
 * Determina o estado global do workflow do ciclo a partir dos dados e evidências registradas
 */
export function determinePaymentCycleStatus(
  input: PaymentCycleInput,
  overrideStatus?: PaymentWorkflowStatus
): PaymentWorkflowStatus {
  if (overrideStatus) {
    return overrideStatus;
  }

  // 1. Conclusão por confirmação de OB oficial
  if (input.numeroOrdemBancaria && input.dataOrdemBancaria) {
    return 'PAGAMENTO_CONFIRMADO';
  }

  // 2. Remessa enviada à CGOFI
  if (input.dataEnvioCgofi) {
    return 'AGUARDANDO_CGOFI';
  }

  // 3. Despacho elaborado no SEI
  if (input.documentoDespachoSei) {
    return 'DESPACHO_ELABORADO';
  }

  // 4. Servidor atribuído para confecção
  if (input.responsavelNome) {
    return 'EM_INSTRUCAO';
  }

  // 5. Estado inicial: Atesto assinado recebido
  return 'RECEBIDO';
}

/**
 * Constrói o objeto consolidado do Ciclo de Acompanhamento de Pagamento
 */
export function buildPaymentFollowUpCycle(
  input: PaymentCycleInput,
  options?: {
    overrideStatus?: PaymentWorkflowStatus;
    empenhoBalances?: Partial<FinancialBalances>;
    baseDate?: Date | string;
    concluidoPor?: string;
  }
): PaymentFollowUpCycle {
  const cycleKey = buildPaymentCycleKey(
    input.contractKey,
    input.competencia,
    input.documentoAtestoSei
  );

  const status = determinePaymentCycleStatus(input, options?.overrideStatus);
  const prazos = calculatePaymentCyclePrazos(input, options?.baseDate);
  const alerts = derivePaymentCycleAlerts(
    cycleKey,
    input.contractKey,
    status,
    input,
    prazos,
    options?.empenhoBalances,
    options?.baseDate
  );

  const nowIso = new Date().toISOString();
  const isConcluido = status === 'CONCLUIDO' || status === 'PAGAMENTO_CONFIRMADO';

  return {
    cycleKey,
    contractKey: input.contractKey,
    competencia: input.competencia,
    status,
    input,
    prazos,
    alerts,
    criadoEm: nowIso,
    atualizadoEm: nowIso,
    concluidoEm: isConcluido ? (input.dataOrdemBancaria || nowIso) : undefined,
    concluidoPor: isConcluido ? (options?.concluidoPor || input.responsavelNome) : undefined
  };
}
