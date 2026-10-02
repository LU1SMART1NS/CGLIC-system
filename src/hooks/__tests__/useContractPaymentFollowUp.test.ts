/**
 * Testes Unitários para a Lógica e Ciclo de Vida do Acompanhamento de Pagamentos (CGLIC 3.0 - Fase 7.4-D)
 * 
 * Cobre:
 * - STATUS-01: Situação do ciclo deduzida dos marcos; o acompanhamento não depende de checklist de tarefas.
 * - KEY-01: Idempotência da chave do ciclo (zero duplicações).
 * - ALERT-01: Alerta de fatura vencida sem envio / pendência.
 * - ALERT-02: Alerta de CGOFI sem resposta (> 5 dias úteis).
 * - ALERT-03: Alerta de vencimento iminente ou vencido.
 * - ALERT-04: Deduplicação e consolidação de alertas por contrato.
 * - FIN-01: Informação financeira mantida como somente leitura.
 * - FIN-02: Valor do atesto isolado das grandezas contábeis de empenho.
 */

import { describe, it, expect } from 'vitest';
import type { PaymentCycleInput } from '../../types/paymentFollowUp';
import type { FinancialBalances } from '../../types/financialExecution';
import {
  buildPaymentCycleKey,
  buildPaymentFollowUpCycle,
  calculatePaymentCyclePrazos,
  derivePaymentCycleAlerts
} from '../../services/paymentFollowUpService';

