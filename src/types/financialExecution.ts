/**
 * Tipos Canônicos para Execução Financeira, Liquidações, Pagamentos e Restos a Pagar (SaldoARP 3.0)
 * Conforme especificado na FASE 7.3-B e implementado na FASE 7.3-C.
 */

export type RestosAPagarTipo = 'RPNP' | 'RPP';

/**
 * Snapshot do estado financeiro oficialmente observado de uma Nota de Empenho
 */
export interface FinancialExecutionSnapshot {
  empenhoCanonicalKey: string;
  valorEmpenhado: number;
  valorLiquidado: number;
  valorPago: number;
  valorRpInscrito: number;
  valorRpALiquidar: number;
  valorRpLiquidado: number;
  valorRpPago: number;
  observedAt: string;
  sourceSystem: string;
  sourceRecordId?: string;
  fingerprint?: string;
}

/**
 * Saldos canônicos matematicamente derivados da execução orçamentária
 */
export interface FinancialBalances {
  saldoALiquidar: number;
  saldoAPagar: number;
  saldoNaoExecutado: number;
  saldoRpPendente: number;
  taxaLiquidacaoPercentual: number;
  taxaPagamentoPercentual: number;
}

/**
 * Variação observada (delta) entre dois snapshots financeiros sucessivos
 * Invariante: O delta representa evolução observada e NÃO uma Ordem Bancária individual isolada.
 */
export interface FinancialSnapshotDelta {
  deltaEmpenhado: number;
  deltaLiquidado: number;
  deltaPago: number;
  deltaRpInscrito: number;
  deltaRpALiquidar: number;
  deltaRpLiquidado: number;
  deltaRpPago: number;
  hasChanges: boolean;
  tipoEventoSugerido?: 'LIQUIDACAO_SNAPSHOT' | 'PAGAMENTO_SNAPSHOT' | 'REFORCO' | 'ANULACAO_PARCIAL' | 'AJUSTE_AUDITORIA';
}

/**
 * Read Model consolidado de execução financeira de um contrato oficial
 */
export interface ContractFinancialExecutionSummary {
  contractKey: string;
  totalEmpenhosVinculados: number;
  totalValorVinculadoContrato: number;
  totalValorEmpenhadoGlobal: number;
  totalValorLiquidadoGlobal: number;
  totalValorPagoGlobal: number;
  totalValorRpInscritoGlobal: number;
  totalValorRpALiquidarGlobal: number;
  totalValorRpLiquidadoGlobal: number;
  totalValorRpPagoGlobal: number;
  saldoALiquidarGlobal: number;
  saldoAPagarGlobal: number;
  saldoNaoExecutadoGlobal: number;
  saldoRpPendenteGlobal: number;
  percentualLiquidado: number;
  percentualPago: number;
  ultimoSnapshotObservadoEm?: string;
}
