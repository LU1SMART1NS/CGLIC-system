/**
 * Serviço de Domínio para Execução Financeira (SaldoARP 3.0 - Fase 7.3-C)
 * 
 * Responsabilidades:
 * 1. Cálculo puro dos saldos financeiros canônicos (saldo a liquidar, saldo a pagar, saldo não executado, saldo RP).
 * 2. Cálculo determinístico de deltas entre snapshots financeiros oficiais observados.
 * 3. Geração de fingerprints de idempotência para snapshots financeiros.
 * 4. Agregação financeira consolidada por contrato com proteção contra double counting.
 * 
 * Invariantes Invioláveis:
 * - Não cria entidades artificiais de liquidação ou pagamento.
 * - Valores de débito físico em public.arp_item_empenhos e itens de ata permanecem 100% isolados.
 * - Toda agregação pré-agrupa por empenho antes de relacionar a contratos.
 */

import type {
  FinancialExecutionSnapshot,
  FinancialBalances,
  FinancialSnapshotDelta,
  RestosAPagarTipo,
  ContractFinancialExecutionSummary
} from '../types/financialExecution';

/**
 * Calcula os saldos financeiros canônicos de uma Nota de Empenho
 * 
 * Fórmulas:
 * - Saldo a Liquidar = max(0, valorEmpenhado - valorLiquidado)
 * - Saldo a Pagar = max(0, valorLiquidado - valorPago)
 * - Saldo Não Executado = max(0, valorEmpenhado - valorPago)
 * - Saldo RP Pendente = max(0, valorRpInscrito - valorRpPago)
 */
export function calculateFinancialBalances(
  valorEmpenhado: number = 0,
  valorLiquidado: number = 0,
  valorPago: number = 0,
  valorRpInscrito: number = 0,
  valorRpPago: number = 0
): FinancialBalances {
  const emp = Math.max(0, Number(valorEmpenhado) || 0);
  const liq = Math.max(0, Number(valorLiquidado) || 0);
  const pag = Math.max(0, Number(valorPago) || 0);
  const rpIns = Math.max(0, Number(valorRpInscrito) || 0);
  const rpPag = Math.max(0, Number(valorRpPago) || 0);

  const saldoALiquidar = Math.max(0, emp - liq);
  const saldoAPagar = Math.max(0, liq - pag);
  const saldoNaoExecutado = Math.max(0, emp - pag);
  const saldoRpPendente = Math.max(0, rpIns - rpPag);

  const taxaLiquidacaoPercentual = emp > 0 ? Number(((liq / emp) * 100).toFixed(2)) : 0;
  const taxaPagamentoPercentual = liq > 0 ? Number(((pag / liq) * 100).toFixed(2)) : 0;

  return {
    saldoALiquidar,
    saldoAPagar,
    saldoNaoExecutado,
    saldoRpPendente,
    taxaLiquidacaoPercentual,
    taxaPagamentoPercentual
  };
}

/**
 * Calcula a variação financeira (delta) entre dois snapshots observados
 * 
 * Invariante: O delta representa evolução observada entre coletas e NÃO uma Ordem Bancária individual.
 */
