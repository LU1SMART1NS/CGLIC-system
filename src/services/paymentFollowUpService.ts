/**
 * Serviço de Domínio para Acompanhamento de Pagamentos e Faturamento (CGLIC 3.0 - Fase 7.4-C)
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
  differenceInBusinessDays,
  addBusinessDays
} from './temporalEngineService';
import type {
  PaymentCycleDocument,
  PaymentCycleEvent,
  PaymentCycleEventTipo,
  PaymentCycleInput,
  PaymentCycleItem,
  PaymentCyclePrazos,
  PaymentEtapaPrazo,
  PaymentFollowUpCycle,
  PaymentWorkflowStatus,
  PaymentAlert
} from '../types/paymentFollowUp';
import type { FinancialBalances } from '../types/financialExecution';
import type {
  RpcContractPaymentCycleRow,
  RpcPaymentCycleChecklistRow,
  RpcPaymentCycleDocumentRow,
  RpcPaymentCycleEventRow,
  RpcPaymentCycleFaturaRow,
  RpcPaymentCycleItemRow
} from '../types/rpc';
import { PAGAMENTO_RULES } from '../config/alertRules';

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

const ETAPAS_ENCERRADAS: PaymentWorkflowStatus[] = ['PAGO', 'CANCELADO'];

export function isPaymentCycleEncerrado(status: PaymentWorkflowStatus): boolean {
  return ETAPAS_ENCERRADAS.includes(status);
}

function startOfToday(baseDate?: Date | string): Date {
  const hoje = baseDate
    ? (typeof baseDate === 'string' ? parseDateBRT(baseDate) || new Date() : new Date(baseDate))
    : new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}

/**
 * Calcula os prazos e indicadores dinâmicos do ciclo em dias úteis utilizando o temporalEngineService
 */
