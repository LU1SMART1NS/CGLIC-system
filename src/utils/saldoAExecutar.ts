/** Saldo a executar da nota: pelo Tesouro (a liquidar + liquidado a pagar); sem ele, empenhado menos pago. */
export const saldoAExecutar = (e: { saldo_tesouro?: number; valor_empenhado: number; valor_pago: number }) =>
  e.saldo_tesouro ?? Math.max(0, e.valor_empenhado - e.valor_pago);