export function calculateFinancialSnapshotDelta(
  previous?: Partial<FinancialExecutionSnapshot> | null,
  current?: Partial<FinancialExecutionSnapshot> | null
): FinancialSnapshotDelta {
  const prevEmp = Number(previous?.valorEmpenhado ?? 0);
  const prevLiq = Number(previous?.valorLiquidado ?? 0);
  const prevPag = Number(previous?.valorPago ?? 0);
  const prevRpIns = Number(previous?.valorRpInscrito ?? 0);
  const prevRpALiq = Number(previous?.valorRpALiquidar ?? 0);
  const prevRpLiq = Number(previous?.valorRpLiquidado ?? 0);
  const prevRpPag = Number(previous?.valorRpPago ?? 0);

  const currEmp = Number(current?.valorEmpenhado ?? 0);
  const currLiq = Number(current?.valorLiquidado ?? 0);
  const currPag = Number(current?.valorPago ?? 0);
  const currRpIns = Number(current?.valorRpInscrito ?? 0);
  const currRpALiq = Number(current?.valorRpALiquidar ?? 0);
  const currRpLiq = Number(current?.valorRpLiquidado ?? 0);
  const currRpPag = Number(current?.valorRpPago ?? 0);

  const deltaEmpenhado = Number((currEmp - prevEmp).toFixed(4));
  const deltaLiquidado = Number((currLiq - prevLiq).toFixed(4));
  const deltaPago = Number((currPag - prevPag).toFixed(4));
  const deltaRpInscrito = Number((currRpIns - prevRpIns).toFixed(4));
  const deltaRpALiquidar = Number((currRpALiq - prevRpALiq).toFixed(4));
  const deltaRpLiquidado = Number((currRpLiq - prevRpLiq).toFixed(4));
  const deltaRpPago = Number((currRpPag - prevRpPag).toFixed(4));

  const hasChanges = (
    deltaEmpenhado !== 0 ||
    deltaLiquidado !== 0 ||
    deltaPago !== 0 ||
    deltaRpInscrito !== 0 ||
    deltaRpALiquidar !== 0 ||
    deltaRpLiquidado !== 0 ||
    deltaRpPago !== 0
  );

  let tipoEventoSugerido: FinancialSnapshotDelta['tipoEventoSugerido'] = undefined;
  if (hasChanges) {
    if (deltaPago !== 0) {
      tipoEventoSugerido = 'PAGAMENTO_SNAPSHOT';
    } else if (deltaLiquidado !== 0) {
      tipoEventoSugerido = 'LIQUIDACAO_SNAPSHOT';
    } else if (deltaEmpenhado > 0) {
      tipoEventoSugerido = 'REFORCO';
    } else if (deltaEmpenhado < 0) {
      tipoEventoSugerido = 'ANULACAO_PARCIAL';
    } else {
      tipoEventoSugerido = 'AJUSTE_AUDITORIA';
    }
  }

  return {
    deltaEmpenhado,
    deltaLiquidado,
    deltaPago,
    deltaRpInscrito,
    deltaRpALiquidar,
    deltaRpLiquidado,
    deltaRpPago,
    hasChanges,
    tipoEventoSugerido
  };
}

/**
 * Gera um fingerprint determinístico para verificação de idempotência de um snapshot financeiro
 */
export function buildFinancialSnapshotFingerprint(
  snapshot: Partial<FinancialExecutionSnapshot>
): string {
  const key = snapshot.empenhoCanonicalKey || 'UNKNOWN';
  const emp = (Number(snapshot.valorEmpenhado) || 0).toFixed(4);
  const liq = (Number(snapshot.valorLiquidado) || 0).toFixed(4);
  const pag = (Number(snapshot.valorPago) || 0).toFixed(4);
  const rpIns = (Number(snapshot.valorRpInscrito) || 0).toFixed(4);
  const rpALiq = (Number(snapshot.valorRpALiquidar) || 0).toFixed(4);
  const rpLiq = (Number(snapshot.valorRpLiquidado) || 0).toFixed(4);
  const rpPag = (Number(snapshot.valorRpPago) || 0).toFixed(4);

  return `${key}|EMP:${emp}|LIQ:${liq}|PAG:${pag}|RP_INS:${rpIns}|RP_ALIQ:${rpALiq}|RP_LIQ:${rpLiq}|RP_PAG:${rpPag}`;
}

/**
 * Determina o tipo contábil de Restos a Pagar baseado nos atributos observados
 */
export function determineRestosAPagarTipo(
  record: {
    valor_rpinscrito?: number;
    rpaliquidar?: string | number;
    rpliquidado?: string | number;
    rppago?: string | number;
  }
): RestosAPagarTipo | null {
  const rpInscrito = Number(record.valor_rpinscrito || 0);
  const rpALiquidar = typeof record.rpaliquidar === 'number' 
    ? record.rpaliquidar 
    : parseFloat(String(record.rpaliquidar || '0').replace(/\./g, '').replace(',', '.'));
  const rpLiquidado = typeof record.rpliquidado === 'number' 
    ? record.rpliquidado 
    : parseFloat(String(record.rpliquidado || '0').replace(/\./g, '').replace(',', '.'));

  if (rpInscrito <= 0 && rpALiquidar <= 0 && rpLiquidado <= 0) {
    return null;
  }

  if (rpALiquidar > 0) {
    return 'RPNP'; // Não Processado (a liquidar)
  }

  return 'RPP'; // Processado (já liquidado)
}

/**
 * Agrega a execução financeira de múltiplos empenhos de um contrato oficial com proteção estrita contra double counting.
 * Mesmo que a lista de entrada contenha empenhos duplicados ou vínculos repetidos, agrupa unicamente por chave canônica.
 */
