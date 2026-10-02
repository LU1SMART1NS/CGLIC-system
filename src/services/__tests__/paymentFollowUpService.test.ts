import { describe, it, expect } from 'vitest';
import {
  buildPaymentCycleKey,
  calculateEtapaPrazo,
  calculatePaymentCyclePrazos,
  derivePaymentCycleAlerts,
  determinePaymentCycleStatus,
  buildPaymentFollowUpCycle
} from '../paymentFollowUpService';
import type { PaymentCycleInput } from '../../types/paymentFollowUp';

describe('PaymentFollowUpService — Suíte Canônica do Workflow de Pagamentos (Fase 7.4-C)', () => {
  const sampleInput: PaymentCycleInput = {
    contractKey: '200331-12-2024',
    competencia: '2026-03',
    dataRecebimento: '2026-03-02',
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
  // C3: Situação deduzida dos marcos (ninguém escolhe a situação à mão)
  // ---------------------------------------------------------------------------
  it('C3: Sem marcos além do recebimento, o ciclo está em conferência (RECEBIDO)', () => {
    expect(determinePaymentCycleStatus({ ...sampleInput, responsavelNome: 'Maria Silva' })).toBe('RECEBIDO');
  });

  it('C4: A conferência registrada leva o ciclo a CONFERIDO', () => {
    expect(determinePaymentCycleStatus({ ...sampleInput, dataConferencia: '2026-03-05' })).toBe('CONFERIDO');
  });

  it('C5/C6: O envio à CGOFI (despacho + data) leva o ciclo a ENVIADO_CGOFI e calcula a margem', () => {
    const inputEnviado: PaymentCycleInput = {
      ...sampleInput,
      dataConferencia: '2026-03-06',
      documentoDespachoSei: 'Doc 145998120',
      dataEnvioCgofi: '2026-03-10'
    };

    const status = determinePaymentCycleStatus(inputEnviado);
    const prazos = calculatePaymentCyclePrazos(inputEnviado, '2026-03-10');

    expect(status).toBe('ENVIADO_CGOFI');
    expect(prazos.margemEnvioDiasUteis).toBe(8); // 10/03 a 20/03 em dias úteis
    expect(prazos.diasSemRespostaCgofi).toBe(0);
  });

  it('C7: A ordem bancária leva o ciclo a PAGO e congela os dias da CGOFI na data da OB', () => {
    const inputPago: PaymentCycleInput = {
      ...sampleInput,
      dataConferencia: '2026-03-04',
      documentoDespachoSei: 'Doc 145998120',
      dataEnvioCgofi: '2026-03-05',
      numeroOrdemBancaria: '2026OB800123',
      dataOrdemBancaria: '2026-03-12'
    };

    const status = determinePaymentCycleStatus(inputPago);
    const cycle = buildPaymentFollowUpCycle(inputPago, { baseDate: '2026-03-15' });

    expect(status).toBe('PAGO');
    expect(cycle.status).toBe('PAGO');
    expect(cycle.concluidoEm).toBe('2026-03-12');
    expect(cycle.etapaAtual).toBeUndefined();
    expect(cycle.prazos.diasSemRespostaCgofi).toBe(5); // 05/03 a 12/03 (congelado na data da OB)
  });

  // ---------------------------------------------------------------------------
  // C8: Prazo da etapa em curso e quem responde por ele
  // ---------------------------------------------------------------------------
  it('C8: Conferência é da CGLIC; sem a data-alvo definida não há prazo de etapa', () => {
    const comPrazo = { ...sampleInput, prazoConferenciaAte: '2026-03-09' };
    const etapa = calculateEtapaPrazo('RECEBIDO', comPrazo, '2026-03-04');
    expect(etapa).toMatchObject({ etapa: 'CONFERENCIA', dono: 'CGLIC', dataAlvo: '2026-03-09', atrasado: false, diasUteisRestantes: 3 });
    expect(calculateEtapaPrazo('RECEBIDO', sampleInput, '2026-03-04')).toBeUndefined();
  });

  it('C9: Etapa da CGLIC com a data-alvo vencida emite alerta de prazo da etapa', () => {
    const input = { ...sampleInput, prazoConferenciaAte: '2026-03-04' };
    const prazos = calculatePaymentCyclePrazos(input, '2026-03-09');
    const etapa = calculateEtapaPrazo('RECEBIDO', input, '2026-03-09');
    const alerts = derivePaymentCycleAlerts('cycle-1', input.contractKey, 'RECEBIDO', input, prazos, undefined, '2026-03-09', etapa);

    const alerta = alerts.find(a => a.tipo === 'PRAZO_ETAPA_VENCIDO');
    expect(alerta).toBeDefined();
    expect(alerta?.nivel).toBe('ATENCAO');
    expect(alerta?.diasRelevantes).toBe(3);
  });

  it('C10: Depois do envio o dono é a CGOFI: a CGLIC só cobra, a partir da data de cobrança', () => {
    const inputEnviado: PaymentCycleInput = {
      ...sampleInput,
      dataConferencia: '2026-03-04',
      documentoDespachoSei: 'Doc 145998120',
      dataEnvioCgofi: '2026-03-05'
    };

    const prazos = calculatePaymentCyclePrazos(inputEnviado, '2026-03-16'); // 7 dias úteis após o envio
    const etapa = calculateEtapaPrazo('ENVIADO_CGOFI', inputEnviado, '2026-03-16');
    expect(etapa).toMatchObject({ etapa: 'COBRANCA_CGOFI', dono: 'CGOFI', atrasado: true });

    const alerts = derivePaymentCycleAlerts('cycle-1', inputEnviado.contractKey, 'ENVIADO_CGOFI', inputEnviado, prazos, undefined, '2026-03-16', etapa);
    const alertCgofi = alerts.find(a => a.tipo === 'CGOFI_SEM_RESPOSTA');
    expect(alertCgofi).toBeDefined();
    expect(alertCgofi?.nivel).toBe('ATENCAO');
    expect(alertCgofi?.mensagem).toContain('Cobrar a CGOFI');
    expect(alertCgofi?.diasRelevantes).toBe(7);
    // Na CGOFI o processo não é da CGLIC: não há alerta de fatura vencida nem de etapa da CGLIC
    expect(alerts.some(a => a.tipo === 'PRAZO_ETAPA_VENCIDO')).toBe(false);
  });

  it('C11: A data de cobrança definida pelo gestor prevalece sobre o padrão', () => {
    const input: PaymentCycleInput = { ...sampleInput, dataEnvioCgofi: '2026-03-05', cobrarCgofiAte: '2026-03-19' };
    const etapa = calculateEtapaPrazo('ENVIADO_CGOFI', input, '2026-03-16');
    expect(etapa).toMatchObject({ dataAlvo: '2026-03-19', atrasado: false });
  });

  // ---------------------------------------------------------------------------
  // C12: Exceções (override do servidor: pendência, devolução, cancelamento)
  // ---------------------------------------------------------------------------
  it('C12: A situação informada pelo servidor prevalece (COM_PENDENCIA, DEVOLVIDO, CANCELADO)', () => {
    expect(buildPaymentFollowUpCycle(sampleInput, { overrideStatus: 'COM_PENDENCIA' }).status).toBe('COM_PENDENCIA');
    expect(buildPaymentFollowUpCycle(sampleInput, { overrideStatus: 'DEVOLVIDO' }).status).toBe('DEVOLVIDO');
    expect(buildPaymentFollowUpCycle(sampleInput, { overrideStatus: 'CANCELADO' }).status).toBe('CANCELADO');
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
      'RECEBIDO',
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
});
