import { describe, it, expect } from 'vitest';
import {
  generateReajusteRadarAlertId,
  evaluateContractReajusteRadar
} from '../contractReajusteRadarService';
import type { ContractEvent } from '../../types/contractEvents';
import type { ContractDashboardRecord } from '../../types';

describe('contractReajusteRadarService (Fase 7.5-C3)', () => {
  const baseContract: Partial<ContractDashboardRecord> = {
    id: 'CONTRATO::123456::00010::2026',
    uasg: '123456',
    numero: '00010',
    ano: 2026,
    dataAssinatura: '2026-01-15',
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente'
  };

  const createEvent = (partial: Partial<ContractEvent>): ContractEvent => ({
    id: partial.id || `EVT::${Math.random()}`,
    contractKey: 'CONTRATO::123456::00010::2026',
    uasg: '123456',
    numeroContrato: '00010',
    anoContrato: 2026,
    tipoEvento: partial.tipoEvento || 'REAJUSTE',
    naturezaInstrumento: partial.naturezaInstrumento || 'TERMO_APOSTILAMENTO',
    identificadorOficial: partial.identificadorOficial || 'APOST-01/2026',
    descricao: partial.descricao || 'Reajuste anual',
    impacto: partial.impacto || 'ALTERA_VALOR',
    fonteOrigem: partial.fonteOrigem || 'PNCP',
    capturedAt: '2026-01-15T12:00:00Z',
    ...partial
  });

  it('1. Contrato fora da janela (> 60 dias para o aniversário) não gera alerta', () => {
    // Aniversário: 2027-01-15. Data atual: 2026-10-01 (faltam 106 dias)
    const currentDate = new Date(2026, 9, 1); // 01/10/2026
    const alert = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [],
      currentDate
    });

    expect(alert).toBeNull();
  });

  it('2. Contrato na janela de 60 dias (ex: faltam 45 dias) gera alerta de nível PROXIMA', () => {
    // Aniversário: 2027-01-15. Data atual: 2026-12-01 (faltam 45 dias)
    const currentDate = new Date(2026, 11, 1); // 01/12/2026
    const alert = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [],
      currentDate
    });

    expect(alert).not.toBeNull();
    expect(alert?.nivel).toBe('PROXIMA');
    expect(alert?.diasRestantes).toBe(45);
    expect(alert?.ciclo).toBe(1);
    expect(alert?.dataAniversario).toBe('2027-01-15');
    expect(alert?.id).toBe('ALERT::ANIVERSARIO_REAJUSTE::CONTRATO::123456::00010::2026::ANO_1');
  });

  it('3. Contrato próximo do marco (ex: faltam 10 dias) gera alerta de nível URGENTE', () => {
    // Aniversário: 2027-01-15. Data atual: 2027-01-05 (faltam 10 dias)
    const currentDate = new Date(2027, 0, 5); // 05/01/2027
    const alert = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [],
      currentDate
    });

    expect(alert).not.toBeNull();
    expect(alert?.nivel).toBe('URGENTE');
    expect(alert?.diasRestantes).toBe(10);
  });

  it('4. Contrato no dia exato do marco gera alerta de nível HOJE', () => {
    // Aniversário: 2027-01-15. Data atual: 2027-01-15 (0 dias)
    const currentDate = new Date(2027, 0, 15); // 15/01/2027
    const alert = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [],
      currentDate
    });

    expect(alert).not.toBeNull();
    expect(alert?.nivel).toBe('HOJE');
    expect(alert?.diasRestantes).toBe(0);
  });

  it('5. Contrato após o marco (ex: 5 dias após) gera alerta de nível VENCIDA', () => {
    // Aniversário: 2027-01-15. Data atual: 2027-01-20 (-5 dias)
    const currentDate = new Date(2027, 0, 20); // 20/01/2027
    const alert = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [],
      currentDate
    });

    expect(alert).not.toBeNull();
    expect(alert?.nivel).toBe('VENCIDA');
    expect(alert?.diasRestantes).toBe(-5);
  });

  it('6. Ausência total de data-base válida não gera alerta', () => {
    const invalidContract: Partial<ContractDashboardRecord> = {
      id: 'CONTRATO::INVALID',
      uasg: '123456',
      statusVigencia: 'Vigente'
    };

    const alert = evaluateContractReajusteRadar({
      contract: invalidContract,
      events: []
    });

    expect(alert).toBeNull();
  });

  it('7. Contrato encerrado não gera radar preditivo futuro', () => {
    const closedContract: Partial<ContractDashboardRecord> = {
      ...baseContract,
      statusVigencia: 'Expirado'
    };

    const alert = evaluateContractReajusteRadar({
      contract: closedContract,
      events: [],
      currentDate: new Date(2026, 11, 1)
    });

    expect(alert).toBeNull();
  });

  it('8. Contrato rescindido / extinto não gera radar preditivo futuro', () => {
    const rescindedEvent = createEvent({
      id: 'EVT-RESCISAO',
      tipoEvento: 'RESCISAO',
      dataPublicacao: '2026-06-01'
    });

    const alert = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [rescindedEvent],
      currentDate: new Date(2026, 11, 1)
    });

    expect(alert).toBeNull();
  });

  it('9. Reajuste posterior registrado atualiza a data-base e projeta o próximo ciclo anual', () => {
    // Reajuste concedido em 2026-06-01.
    // Próximo marco deve ser 2027-06-01 (1 ano após o reajuste).
    const reajuste = createEvent({
      id: 'EVT-REAJUSTE-2026',
      tipoEvento: 'REAJUSTE',
      dataPublicacao: '2026-06-01'
    });

    // Se estivermos em 2026-12-01: faltam 182 dias para 2027-06-01 -> Fora da janela de 60 dias (null)
    const curDateA = new Date(2026, 11, 1);
    const alertA = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [reajuste],
      currentDate: curDateA
    });
    expect(alertA).toBeNull();

    // Se estivermos em 2027-05-15: faltam 17 dias para 2027-06-01 -> URGENTE ciclo 2
    const curDateB = new Date(2027, 4, 15);
    const alertB = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [reajuste],
      currentDate: curDateB
    });

    expect(alertB).not.toBeNull();
    expect(alertB?.nivel).toBe('URGENTE');
    expect(alertB?.origemDataBase).toBe('ULTIMO_REAJUSTE');
    expect(alertB?.dataBase).toBe('2026-06-01');
    expect(alertB?.dataAniversario).toBe('2027-06-01');
    expect(alertB?.ciclo).toBe(2);
  });

  it('10. Repactuação posterior registrada atualiza data-base e ciclo', () => {
    const repactuacao = createEvent({
      id: 'EVT-REPACT-2026',
      tipoEvento: 'REPACTUACAO',
      dataPublicacao: '2026-08-10'
    });

    // Data atual: 2027-07-01 (faltam 40 dias para 2027-08-10) -> PROXIMA ciclo 2
    const curDate = new Date(2027, 6, 1);
    const alert = evaluateContractReajusteRadar({
      contract: baseContract,
      events: [repactuacao],
      currentDate: curDate
    });

    expect(alert).not.toBeNull();
    expect(alert?.nivel).toBe('PROXIMA');
    expect(alert?.origemDataBase).toBe('ULTIMO_REAJUSTE');
    expect(alert?.dataAniversario).toBe('2027-08-10');
  });

  it('11. Chave determinística e idempotência da função', () => {
    const id = generateReajusteRadarAlertId('CONTRATO::123456::00010::2026', 1);
    expect(id).toBe('ALERT::ANIVERSARIO_REAJUSTE::CONTRATO::123456::00010::2026::ANO_1');

    const curDate = new Date(2026, 11, 1);
    const alert1 = evaluateContractReajusteRadar({ contract: baseContract, events: [], currentDate: curDate });
    const alert2 = evaluateContractReajusteRadar({ contract: baseContract, events: [], currentDate: curDate });

    expect(alert1).toEqual(alert2);
  });

  it('12. Mensagem operacional não declara conclusão jurídica automática', () => {
    const curDate = new Date(2026, 11, 1);
    const alert = evaluateContractReajusteRadar({ contract: baseContract, events: [], currentDate: curDate });

    expect(alert?.recomendacao).toContain('Recomenda-se verificar');
    expect(alert?.recomendacao).not.toContain('O fornecedor tem direito');
    expect(alert?.recomendacao).not.toContain('O contrato está irregular');
  });
});