export function aggregateContractFinancialExecution(
  contractKey: string,
  empenhosList: Array<{
    canonical_key?: string;
    id?: string | number;
    numero?: string;
    valor_vinculado?: number;
    valor_empenhado?: number;
    valor_liquidado?: number;
    valor_pago?: number;
    valor_rpinscrito?: number;
    valor_rp_a_liquidar?: number;
    valor_rp_liquidado?: number;
    valor_rp_pago?: number;
    last_synced_at?: string;
  }>
): ContractFinancialExecutionSummary {
  // Mapa de unicidade por chave canônica / id
  const uniqueMap = new Map<string, {
    valor_vinculado: number;
    valor_empenhado: number;
    valor_liquidado: number;
    valor_pago: number;
    valor_rpinscrito: number;
    valor_rp_a_liquidar: number;
    valor_rp_liquidado: number;
    valor_rp_pago: number;
    last_synced_at?: string;
  }>();

  for (const emp of empenhosList) {
    const key = emp.canonical_key || String(emp.id || emp.numero || '');
    if (!key) continue;

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        valor_vinculado: Number(emp.valor_vinculado ?? emp.valor_empenhado ?? 0),
        valor_empenhado: Number(emp.valor_empenhado ?? 0),
        valor_liquidado: Number(emp.valor_liquidado ?? 0),
        valor_pago: Number(emp.valor_pago ?? 0),
        valor_rpinscrito: Number(emp.valor_rpinscrito ?? 0),
        valor_rp_a_liquidar: Number(emp.valor_rp_a_liquidar ?? 0),
        valor_rp_liquidado: Number(emp.valor_rp_liquidado ?? 0),
        valor_rp_pago: Number(emp.valor_rp_pago ?? 0),
        last_synced_at: emp.last_synced_at
      });
    }
  }

  let totalValorVinculado = 0;
  let totalValorEmpenhado = 0;
  let totalValorLiquidado = 0;
  let totalValorPago = 0;
  let totalValorRpInscrito = 0;
  let totalValorRpALiquidar = 0;
  let totalValorRpLiquidado = 0;
  let totalValorRpPago = 0;
  let ultimoSnapshot: string | undefined = undefined;

  for (const item of uniqueMap.values()) {
    totalValorVinculado += item.valor_vinculado;
    totalValorEmpenhado += item.valor_empenhado;
    totalValorLiquidado += item.valor_liquidado;
    totalValorPago += item.valor_pago;
    totalValorRpInscrito += item.valor_rpinscrito;
    totalValorRpALiquidar += item.valor_rp_a_liquidar;
    totalValorRpLiquidado += item.valor_rp_liquidado;
    totalValorRpPago += item.valor_rp_pago;

    if (item.last_synced_at) {
      if (!ultimoSnapshot || item.last_synced_at > ultimoSnapshot) {
        ultimoSnapshot = item.last_synced_at;
      }
    }
  }

  const balances = calculateFinancialBalances(
    totalValorEmpenhado,
    totalValorLiquidado,
    totalValorPago,
    totalValorRpInscrito,
    totalValorRpPago
  );

  return {
    contractKey,
    totalEmpenhosVinculados: uniqueMap.size,
    totalValorVinculadoContrato: Number(totalValorVinculado.toFixed(4)),
    totalValorEmpenhadoGlobal: Number(totalValorEmpenhado.toFixed(4)),
    totalValorLiquidadoGlobal: Number(totalValorLiquidado.toFixed(4)),
    totalValorPagoGlobal: Number(totalValorPago.toFixed(4)),
    totalValorRpInscritoGlobal: Number(totalValorRpInscrito.toFixed(4)),
    totalValorRpALiquidarGlobal: Number(totalValorRpALiquidar.toFixed(4)),
    totalValorRpLiquidadoGlobal: Number(totalValorRpLiquidado.toFixed(4)),
    totalValorRpPagoGlobal: Number(totalValorRpPago.toFixed(4)),
    saldoALiquidarGlobal: balances.saldoALiquidar,
    saldoAPagarGlobal: balances.saldoAPagar,
    saldoNaoExecutadoGlobal: balances.saldoNaoExecutado,
    saldoRpPendenteGlobal: balances.saldoRpPendente,
    percentualLiquidado: balances.taxaLiquidacaoPercentual,
    percentualPago: balances.taxaPagamentoPercentual,
    ultimoSnapshotObservadoEm: ultimoSnapshot
  };
}
