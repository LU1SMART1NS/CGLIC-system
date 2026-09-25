import { describe, it, expect } from 'vitest';
import {
  buildPaymentCycleKey,
  calculatePaymentCyclePrazos,
  derivePaymentCycleAlerts,
  determinePaymentCycleStatus,
  buildPaymentFollowUpCycle
} from '../paymentFollowUpService';
import { buildPaymentFollowUpTemplate } from '../paymentFollowUpTemplateService';
import type { PaymentCycleInput } from '../../types/paymentFollowUp';

describe('PaymentFollowUpService — Suíte Canônica do Workflow de Pagamentos (Fase 7.4-C)', () => {
  const sampleInput: PaymentCycleInput = {
    contractKey: '200331-12-2024',
    competencia: '2026-03',
    dataAssinaturaAtesto: '2026-03-02',
    dataVencimentoFatura: '2026-03-20',
    documentoAtestoSei: 'Doc 143589236',
    numeroProcessoPagamentoSei: '08200.001234/2026-56',
    numeroNotasFiscais: 2,
    valorAtesto: 15400.50
  };

  // ---------------------------------------------------------------------------
  // C1: Criar ciclo de pagamento
  // ---------------------------------------------------------------------------
  it('C1: Deve criar o ciclo de pagamento com chave determinística e cálculo de prazos', () => {
    const cycle = buildPaymentFollowUpCycle(sampleInput, { baseDate: '2026-03-02' });

    expect(cycle.cycleKey).toBe('200331-12-2024-PGTO-202603-DOC143589236');
    expect(cycle.status).toBe('RECEBIDO');
    expect(cycle.prazos.janelaTotalDiasUteis).toBe(14); // 02/03 a 20/03 em dias úteis
    expect(cycle.prazos.diasUteisAteVencimento).toBe(14);
    expect(cycle.prazos.isVencida).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // C2: Idempotência de criação
  // ---------------------------------------------------------------------------
  it('C2: Deve garantir chave idêntica para o mesmo contrato, competência e documento', () => {
    const key1 = buildPaymentCycleKey('200331-12-2024', '2026-03', 'Doc 143589236');
    const key2 = buildPaymentCycleKey('200331-12-2024', '2026-03', 'Doc 143589236');
    const key3 = buildPaymentCycleKey('200331-12-2024', '2026/03', 'doc 143589236');

    expect(key1).toBe(key2);
    expect(key1).toBe(key3);
    expect(key1).toBe('200331-12-2024-PGTO-202603-DOC143589236');
  });

  // ---------------------------------------------------------------------------
  // C3: Atesto recebido -> Atribuição
  // ---------------------------------------------------------------------------
  it('C3: Deve transicionar para EM_INSTRUCAO quando o responsável for atribuído', () => {
    const inputWithResp: PaymentCycleInput = {
      ...sampleInput,
      responsavelNome: 'Maria Silva'
    };

    const status = determinePaymentCycleStatus(inputWithResp);
    expect(status).toBe('EM_INSTRUCAO');
  });

  // ---------------------------------------------------------------------------
  // C4: Atesto sem atribuição por >2 dias úteis
  // ---------------------------------------------------------------------------
  it('C4: Deve emitir alerta de ATENCAO se atesto recebido não for atribuído em mais de 2 dias úteis', () => {
    const prazos = calculatePaymentCyclePrazos(sampleInput, '2026-03-06'); // 4 dias úteis após 02/03
    const alerts = derivePaymentCycleAlerts(
      'cycle-1',
      sampleInput.contractKey,
      'RECEBIDO',
      sampleInput,
      prazos,
      undefined,
      '2026-03-06'
    );

    const alertAtrib = alerts.find(a => a.tipo === 'ATESTO_PENDENTE_ATRIBUICAO');
    expect(alertAtrib).toBeDefined();
    expect(alertAtrib?.nivel).toBe('ATENCAO');
    expect(alertAtrib?.diasRelevantes).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // C5 & C6: Instrução concluída e Despacho elaborado
  // ---------------------------------------------------------------------------
  it('C5/C6: Deve transicionar para DESPACHO_ELABORADO quando documento do despacho for informado', () => {
    const inputWithDespacho: PaymentCycleInput = {
      ...sampleInput,
      responsavelNome: 'Maria Silva',
      documentoDespachoSei: 'Doc 145998120'
    };

    const status = determinePaymentCycleStatus(inputWithDespacho);
    expect(status).toBe('DESPACHO_ELABORADO');
  });

  // ---------------------------------------------------------------------------
  // C7 & C8: Envio à CGOFI e Processo Aguardando
  // ---------------------------------------------------------------------------
  it('C7/C8: Deve transicionar para AGUARDANDO_CGOFI e calcular margem para vencimento', () => {
    const inputEnviado: PaymentCycleInput = {
      ...sampleInput,
      responsavelNome: 'Maria Silva',
      documentoDespachoSei: 'Doc 145998120',
      dataEnvioCgofi: '2026-03-10'
    };

    const status = determinePaymentCycleStatus(inputEnviado);
    const prazos = calculatePaymentCyclePrazos(inputEnviado, '2026-03-10');

    expect(status).toBe('AGUARDANDO_CGOFI');
    expect(prazos.margemEnvioDiasUteis).toBe(8); // 10/03 a 20/03 em dias úteis
    expect(prazos.diasSemRespostaCgofi).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // C9: CGOFI sem resposta por >5 dias úteis
  // ---------------------------------------------------------------------------
  it('C9: Deve emitir alerta de CGOFI_SEM_RESPOSTA quando decorridos mais de 5 dias úteis', () => {
    const inputEnviado: PaymentCycleInput = {
      ...sampleInput,
      responsavelNome: 'Maria Silva',
      documentoDespachoSei: 'Doc 145998120',
      dataEnvioCgofi: '2026-03-05'
    };

    const prazos = calculatePaymentCyclePrazos(inputEnviado, '2026-03-16'); // 7 dias úteis após envio
    const alerts = derivePaymentCycleAlerts(
      'cycle-1',
      inputEnviado.contractKey,
      'AGUARDANDO_CGOFI',
      inputEnviado,
      prazos,
      undefined,
      '2026-03-16'
    );

    const alertCgofi = alerts.find(a => a.tipo === 'CGOFI_SEM_RESPOSTA');
    expect(alertCgofi).toBeDefined();
    expect(alertCgofi?.nivel).toBe('ATENCAO');
    expect(alertCgofi?.diasRelevantes).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // C10: Pagamento Confirmado mediante Ordem Bancária oficial
  // ---------------------------------------------------------------------------
  it('C10: Deve transicionar para PAGAMENTO_CONFIRMADO ao registrar a OB oficial', () => {
    const inputPago: PaymentCycleInput = {
      ...sampleInput,
      responsavelNome: 'Maria Silva',
      documentoDespachoSei: 'Doc 145998120',
      dataEnvioCgofi: '2026-03-05',
      numeroOrdemBancaria: '2026OB800123',
      dataOrdemBancaria: '2026-03-12'
    };

    const status = determinePaymentCycleStatus(inputPago);
    const cycle = buildPaymentFollowUpCycle(inputPago, { baseDate: '2026-03-15' });

    expect(status).toBe('PAGAMENTO_CONFIRMADO');
    expect(cycle.status).toBe('PAGAMENTO_CONFIRMADO');
    expect(cycle.concluidoEm).toBe('2026-03-12');
    expect(cycle.prazos.diasSemRespostaCgofi).toBe(5); // 05/03 a 12/03 (congelado na data da OB)
  });

  // ---------------------------------------------------------------------------
  // C11: Ciclo Concluído
  // ---------------------------------------------------------------------------
  it('C11: Permite override formal de status para CONCLUIDO', () => {
    const cycle = buildPaymentFollowUpCycle(sampleInput, { overrideStatus: 'CONCLUIDO' });
    expect(cycle.status).toBe('CONCLUIDO');
  });

  // ---------------------------------------------------------------------------
  // C12: Exceções operacionais (DEVOLVIDO_FISCAL, CANCELADO)
  // ---------------------------------------------------------------------------
  it('C12: Suporta estados de exceção como DEVOLVIDO_FISCAL e CANCELADO', () => {
    const cycleDevolvido = buildPaymentFollowUpCycle(sampleInput, { overrideStatus: 'DEVOLVIDO_FISCAL' });
    const cycleCancelado = buildPaymentFollowUpCycle(sampleInput, { overrideStatus: 'CANCELADO' });

    expect(cycleDevolvido.status).toBe('DEVOLVIDO_FISCAL');
    expect(cycleCancelado.status).toBe('CANCELADO');
  });

  // ---------------------------------------------------------------------------
  // C13: Preservação de dados (Valor do atesto é metadado operacional)
  // ---------------------------------------------------------------------------
  it('C13: Preserva o valor do atesto sem misturar com valor pago oficial', () => {
    const cycle = buildPaymentFollowUpCycle(sampleInput);

    expect(cycle.input.valorAtesto).toBe(15400.50);
    // Não inventa nem altera valores financeiros oficiais
  });

  // ---------------------------------------------------------------------------
  // C14: Alerta quando saldo de empenho for insuficiente
  // ---------------------------------------------------------------------------
  it('C14: Emite alerta de saldo insuficiente quando o atesto superar o saldo disponível', () => {
    const prazos = calculatePaymentCyclePrazos(sampleInput, '2026-03-02');
    const alerts = derivePaymentCycleAlerts(
      'cycle-1',
      sampleInput.contractKey,
      'EM_INSTRUCAO',
      sampleInput,
      prazos,
      { saldoALiquidar: 10000 }, // Empenho com apenas 10.000 para atesto de 15.400,50
      '2026-03-02'
    );

    const alertSaldo = alerts.find(a => a.tipo === 'EMPENHO_SEM_SALDO_SUFICIENTE');
    expect(alertSaldo).toBeDefined();
    expect(alertSaldo?.mensagem).toContain('10000.00');
    expect(alertSaldo?.mensagem).toContain('15400.50');
  });

  // ---------------------------------------------------------------------------
  // C15: Múltiplos Ciclos no mesmo Contrato
  // ---------------------------------------------------------------------------
  it('C15: Garante isolamento estrito entre diferentes competências do mesmo contrato', () => {
    const keyJan = buildPaymentCycleKey('200331-12-2024', '2026-01', 'Doc-1');
    const keyFev = buildPaymentCycleKey('200331-12-2024', '2026-02', 'Doc-2');
    const keyMar = buildPaymentCycleKey('200331-12-2024', '2026-03', 'Doc-3');

    expect(keyJan).not.toBe(keyFev);
    expect(keyFev).not.toBe(keyMar);
    expect(keyJan).toBe('200331-12-2024-PGTO-202601-DOC1');
    expect(keyFev).toBe('200331-12-2024-PGTO-202602-DOC2');
    expect(keyMar).toBe('200331-12-2024-PGTO-202603-DOC3');
  });

  // ---------------------------------------------------------------------------
  // Validação do Template Gerador de Tarefas
  // ---------------------------------------------------------------------------
  it('Template: Deve gerar 5 macrotarefas e 11 tarefas com ExecutionMode correto', () => {
    const tpl = buildPaymentFollowUpTemplate(sampleInput);

    expect(tpl.macrotarefas).toHaveLength(5);
    const totalTarefas = tpl.macrotarefas.reduce((acc, m) => acc + m.tarefas.length, 0);
    expect(totalTarefas).toBe(11);

    // Validação dos modos de execução
    const executionModes = tpl.macrotarefas.flatMap(m => m.tarefas.map(t => t.executionMode));
    expect(executionModes.filter(m => m === 'INTERNA')).toHaveLength(4);
    expect(executionModes.filter(m => m === 'EXTERNA')).toHaveLength(3);
    expect(executionModes.filter(m => m === 'AUTOMATICA')).toHaveLength(3);
    expect(executionModes.filter(m => m === 'CONFIRMACAO')).toHaveLength(1);
  });
});
