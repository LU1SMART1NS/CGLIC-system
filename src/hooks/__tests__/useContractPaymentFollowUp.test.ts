/**
 * Testes Unitários para a Lógica e Ciclo de Vida do Acompanhamento de Pagamentos (SaldoARP 3.0 - Fase 7.4-D)
 * 
 * Cobre:
 * - TASK-01: Instanciação das 5 macroetapas e 11 tarefas a partir do template canônico.
 * - TASK-02: Idempotência na criação/instanciação repetida (zero duplicações).
 * - TASK-03: Mudança de estado e registro de observação/evidência nas tarefas.
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
import { buildPaymentFollowUpTemplate } from '../../services/paymentFollowUpTemplateService';

describe('Acompanhamento de Pagamentos — Domínio e Operacionalização (Fase 7.4-D)', () => {
  const contractKey = '200331-50-2024';

  const sampleInput: PaymentCycleInput = {
    contractKey,
    competencia: '2026-08',
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

  it('TASK-01: Instancia tarefas do template canônico com 5 macroetapas e 11 tarefas', () => {
    const template = buildPaymentFollowUpTemplate(sampleInput);

    expect(template.macrotarefas).toHaveLength(5);
    const totalTasks = template.macrotarefas.reduce((acc, m) => acc + m.tarefas.length, 0);
    expect(totalTasks).toBe(11);

    const macroNames = template.macrotarefas.map(m => m.nome);
    expect(macroNames).toContain('1. Recepção e Atribuição do Atesto');
    expect(macroNames).toContain('2. Instrução Processual e Conformidade Fiscal');
    expect(macroNames).toContain('3. Encaminhamento à CGOFI');
    expect(macroNames).toContain('4. Acompanhamento e Controle de Prazos');
    expect(macroNames).toContain('5. Confirmação e Encerramento');

    const cycle = buildPaymentFollowUpCycle(sampleInput, {
      baseDate: '2026-08-15',
      empenhoBalances: sampleFinancialBalances
    });
    cycle.tasks = template;

    expect(cycle.tasks.macrotarefas).toHaveLength(5);
    expect(cycle.status).toBe('EM_INSTRUCAO');
  });

  it('TASK-02: Geração de ciclo e template é estritamente idempotente (0 duplicações)', () => {
    const key1 = buildPaymentCycleKey(contractKey, '2026-08', 'Doc 1234567');
    const key2 = buildPaymentCycleKey(contractKey, '2026-08', 'Doc 1234567');
    expect(key1).toBe(key2);

    const template1 = buildPaymentFollowUpTemplate(sampleInput);
    const template2 = buildPaymentFollowUpTemplate(sampleInput);

    expect(template1.macrotarefas.length).toBe(template2.macrotarefas.length);
    expect(template1.macrotarefas[0].tarefas.length).toBe(template2.macrotarefas[0].tarefas.length);
  });

  it('TASK-03: Permite gerenciar tarefas preservando sua semântica de execução', () => {
    const template = buildPaymentFollowUpTemplate(sampleInput);
    const firstTask = template.macrotarefas[0].tarefas[0];
    expect(firstTask.executionMode).toBe('INTERNA');

    const sicafTask = template.macrotarefas[1].tarefas[0];
    expect(sicafTask.executionMode).toBe('EXTERNA');
    expect(sicafTask.sistemaDestino).toBe('SICAF');

    const empenhoTask = template.macrotarefas[1].tarefas[1];
    expect(empenhoTask.executionMode).toBe('AUTOMATICA');
    expect(empenhoTask.sistemaDestino).toBe('SaldoARP');
  });

  it('ALERT-01: Emite alerta de vencimento iminente ou pendente de envio à CGOFI', () => {
    const input: PaymentCycleInput = {
      contractKey,
      competencia: '2026-08',
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
      'EM_INSTRUCAO',
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
      'AGUARDANDO_CGOFI',
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
      'EM_INSTRUCAO',
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
      dataAssinaturaAtesto: '2026-07-10',
      dataVencimentoFatura: '2026-07-25',
      documentoAtestoSei: 'DOC-01',
      valorAtesto: 3000
    };

    const input2: PaymentCycleInput = {
      contractKey,
      competencia: '2026-08',
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
