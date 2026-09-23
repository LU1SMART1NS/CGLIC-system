import { describe, it, expect } from 'vitest';
import type { ContractEvent } from '../../../types';
import {
  getOficialidadeInfo,
  getEventTypeDisplay,
  getInstrumentoDisplay,
  getImpactoDisplay,
  getEventCanonicalDate,
  sortEventsChronologically
} from '../ContractEventsTimeline';

describe('FASE 5.3 — ContractEventsTimeline Unit Tests', () => {

  it('1. Evento oficial do PNCP/Contratos.gov é classificado como Fato Oficial com texto explícito', () => {
    const officialEvent: ContractEvent = {
      id: 'CONTRATO::CTR-1::CELEBRACAO::TA-1::CICLO_1',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'CELEBRACAO',
      naturezaInstrumento: 'CONTRATO_INICIAL',
      identificadorOficial: 'Contrato 10/2026',
      descricao: 'Celebração inicial do Contrato 10/2026',
      fonteOrigem: 'PNCP',
      dataAssinatura: '2026-01-15',
      impacto: 'ALTERA_VIGENCIA',
      capturedAt: '2026-01-15T10:00:00Z',
      linkPncp: 'https://pncp.gov.br/app/contratos/200331/10/2026'
    };

    const info = getOficialidadeInfo(officialEvent);
    expect(info.level).toBe('FATO_OFICIAL');
    expect(info.label).toBe('Fato oficial');
  });

  it('2. Decisão administrativa do SEI é classificada como Decisão Interna com texto explícito', () => {
    const seiEvent: ContractEvent = {
      id: 'CONTRATO::CTR-1::PRORROGACAO::DECISAO::CICLO_1',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'REGISTRO_ADMINISTRATIVO',
      identificadorOficial: 'Despacho SEI nº 12345',
      descricao: 'Decisão interna de autorização para prorrogação',
      fonteOrigem: 'SEI',
      processoSeiNumero: '08000.000123/2026-01',
      dataAssinatura: '2026-05-10',
      impacto: 'ATUALIZA_DADOS',
      capturedAt: '2026-05-10T10:00:00Z'
    };

    const info = getOficialidadeInfo(seiEvent);
    expect(info.level).toBe('DECISAO_INTERNA');
    expect(info.label).toBe('Decisão interna');
  });

  it('3. Proposta administrativa / Estudo técnico preliminar é classificado como Proposta Administrativa', () => {
    const propostaEvent: ContractEvent = {
      id: 'CONTRATO::CTR-1::REAJUSTE::PROPOSTA::CICLO_1',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'REAJUSTE',
      naturezaInstrumento: 'REGISTRO_ADMINISTRATIVO',
      identificadorOficial: 'Minuta / Proposta',
      descricao: 'Proposta preliminar de repactuação enviada pela contratada',
      fonteOrigem: 'INTERNO',
      dataAssinatura: '2026-06-01',
      impacto: 'ALTERA_VALOR',
      capturedAt: '2026-06-01T10:00:00Z'
    };

    const info = getOficialidadeInfo(propostaEvent);
    expect(info.level).toBe('PROPOSTA_ADMINISTRATIVA');
    expect(info.label).toBe('Proposta administrativa');
  });

  it('4. Eventos são ordenados cronologicamente do mais recente para o mais antigo', () => {
    const ev1: ContractEvent = {
      id: 'EV_1',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'CELEBRACAO',
      naturezaInstrumento: 'CONTRATO_INICIAL',
      identificadorOficial: 'Contrato 10/2026',
      descricao: 'Celebração',
      dataAssinatura: '2026-01-15',
      impacto: 'ALTERA_VIGENCIA',
      fonteOrigem: 'PNCP',
      capturedAt: '2026-01-15T00:00:00Z'
    };

    const ev2: ContractEvent = {
      id: 'EV_2',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      identificadorOficial: '1º Termo Aditivo',
      descricao: 'Prorrogação de 12 meses',
      dataPublicacao: '2026-11-20',
      impacto: 'ALTERA_VIGENCIA',
      fonteOrigem: 'PNCP',
      capturedAt: '2026-11-20T00:00:00Z'
    };

    const ev3: ContractEvent = {
      id: 'EV_3',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'REAJUSTE',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      identificadorOficial: 'Apostilamento 1',
      descricao: 'Reajuste IPCA',
      dataPublicacao: '2026-06-10',
      impacto: 'ALTERA_VALOR',
      fonteOrigem: 'PNCP',
      capturedAt: '2026-06-10T00:00:00Z'
    };

    const sorted = sortEventsChronologically([ev1, ev2, ev3]);
    expect(sorted[0].id).toBe('EV_2'); // 2026-11-20
    expect(sorted[1].id).toBe('EV_3'); // 2026-06-10
    expect(sorted[2].id).toBe('EV_1'); // 2026-01-15
  });

  it('5. Data canônica do evento utiliza preferencialmente dataPublicacao -> dataVigenciaEfeito -> dataAssinatura', () => {
    const evWithPub: ContractEvent = {
      id: 'E1',
      contractKey: 'C1',
      uasg: '200331',
      numeroContrato: '1',
      anoContrato: 2026,
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      identificadorOficial: 'TA-1',
      descricao: 'TA',
      dataPublicacao: '2026-08-15',
      dataAssinatura: '2026-08-01',
      impacto: 'ALTERA_VIGENCIA',
      fonteOrigem: 'PNCP',
      capturedAt: '2026-08-15T00:00:00Z'
    };

    const { dateStr, displayDate } = getEventCanonicalDate(evWithPub);
    expect(dateStr).toBe('2026-08-15');
    expect(displayDate).toBe('15/08/2026');
  });

  it('6. Instrumento formal é mapeado para rótulos canônicos claros', () => {
    expect(getInstrumentoDisplay('CONTRATO_INICIAL')).toBe('Contrato Inicial');
    expect(getInstrumentoDisplay('TERMO_ADITIVO')).toBe('Termo Aditivo');
    expect(getInstrumentoDisplay('TERMO_APOSTILAMENTO')).toBe('Termo de Apostilamento');
    expect(getInstrumentoDisplay('TERMO_RECEBIMENTO_DEFINITIVO')).toBe('Termo de Recebimento Definitivo');
    expect(getInstrumentoDisplay('NOTIFICACAO_RESCISAO')).toBe('Notificação de Rescisão');
    expect(getInstrumentoDisplay('REGISTRO_ADMINISTRATIVO')).toBe('Registro Administrativo');
  });

  it('7. Impacto formal é traduzido com rótulos e estilos visuais adequados', () => {
    expect(getImpactoDisplay('ALTERA_VIGENCIA').label).toBe('Altera Vigência');
    expect(getImpactoDisplay('ALTERA_VALOR').label).toBe('Altera Valor');
    expect(getImpactoDisplay('ALTERA_QUANTITATIVO').label).toBe('Altera Quantitativo');
    expect(getImpactoDisplay('ATUALIZA_DADOS').label).toBe('Atualiza Dados');
    expect(getImpactoDisplay('EXTINGUE_CONTRATO').label).toBe('Extingue Contrato');
    expect(getImpactoDisplay('SEM_IMPACTO_FINANCEIRO_TEMPORAL').label).toBe('Sem Impacto Financeiro/Temporal');
  });

  it('8. Múltiplos eventos na mesma data realizam desempate determinístico por sequencial', () => {
    const ta1: ContractEvent = {
      id: 'TA_1',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      numeroSequencial: 1,
      identificadorOficial: '1º Termo Aditivo',
      descricao: 'TA 1',
      dataPublicacao: '2026-05-10',
      impacto: 'ALTERA_VIGENCIA',
      fonteOrigem: 'PNCP',
      capturedAt: '2026-05-10T00:00:00Z'
    };

    const ta2: ContractEvent = {
      id: 'TA_2',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'ACRESCIMO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      numeroSequencial: 2,
      identificadorOficial: '2º Termo Aditivo',
      descricao: 'TA 2',
      dataPublicacao: '2026-05-10',
      impacto: 'ALTERA_VALOR',
      fonteOrigem: 'PNCP',
      capturedAt: '2026-05-10T00:00:00Z'
    };

    const sorted = sortEventsChronologically([ta1, ta2]);
    expect(sorted[0].id).toBe('TA_2');
    expect(sorted[1].id).toBe('TA_1');
  });

  it('9. Mapeamento de tipos de eventos preserva semântica canônica (Celebração, Prorrogação, Rescisão, Encerramento)', () => {
    expect(getEventTypeDisplay('CELEBRACAO').label).toBe('Celebração Inicial');
    expect(getEventTypeDisplay('PRORROGACAO').label).toBe('Prorrogação de Vigência');
    expect(getEventTypeDisplay('REAJUSTE').label).toBe('Reajuste Contratual');
    expect(getEventTypeDisplay('REPACTUACAO').label).toBe('Repactuação Salarial');
    expect(getEventTypeDisplay('ACRESCIMO').label).toBe('Acréscimo de Valor/Qtd');
    expect(getEventTypeDisplay('SUPRESSAO').label).toBe('Supressão de Valor/Qtd');
    expect(getEventTypeDisplay('APOSTILAMENTO').label).toBe('Apostilamento');
    expect(getEventTypeDisplay('ENCERRAMENTO').label).toBe('Encerramento Contratual');
    expect(getEventTypeDisplay('RESCISAO').label).toBe('Rescisão Contratual');
  });

  it('10. Evento não possui data inventada quando não informada', () => {
    const evNoDate: ContractEvent = {
      id: 'EV_SEM_DATA',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'APOSTILAMENTO',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      identificadorOficial: 'Apostilamento',
      descricao: 'Apostilamento geral sem data explícita',
      impacto: 'ATUALIZA_DADOS',
      fonteOrigem: 'SaldoARP',
      capturedAt: ''
    };

    const { dateStr, displayDate } = getEventCanonicalDate(evNoDate);
    expect(dateStr).toBe('');
    expect(displayDate).toBe('Data não informada');
  });

  // ============================================================================
  // TESTES OBRIGATÓRIOS — CORREÇÃO ACH-5.3-01 (Precedência da Oficialidade)
  // ============================================================================

  it('TESTE 1 — PNCP + processo SEI: deve ser FATO_OFICIAL e não DECISAO_INTERNA', () => {
    const event: ContractEvent = {
      id: 'EV_TEST_1',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'CELEBRACAO',
      naturezaInstrumento: 'CONTRATO_INICIAL',
      identificadorOficial: 'Contrato 10/2026',
      descricao: 'Celebração formal do contrato',
      fonteOrigem: 'PNCP',
      processoSeiNumero: '12345.678901/2026-00',
      impacto: 'ALTERA_VIGENCIA',
      capturedAt: '2026-01-01T00:00:00Z'
    };

    const info = getOficialidadeInfo(event);
    expect(info.level).toBe('FATO_OFICIAL');
    expect(info.label).toBe('Fato oficial');
  });

  it('TESTE 2 — Contratos.gov.br + processo SEI: deve ser FATO_OFICIAL e não DECISAO_INTERNA', () => {
    const event: ContractEvent = {
      id: 'EV_TEST_2',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      identificadorOficial: '1º Termo Aditivo',
      descricao: 'Prorrogação de prazo',
      fonteOrigem: 'Contratos.gov.br',
      processoSeiNumero: '12345.678901/2026-00',
      impacto: 'ALTERA_VIGENCIA',
      capturedAt: '2026-01-01T00:00:00Z'
    };

    const info = getOficialidadeInfo(event);
    expect(info.level).toBe('FATO_OFICIAL');
    expect(info.label).toBe('Fato oficial');
  });

  it('TESTE 3 — PNCP identificado por número de controle + processo SEI: deve ser FATO_OFICIAL', () => {
    const event: ContractEvent = {
      id: 'EV_TEST_3',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'REAJUSTE',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      identificadorOficial: 'Apostilamento 1',
      descricao: 'Reajuste anual',
      fonteOrigem: 'SaldoARP',
      numeroControlePncp: '200331-1-000010/2026',
      processoSeiNumero: '12345.678901/2026-00',
      impacto: 'ALTERA_VALOR',
      capturedAt: '2026-01-01T00:00:00Z'
    };

    const info = getOficialidadeInfo(event);
    expect(info.level).toBe('FATO_OFICIAL');
    expect(info.label).toBe('Fato oficial');
  });

  it('TESTE 4 — SEI sem fonte oficial: deve ser DECISAO_INTERNA', () => {
    const event: ContractEvent = {
      id: 'EV_TEST_4',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'REGISTRO_ADMINISTRATIVO',
      identificadorOficial: 'Despacho SEI',
      descricao: 'Despacho de instrução processual',
      fonteOrigem: 'SEI',
      processoSeiNumero: '12345.678901/2026-00',
      numeroControlePncp: undefined,
      impacto: 'ATUALIZA_DADOS',
      capturedAt: '2026-01-01T00:00:00Z'
    };

    const info = getOficialidadeInfo(event);
    expect(info.level).toBe('DECISAO_INTERNA');
    expect(info.label).toBe('Decisão interna');
  });

  it('TESTE 5 — Processo SEI isolado sem qualquer evidência de fonte oficial: deve ser DECISAO_INTERNA', () => {
    const event: ContractEvent = {
      id: 'EV_TEST_5',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'APOSTILAMENTO',
      naturezaInstrumento: 'REGISTRO_ADMINISTRATIVO',
      identificadorOficial: 'Parecer Técnico Interno',
      descricao: 'Parecer técnico interno',
      fonteOrigem: 'INTERNO',
      processoSeiNumero: '12345.678901/2026-00',
      impacto: 'ATUALIZA_DADOS',
      capturedAt: '2026-01-01T00:00:00Z'
    };

    const info = getOficialidadeInfo(event);
    expect(info.level).toBe('DECISAO_INTERNA');
    expect(info.label).toBe('Decisão interna');
  });

  it('TESTE 6 — Regressão: DADO_INTERNO quando não há evidência oficial nem processo SEI', () => {
    const event: ContractEvent = {
      id: 'EV_TEST_6',
      contractKey: 'CTR-1',
      uasg: '200331',
      numeroContrato: '10',
      anoContrato: 2026,
      tipoEvento: 'APOSTILAMENTO',
      naturezaInstrumento: 'REGISTRO_ADMINISTRATIVO',
      identificadorOficial: 'Registro Interno SaldoARP',
      descricao: 'Registro administrativo cadastrado manualmente',
      fonteOrigem: 'SaldoARP',
      impacto: 'ATUALIZA_DADOS',
      capturedAt: '2026-01-01T00:00:00Z'
    };

    const info = getOficialidadeInfo(event);
    expect(info.level).toBe('DADO_INTERNO');
    expect(info.label).toBe('Registro interno');
  });
});