export function calculatePaymentCyclePrazos(
  input: PaymentCycleInput,
  baseDate?: Date | string
): PaymentCyclePrazos {
  const hoje = startOfToday(baseDate);

  const dataInicio = parseDateBRT(input.dataRecebimento) || parseDateBRT(input.dataAssinaturaAtesto) || hoje;
  const dataVencimento = parseDateBRT(input.dataVencimentoFatura) || hoje;
  const dataEnvio = input.dataEnvioCgofi ? parseDateBRT(input.dataEnvioCgofi) : null;
  const dataOb = input.dataOrdemBancaria ? parseDateBRT(input.dataOrdemBancaria) : null;

  // 1. Dias úteis até o vencimento (dataVencimento - hoje)
  const isVencida = dataVencimento.getTime() < hoje.getTime();
  const diasUteisAteVencimento = differenceInBusinessDays(dataVencimento, hoje);

  // 2. Janela total de trabalho (dataVencimento - recebimento)
  const janelaTotalDiasUteis = Math.max(0, differenceInBusinessDays(dataVencimento, dataInicio));

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
  } else if (diasUteisAteVencimento <= PAGAMENTO_RULES.criticoAteDiasUteis) {
    statusPrazo = 'CRITICO';
  } else if (diasUteisAteVencimento <= PAGAMENTO_RULES.atencaoAteDiasUteis) {
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
 * Prazo da etapa em curso e quem responde por ele. Conferir e enviar são da CGLIC; depois do envio a CGOFI
 * é quem paga e a CGLIC só cobra: o alvo é a data de cobrança (ou, se não foi definida, o padrão a partir do envio).
 */
export function calculateEtapaPrazo(
  status: PaymentWorkflowStatus,
  input: PaymentCycleInput,
  baseDate?: Date | string
): PaymentEtapaPrazo | undefined {
  const hoje = startOfToday(baseDate);
  let etapa: PaymentEtapaPrazo['etapa'];
  let dono: PaymentEtapaPrazo['dono'];
  let alvo: string | undefined;

  if (status === 'RECEBIDO' || status === 'COM_PENDENCIA' || status === 'DEVOLVIDO') {
    etapa = 'CONFERENCIA';
    dono = 'CGLIC';
    alvo = input.prazoConferenciaAte;
  } else if (status === 'CONFERIDO') {
    etapa = 'ENVIO';
    dono = 'CGLIC';
    alvo = input.prazoEnvioAte;
  } else if (status === 'ENVIADO_CGOFI') {
    etapa = 'COBRANCA_CGOFI';
    dono = 'CGOFI';
    alvo = input.cobrarCgofiAte;
    if (!alvo && input.dataEnvioCgofi) {
      const envio = parseDateBRT(input.dataEnvioCgofi);
      if (envio) alvo = formatDateISO(addBusinessDays(envio, PAGAMENTO_RULES.cgofiSemRespostaAcimaDeDiasUteis));
    }
  } else {
    return undefined;
  }
  if (!alvo) return undefined;

  const dataAlvo = parseDateBRT(alvo);
  if (!dataAlvo) return undefined;
  const atrasado = dataAlvo.getTime() < hoje.getTime();
  const diasUteis = differenceInBusinessDays(dataAlvo, hoje);
  return { etapa, dono, dataAlvo: alvo, diasUteisRestantes: atrasado ? -Math.abs(diasUteis) : diasUteis, atrasado };
}

/**
 * Prazo padrão de uma etapa a partir de uma data (usado para sugerir a data-alvo nos formulários).
 */
export function suggestPrazoPadrao(etapa: 'CONFERENCIA' | 'ENVIO', aPartirDe: string | Date): string {
  const base = typeof aPartirDe === 'string' ? parseDateBRT(aPartirDe) || new Date() : aPartirDe;
  const dias = etapa === 'CONFERENCIA' ? PAGAMENTO_RULES.conferirPadraoDiasUteis : PAGAMENTO_RULES.enviarPadraoDiasUteis;
  return formatDateISO(addBusinessDays(base, dias));
}

const ETAPA_LABEL: Record<PaymentEtapaPrazo['etapa'], string> = {
  CONFERENCIA: 'Conferência',
  ENVIO: 'Envio à CGOFI',
  COBRANCA_CGOFI: 'Cobrança da CGOFI'
};

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
  baseDate?: Date | string,
  etapaAtual?: PaymentEtapaPrazo
): PaymentAlert[] {
  const alerts: PaymentAlert[] = [];
  const hoje = startOfToday(baseDate);

  if (!isPaymentCycleEncerrado(status)) {
    // 1. Fatura com vencimento próximo ou ultrapassado, ainda na CGLIC (depois do envio o processo é da CGOFI)
    if (status !== 'ENVIADO_CGOFI') {
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
      } else if (prazos.diasUteisAteVencimento <= PAGAMENTO_RULES.criticoAteDiasUteis) {
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

    // 2. Etapa da CGLIC (conferir ou enviar) com a data-alvo vencida
    if (etapaAtual && etapaAtual.dono === 'CGLIC' && etapaAtual.atrasado) {
      const dias = Math.abs(etapaAtual.diasUteisRestantes);
      alerts.push({
        id: `${cycleKey}-ALERT-ETAPA-${etapaAtual.etapa}`,
        cycleKey,
        contractKey,
        nivel: 'ATENCAO',
        tipo: 'PRAZO_ETAPA_VENCIDO',
        mensagem: `${ETAPA_LABEL[etapaAtual.etapa]} atrasada há ${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'} (prazo ${formatDateISO(parseDateBRT(etapaAtual.dataAlvo) || hoje).split('-').reverse().join('/')}).`,
        diasRelevantes: dias,
        dataReferencia: etapaAtual.dataAlvo
      });
    }

    // 3. Processo na CGOFI além da data de cobrança, sem Ordem Bancária: a CGLIC cobra, não está em atraso
    if (status === 'ENVIADO_CGOFI' && !input.numeroOrdemBancaria) {
      const passouCobranca = etapaAtual ? etapaAtual.atrasado : prazos.diasSemRespostaCgofi > PAGAMENTO_RULES.cgofiSemRespostaAcimaDeDiasUteis;
      if (passouCobranca) {
        alerts.push({
          id: `${cycleKey}-ALERT-CGOFI-SEM-RESPOSTA`,
          cycleKey,
          contractKey,
          nivel: 'ATENCAO',
          tipo: 'CGOFI_SEM_RESPOSTA',
          mensagem: `Cobrar a CGOFI: processo enviado há ${prazos.diasSemRespostaCgofi} dias úteis sem confirmação de Ordem Bancária.`,
          diasRelevantes: prazos.diasSemRespostaCgofi,
          dataReferencia: input.dataEnvioCgofi
        });
      }
    }

    // 4. Saldo de empenho insuficiente para o atesto
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
 * Situação do ciclo a partir dos marcos registrados. Quando o servidor já informa a situação
 * (linha persistida), ela prevalece: pendência, devolução e cancelamento não se deduzem só das datas.
 */
export function determinePaymentCycleStatus(
  input: PaymentCycleInput,
  overrideStatus?: PaymentWorkflowStatus
): PaymentWorkflowStatus {
  if (overrideStatus) {
    return overrideStatus;
  }
  if (input.numeroOrdemBancaria && input.dataOrdemBancaria) return 'PAGO';
  if (input.dataEnvioCgofi) return 'ENVIADO_CGOFI';
  if (input.dataConferencia) return 'CONFERIDO';
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
    documentos?: PaymentCycleDocument[];
    eventos?: PaymentCycleEvent[];
  }
): PaymentFollowUpCycle {
  const cycleKey = buildPaymentCycleKey(
    input.contractKey,
    input.competencia,
    input.documentoAtestoSei
  );

  const status = determinePaymentCycleStatus(input, options?.overrideStatus);
  const prazos = calculatePaymentCyclePrazos(input, options?.baseDate);
  const etapaAtual = calculateEtapaPrazo(status, input, options?.baseDate);
  const alerts = derivePaymentCycleAlerts(
    cycleKey,
    input.contractKey,
    status,
    input,
    prazos,
    options?.empenhoBalances,
    options?.baseDate,
    etapaAtual
  );

  const nowIso = new Date().toISOString();
  const isConcluido = status === 'PAGO';

  return {
    cycleKey,
    contractKey: input.contractKey,
    competencia: input.competencia,
    status,
    input,
    prazos,
    etapaAtual,
    documentos: options?.documentos ?? [],
    eventos: options?.eventos ?? [],
    alerts,
    criadoEm: nowIso,
    atualizadoEm: nowIso,
    concluidoEm: isConcluido ? (input.dataOrdemBancaria || nowIso) : undefined,
    concluidoPor: isConcluido ? (options?.concluidoPor || input.responsavelNome) : undefined
  };
}

export function rowToPaymentDocument(row: RpcPaymentCycleDocumentRow): PaymentCycleDocument {
  return {
    id: row.id,
    tipo: row.tipo,
    numero: row.numero ?? undefined,
    sei: row.sei,
    valor: row.valor == null ? undefined : Number(row.valor),
    dataRecebimento: row.data_recebimento ?? undefined
  };
}

export function rowToPaymentEvent(row: RpcPaymentCycleEventRow): PaymentCycleEvent {
  return {
    id: row.id,
    tipo: row.tipo as PaymentCycleEventTipo,
    dataEvento: row.data_evento,
    sei: row.sei ?? undefined,
    numeroOb: row.numero_ob ?? undefined,
    motivo: row.motivo ?? undefined,
    origemPendencia: row.origem_pendencia ?? undefined,
    prazoAnterior: row.prazo_anterior ?? undefined,
    prazoNovo: row.prazo_novo ?? undefined,
    justificativa: row.justificativa ?? undefined,
    regularidadeVerificada: row.regularidade_verificada ?? undefined,
    registradoPorNome: row.registrado_por_nome ?? undefined,
    automatico: row.automatico ?? undefined,
    criadoEm: row.created_at
  };
}

export function rowToPaymentItem(row: RpcPaymentCycleItemRow): PaymentCycleItem {
  return {
    id: row.id,
    notaFiscal: row.nota_fiscal,
    notaFiscalSei: row.nota_fiscal_sei ?? undefined,
    atestoSei: row.atesto_sei,
    empenhoCanonicalKey: row.empenho_canonical_key,
    subelemento: row.subelemento ?? undefined,
    valorBruto: Number(row.valor_bruto) || 0,
    jurosMulta: Number(row.juros_multa) || 0,
    glosa: Number(row.glosa) || 0,
    desconto: Number(row.desconto) || 0,
    valorAPagar: Number(row.valor_a_pagar) || 0,
    justificativaJuros: row.justificativa_juros ?? undefined
  };
}

/**
 * Reconstrói um PaymentFollowUpCycle completo (prazos/alertas recalculados em
 * memória) a partir de uma linha persistida em contract_payment_cycles. Fonte única desta conversão —
 * reutilizada pela visão por contrato (useContractPaymentFollowUp) e pela visão consolidada do
 * Dashboard Gerencial (dashboardService.fetchAllPaymentCyclesForDashboard).
 */
export function rowToPaymentFollowUpCycle(
  row: RpcContractPaymentCycleRow,
  options?: {
    baseDate?: string;
    empenhoBalances?: Partial<FinancialBalances>;
    documentos?: RpcPaymentCycleDocumentRow[];
    eventos?: RpcPaymentCycleEventRow[];
    itens?: RpcPaymentCycleItemRow[];
    checklist?: RpcPaymentCycleChecklistRow[];
    faturas?: RpcPaymentCycleFaturaRow[];
  }
): PaymentFollowUpCycle {
  const input: PaymentCycleInput = {
    contractKey: row.contract_key,
    competencia: row.competencia,
    dataRecebimento: row.data_recebimento,
    dataAssinaturaAtesto: row.data_assinatura_atesto,
    dataVencimentoFatura: row.data_vencimento_fatura,
    documentoAtestoSei: row.documento_atesto_sei,
    numeroProcessoPagamentoSei: row.numero_processo_pagamento_sei ?? undefined,
    numeroProcessoContratoSei: row.numero_processo_contrato_sei ?? undefined,
    numeroNotasFiscais: row.numero_notas_fiscais ?? undefined,
    valorAtesto: Number(row.valor_atesto) || 0,
    empenhoCanonicalKey: row.empenho_canonical_key ?? undefined,
    titularNome: row.titular_nome ?? undefined,
    responsavelNome: row.responsavel_nome ?? undefined,
    responsavelUserId: row.responsavel_user_id ?? undefined,
    dataConferencia: row.data_conferencia ?? undefined,
    prazoConferenciaAte: row.prazo_conferencia_ate ?? undefined,
    prazoEnvioAte: row.prazo_envio_ate ?? undefined,
    cobrarCgofiAte: row.cobrar_cgofi_ate ?? undefined,
    documentoDespachoSei: row.documento_despacho_sei ?? undefined,
    dataEnvioCgofi: row.data_envio_cgofi ?? undefined,
    numeroOrdemBancaria: row.numero_ordem_bancaria ?? undefined,
    dataOrdemBancaria: row.data_ordem_bancaria ?? undefined,
    observacoes: row.observacoes ?? undefined,
    dataLiquidacao: row.data_liquidacao ?? undefined,
    numeroNp: row.numero_np ?? undefined,
    cologEnviadoEm: row.colog_enviado_em ?? undefined,
    cologSei: row.colog_sei ?? undefined,
    liquidacaoProrrogada: Boolean(row.liquidacao_prorrogada)
  };

  const cycle = buildPaymentFollowUpCycle(input, {
    overrideStatus: row.status as PaymentWorkflowStatus,
    empenhoBalances: options?.empenhoBalances,
    baseDate: options?.baseDate,
    concluidoPor: row.concluido_por ?? undefined,
    documentos: (options?.documentos ?? []).map(rowToPaymentDocument),
    eventos: (options?.eventos ?? [])
      .map(rowToPaymentEvent)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
  });

  cycle.itens = [...(options?.itens ?? [])].sort((a, b) => a.ordem - b.ordem).map(rowToPaymentItem);
  cycle.checklist = (options?.checklist ?? []).map((c) => ({
    item: c.item,
    resposta: c.resposta,
    sei: c.sei ?? undefined,
    conferidoEm: c.conferido_em,
    conferidoPorNome: c.conferido_por_nome ?? undefined
  }));
  cycle.faturas = (options?.faturas ?? []).map((f) => ({ idFatura: Number(f.id_fatura), vinculadoPor: f.vinculado_por }));
  cycle.id = row.id;
  cycle.criadoEm = row.criado_em;
  cycle.atualizadoEm = row.atualizado_em;
  cycle.concluidoEm = row.concluido_em ?? undefined;
  cycle.concluidoPor = row.concluido_por ?? undefined;
  return cycle;
}
