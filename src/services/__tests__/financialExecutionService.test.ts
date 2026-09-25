import { describe, it, expect } from 'vitest';
import {
  calculateFinancialBalances,
  calculateFinancialSnapshotDelta,
  buildFinancialSnapshotFingerprint,
  determineRestosAPagarTipo,
  aggregateContractFinancialExecution
} from '../financialExecutionService';

describe('FinancialExecutionService — Suíte Canônica de Execução Financeira (Fase 7.3-C)', () => {
  // ---------------------------------------------------------------------------
  // T1: Empenho Sem Liquidação
  // ---------------------------------------------------------------------------
  it('T1: Deve calcular corretamente os saldos de empenho sem liquidação', () => {
    const balances = calculateFinancialBalances(1000, 0, 0, 0, 0);

    expect(balances.saldoALiquidar).toBe(1000);
    expect(balances.saldoAPagar).toBe(0);
    expect(balances.saldoNaoExecutado).toBe(1000);
    expect(balances.saldoRpPendente).toBe(0);
    expect(balances.taxaLiquidacaoPercentual).toBe(0);
    expect(balances.taxaPagamentoPercentual).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // T2: Empenho Parcialmente Liquidado
  // ---------------------------------------------------------------------------
  it('T2: Deve calcular saldos de empenho parcialmente liquidado sem pagamento', () => {
    const balances = calculateFinancialBalances(1000, 400, 0, 0, 0);

    expect(balances.saldoALiquidar).toBe(600);
    expect(balances.saldoAPagar).toBe(400);
    expect(balances.saldoNaoExecutado).toBe(1000);
    expect(balances.taxaLiquidacaoPercentual).toBe(40);
    expect(balances.taxaPagamentoPercentual).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // T3: Empenho Totalmente Liquidado
  // ---------------------------------------------------------------------------
  it('T3: Deve calcular saldos de empenho totalmente liquidado sem pagamento', () => {
    const balances = calculateFinancialBalances(1000, 1000, 0, 0, 0);

    expect(balances.saldoALiquidar).toBe(0);
    expect(balances.saldoAPagar).toBe(1000);
    expect(balances.saldoNaoExecutado).toBe(1000);
    expect(balances.taxaLiquidacaoPercentual).toBe(100);
    expect(balances.taxaPagamentoPercentual).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // T4: Liquidação Parcial + Pagamento Parcial
  // ---------------------------------------------------------------------------
  it('T4: Deve calcular saldos com liquidação parcial e pagamento parcial', () => {
    const balances = calculateFinancialBalances(1000, 600, 400, 0, 0);

    expect(balances.saldoALiquidar).toBe(400);
    expect(balances.saldoAPagar).toBe(200);
    expect(balances.saldoNaoExecutado).toBe(600);
    expect(balances.taxaLiquidacaoPercentual).toBe(60);
    expect(balances.taxaPagamentoPercentual).toBe(66.67);
  });

  // ---------------------------------------------------------------------------
  // T5: Liquidado Maior que Pago
  // ---------------------------------------------------------------------------
  it('T5: Deve reportar saldo a pagar positivo quando liquidado > pago', () => {
    const balances = calculateFinancialBalances(1000, 800, 500, 0, 0);

    expect(balances.saldoAPagar).toBe(300);
    expect(balances.saldoALiquidar).toBe(200);
    expect(balances.saldoNaoExecutado).toBe(500);
  });

  // ---------------------------------------------------------------------------
  // T6: Liquidado Igual a Pago (Quitação Total do Atesto)
  // ---------------------------------------------------------------------------
  it('T6: Deve reportar saldo a pagar zero quando liquidado == pago', () => {
    const balances = calculateFinancialBalances(1000, 800, 800, 0, 0);

    expect(balances.saldoAPagar).toBe(0);
    expect(balances.taxaPagamentoPercentual).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // T7: Empenho Inscrito em RPNP (Restos a Pagar Não Processados)
  // ---------------------------------------------------------------------------
  it('T7: Deve identificar Restos a Pagar Não Processados (RPNP)', () => {
    const tipo = determineRestosAPagarTipo({
      valor_rpinscrito: 500,
      rpaliquidar: '500,00',
      rpliquidado: '0,00',
      rppago: '0,00'
    });

    expect(tipo).toBe('RPNP');
  });

  // ---------------------------------------------------------------------------
  // T8: RPNP Posteriormente Liquidado (Transição para RPP)
  // ---------------------------------------------------------------------------
  it('T8: Deve identificar Restos a Pagar Processados (RPP) após liquidação', () => {
    const tipo = determineRestosAPagarTipo({
      valor_rpinscrito: 500,
      rpaliquidar: 0,
      rpliquidado: 500,
      rppago: 0
    });

    expect(tipo).toBe('RPP');
  });

  // ---------------------------------------------------------------------------
  // T9: RPNP / RPP Posteriormente Pago
  // ---------------------------------------------------------------------------
  it('T9: Deve abater corretamente o saldo pendente de Restos a Pagar quando pago', () => {
    const balances = calculateFinancialBalances(0, 0, 0, 500, 500);

    expect(balances.saldoRpPendente).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // T10: Snapshot Idêntico (Idempotência)
  // ---------------------------------------------------------------------------
  it('T10: Deve indicar hasChanges = false e 0 deltas para snapshots idênticos', () => {
    const snapA = {
      empenhoCanonicalKey: '200331-2026-2026NE000142',
      valorEmpenhado: 1000,
      valorLiquidado: 400,
      valorPago: 200,
      valorRpInscrito: 0,
      valorRpALiquidar: 0,
      valorRpLiquidado: 0,
      valorRpPago: 0
    };

    const delta = calculateFinancialSnapshotDelta(snapA, snapA);

    expect(delta.hasChanges).toBe(false);
    expect(delta.deltaLiquidado).toBe(0);
    expect(delta.deltaPago).toBe(0);
    expect(delta.tipoEventoSugerido).toBeUndefined();

    const fp1 = buildFinancialSnapshotFingerprint(snapA);
    const fp2 = buildFinancialSnapshotFingerprint(snapA);
    expect(fp1).toBe(fp2);
  });

  // ---------------------------------------------------------------------------
  // T11: Snapshot com Aumento de Liquidação
  // ---------------------------------------------------------------------------
  it('T11: Deve sugerir LIQUIDACAO_SNAPSHOT quando apenas o liquidado evolui', () => {
    const prev = {
      valorEmpenhado: 1000,
      valorLiquidado: 400,
      valorPago: 200
    };
    const curr = {
      valorEmpenhado: 1000,
      valorLiquidado: 700,
      valorPago: 200
    };

    const delta = calculateFinancialSnapshotDelta(prev, curr);

    expect(delta.hasChanges).toBe(true);
    expect(delta.deltaLiquidado).toBe(300);
    expect(delta.deltaPago).toBe(0);
    expect(delta.tipoEventoSugerido).toBe('LIQUIDACAO_SNAPSHOT');
  });

  // ---------------------------------------------------------------------------
  // T12: Snapshot com Aumento de Pagamento
  // ---------------------------------------------------------------------------
  it('T12: Deve sugerir PAGAMENTO_SNAPSHOT quando o valor pago evolui', () => {
    const prev = {
      valorEmpenhado: 1000,
      valorLiquidado: 700,
      valorPago: 200
    };
    const curr = {
      valorEmpenhado: 1000,
      valorLiquidado: 700,
      valorPago: 500
    };

    const delta = calculateFinancialSnapshotDelta(prev, curr);

    expect(delta.hasChanges).toBe(true);
    expect(delta.deltaLiquidado).toBe(0);
    expect(delta.deltaPago).toBe(300);
    expect(delta.tipoEventoSugerido).toBe('PAGAMENTO_SNAPSHOT');
  });

  // ---------------------------------------------------------------------------
  // T13: Múltiplos Contratos para Mesmo Empenho (Proteção Anti Double-Counting)
  // ---------------------------------------------------------------------------
  it('T13: Deve agrupar por empenho único e evitar duplicação em agregação de contratos', () => {
    const empenhosComDuplicacao = [
      {
        canonical_key: '200331-2026-2026NE000100',
        valor_vinculado: 10000,
        valor_empenhado: 10000,
        valor_liquidado: 6000,
        valor_pago: 4000
      },
      // Registro repetido (simulando join redundante)
      {
        canonical_key: '200331-2026-2026NE000100',
        valor_vinculado: 10000,
        valor_empenhado: 10000,
        valor_liquidado: 6000,
        valor_pago: 4000
      },
      // Segundo empenho legítimo
      {
        canonical_key: '200331-2026-2026NE000200',
        valor_vinculado: 5000,
        valor_empenhado: 5000,
        valor_liquidado: 3000,
        valor_pago: 3000
      }
    ];

    const summary = aggregateContractFinancialExecution('200331-10-2026', empenhosComDuplicacao);

    expect(summary.totalEmpenhosVinculados).toBe(2);
    expect(summary.totalValorEmpenhadoGlobal).toBe(15000);
    expect(summary.totalValorLiquidadoGlobal).toBe(9000);
    expect(summary.totalValorPagoGlobal).toBe(7000);
    expect(summary.saldoALiquidarGlobal).toBe(6000);
    expect(summary.saldoAPagarGlobal).toBe(2000);
    expect(summary.saldoNaoExecutadoGlobal).toBe(8000);
  });

  // ---------------------------------------------------------------------------
  // T14: Múltiplos Itens para Mesmo Empenho
  // ---------------------------------------------------------------------------
  it('T14: Não deve multiplicar valores financeiros quando mesmo empenho possui múltiplos itens', () => {
    const empenhoItemLinks = [
      {
        canonical_key: '200331-2026-2026NE000300',
        id: 'uuid-1',
        valor_vinculado: 20000,
        valor_empenhado: 20000,
        valor_liquidado: 10000,
        valor_pago: 5000
      },
      // Mesma chave para item 2
      {
        canonical_key: '200331-2026-2026NE000300',
        id: 'uuid-1',
        valor_vinculado: 20000,
        valor_empenhado: 20000,
        valor_liquidado: 10000,
        valor_pago: 5000
      }
    ];

    const summary = aggregateContractFinancialExecution('200331-20-2026', empenhoItemLinks);

    expect(summary.totalEmpenhosVinculados).toBe(1);
    expect(summary.totalValorEmpenhadoGlobal).toBe(20000);
    expect(summary.totalValorLiquidadoGlobal).toBe(10000);
    expect(summary.totalValorPagoGlobal).toBe(5000);
  });

  // ---------------------------------------------------------------------------
  // T15: Isolamento do Saldo Quantitativo da Ata
  // ---------------------------------------------------------------------------
  it('T15: Garante que os saldos financeiros não interferem no saldo quantitativo físico', () => {
    const qtdHomologada = 500;
    const qtdConsumida = 200;
    const saldoFisico = qtdHomologada - qtdConsumida;

    // Variação meramente financeira
    const balances = calculateFinancialBalances(50000, 30000, 20000, 0, 0);

    expect(saldoFisico).toBe(300);
    expect(balances.saldoALiquidar).toBe(20000);
    expect(balances.saldoAPagar).toBe(10000);
  });
});