describe('Acompanhamento de Pagamentos — Domínio e Operacionalização (Fase 7.4-D)', () => {
  const contractKey = '200331-50-2024';

  const sampleInput: PaymentCycleInput = {
    contractKey,
    competencia: '2026-08',
    dataRecebimento: '2026-08-10',
    dataAssinaturaAtesto: '2026-08-10',
    dataVencimentoFatura: '2026-08-25',
    documentoAtestoSei: 'Doc 1234567',
    valorAtesto: 15000,
    responsavelNome: 'Carlos Silva'
  };

  const sampleFinancialBalances: FinancialBalances = {
    saldoALiquidar: 60000,
    saldoAPagar: 5000,
    saldoNaoExecutado: 60000,
    saldoRpPendente: 0,
    taxaLiquidacaoPercentual: 40,
    taxaPagamentoPercentual: 35
  };

  it('STATUS-01: A situação vem dos marcos e o ciclo não carrega checklist de tarefas', () => {
    const cycle = buildPaymentFollowUpCycle(sampleInput, {
      baseDate: '2026-08-15',
      empenhoBalances: sampleFinancialBalances
    });

    expect(cycle.status).toBe('RECEBIDO');
    expect('tasks' in cycle).toBe(false);
  });

  it('KEY-01: Geração da chave do ciclo é estritamente idempotente (0 duplicações)', () => {
    const key1 = buildPaymentCycleKey(contractKey, '2026-08', 'Doc 1234567');
    const key2 = buildPaymentCycleKey(contractKey, '2026-08', 'Doc 1234567');
    expect(key1).toBe(key2);
  });

  it('ALERT-01: Emite alerta de vencimento iminente ou pendente de envio à CGOFI', () => {
    const input: PaymentCycleInput = {
      contractKey,
      competencia: '2026-08',
      dataRecebimento: '2026-08-03',
      dataAssinaturaAtesto: '2026-08-03',
      dataVencimentoFatura: '2026-08-10',
      documentoAtestoSei: 'Doc 1234567',
      valorAtesto: 5000,
      responsavelNome: 'Carlos'
    };

    const cycleKey = buildPaymentCycleKey(contractKey, '2026-08', 'Doc 1234567');
    const prazos = calculatePaymentCyclePrazos(input, '2026-08-08');
    const alerts = derivePaymentCycleAlerts(
      cycleKey,
      contractKey,
      'RECEBIDO',
      input,
      prazos,
      sampleFinancialBalances,
      '2026-08-08'
    );

    expect(alerts.length).toBeGreaterThan(0);
    const alert = alerts[0];
    expect(alert.nivel).toBe('CRITICO');
  });

  it('ALERT-02: Emite alerta de CGOFI sem resposta quando tramitação excede 5 dias úteis', () => {
    const input: PaymentCycleInput = {
      contractKey,
      competencia: '2026-08',
      dataRecebimento: '2026-08-03',
      dataAssinaturaAtesto: '2026-08-03',
      dataVencimentoFatura: '2026-08-30',
      documentoAtestoSei: 'Doc 1234567',
      valorAtesto: 5000,
      responsavelNome: 'Carlos',
      documentoDespachoSei: 'Despacho 9876',
      dataEnvioCgofi: '2026-08-05' // Quarta-feira
    };

    const cycleKey = buildPaymentCycleKey(contractKey, '2026-08', 'Doc 1234567');
    const prazos = calculatePaymentCyclePrazos(input, '2026-08-17'); // 8 dias úteis na CGOFI sem resposta
    const alerts = derivePaymentCycleAlerts(
      cycleKey,
      contractKey,
      'ENVIADO_CGOFI',
      input,
      prazos,
      sampleFinancialBalances,
      '2026-08-17'
    );

    const cgofiAlert = alerts.find(a => a.tipo === 'CGOFI_SEM_RESPOSTA');
    expect(cgofiAlert).toBeDefined();
    expect(cgofiAlert?.nivel).toBe('ATENCAO');
    expect(cgofiAlert?.mensagem).toContain('CGOFI');
  });

  it('ALERT-03: Emite alerta crítico quando fatura está vencida sem confirmação de pagamento', () => {
    const input: PaymentCycleInput = {
      contractKey,
      competencia: '2026-08',
      dataRecebimento: '2026-08-01',
      dataAssinaturaAtesto: '2026-08-01',
      dataVencimentoFatura: '2026-08-10',
      documentoAtestoSei: 'Doc 1234567',
      valorAtesto: 5000,
      responsavelNome: 'Carlos'
    };

    const cycleKey = buildPaymentCycleKey(contractKey, '2026-08', 'Doc 1234567');
    const prazos = calculatePaymentCyclePrazos(input, '2026-08-14'); // Vencida há 4 dias úteis
    const alerts = derivePaymentCycleAlerts(
      cycleKey,
      contractKey,
      'RECEBIDO',
      input,
      prazos,
      sampleFinancialBalances,
      '2026-08-14'
    );

    const overdueAlert = alerts.find(a => a.tipo === 'PAGAMENTO_FATURA_VENCIDA');
    expect(overdueAlert).toBeDefined();
    expect(overdueAlert?.nivel).toBe('CRITICO');
    expect(overdueAlert?.mensagem).toContain('FATURA VENCIDA');
  });

  it('ALERT-04: Consolida e deduplica alertas de múltiplos ciclos sem repetição de IDs', () => {
    const input1: PaymentCycleInput = {
      contractKey,
      competencia: '2026-07',
      dataRecebimento: '2026-07-10',
      dataAssinaturaAtesto: '2026-07-10',
      dataVencimentoFatura: '2026-07-25',
      documentoAtestoSei: 'DOC-01',
      valorAtesto: 3000
    };

    const input2: PaymentCycleInput = {
      contractKey,
      competencia: '2026-08',
      dataRecebimento: '2026-08-01',
      dataAssinaturaAtesto: '2026-08-01',
      dataVencimentoFatura: '2026-08-15',
      documentoAtestoSei: 'DOC-02',
      valorAtesto: 4000
    };

    const key1 = buildPaymentCycleKey(contractKey, '2026-07', 'DOC-01');
    const key2 = buildPaymentCycleKey(contractKey, '2026-08', 'DOC-02');

    const prazos1 = calculatePaymentCyclePrazos(input1, '2026-08-20');
    const prazos2 = calculatePaymentCyclePrazos(input2, '2026-08-20');

    const alerts1 = derivePaymentCycleAlerts(key1, contractKey, 'RECEBIDO', input1, prazos1, undefined, '2026-08-20');
    const alerts2 = derivePaymentCycleAlerts(key2, contractKey, 'RECEBIDO', input2, prazos2, undefined, '2026-08-20');

    const combinedAlerts = [...alerts1, ...alerts2];
    const alertIds = combinedAlerts.map(a => a.id);
    const uniqueIds = new Set(alertIds);
    expect(alertIds.length).toBe(uniqueIds.size);
  });

  it('FIN-01 e FIN-02: Balanços financeiros e valor do atesto permanecem somente leitura e não mutam empenhos', () => {
    const inputWithHighVal: PaymentCycleInput = {
      ...sampleInput,
      valorAtesto: 99999
    };

    const cycle = buildPaymentFollowUpCycle(inputWithHighVal, {
      baseDate: '2026-08-15',
      empenhoBalances: sampleFinancialBalances
    });
    expect(cycle.input.valorAtesto).toBe(99999);
    expect(sampleFinancialBalances.saldoAPagar).toBe(5000);
    expect(sampleFinancialBalances.saldoALiquidar).toBe(60000);
    expect(sampleFinancialBalances.saldoNaoExecutado).toBe(60000);
  });
});
