import { describe, it, expect } from 'vitest';
import {
  roundCurrency,
  buildContractValueEvolutionModel
} from '../contractValueEvolutionService';
import type { ContractEvent } from '../../types/contractEvents';
import type { ContractDashboardRecord } from '../../types';

describe('contractValueEvolutionService (Fase 7.5-C1)', () => {
  const baseContract: Partial<ContractDashboardRecord> = {
    id: 'CONTRATO::123456::00001::2026',
    uasg: '123456',
    numero: '00001',
    ano: 2026,
    valorInicial: 100000.0,
    valorGlobal: 100000.0,
    dataVigenciaInicio: '2026-01-01',
    dataVigenciaFim: '2027-01-01'
  };

  const createEvent = (partial: Partial<ContractEvent>): ContractEvent => ({
    id: partial.id || `EVT::${Math.random()}`,
    contractKey: 'CONTRATO::123456::00001::2026',
    uasg: '123456',
    numeroContrato: '00001',
    anoContrato: 2026,
    tipoEvento: partial.tipoEvento || 'REAJUSTE',
    naturezaInstrumento: partial.naturezaInstrumento || 'TERMO_APOSTILAMENTO',
    identificadorOficial: partial.identificadorOficial || 'APOST-01/2026',
    descricao: partial.descricao || 'Reajuste anual de preços por índice oficial',
    impacto: partial.impacto || 'ALTERA_VALOR',
    fonteOrigem: partial.fonteOrigem || 'PNCP',
    capturedAt: '2026-01-01T12:00:00Z',
    ...partial
  });

  it('1. Contrato sem eventos deve projetar valor original igual a valor vigente com delta zero', () => {
    const model = buildContractValueEvolutionModel(baseContract, []);

    expect(model.contractKey).toBe('CONTRATO::123456::00001::2026');
    expect(model.valorOriginal).toBe(100000.0);
    expect(model.valorVigente).toBe(100000.0);
    expect(model.deltaAcumulado).toBe(0.0);
    expect(model.percentualVariacaoAcumulada).toBe(0.0);
    expect(model.totalEventosConsiderados).toBe(0);
    expect(model.totalEventosMonetarios).toBe(0);
    expect(model.totalAcrescimos).toBe(0);
    expect(model.totalSupressoes).toBe(0);
    expect(model.totalReajustes).toBe(0);
    expect(model.totalRepactuacoes).toBe(0);
    expect(model.eventos).toHaveLength(0);
  });

  it('2. Um reajuste positivo por apostilamento deve atualizar valor vigente e categorizar delta', () => {
    const reajuste = createEvent({
      id: 'EVT-REAJUSTE-01',
      tipoEvento: 'REAJUSTE',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      identificadorOficial: 'APOST-01/2026',
      dataPublicacao: '2026-06-01',
      variacaoValor: 5430.5,
      impacto: 'ALTERA_VALOR'
    });

    const model = buildContractValueEvolutionModel(baseContract, [reajuste]);

    expect(model.valorOriginal).toBe(100000.0);
    expect(model.valorVigente).toBe(105430.5);
    expect(model.deltaAcumulado).toBe(5430.5);
    expect(model.percentualVariacaoAcumulada).toBe(5.43);
    expect(model.totalReajustes).toBe(5430.5);
    expect(model.totalEventosMonetarios).toBe(1);
    expect(model.dataUltimoEventoRelevante).toBe('2026-06-01');

    expect(model.eventos[0]).toMatchObject({
      eventoId: 'EVT-REAJUSTE-01',
      tipoEvento: 'REAJUSTE',
      impactoMonetario: true,
      deltaValor: 5430.5,
      valorAnterior: 100000.0,
      valorResultante: 105430.5,
      oficialidade: 'FATO_OFICIAL'
    });
  });

  it('3. Múltiplos reajustes progressivos devem acumular corretamente', () => {
    const r1 = createEvent({
      id: 'EVT-R1',
      tipoEvento: 'REAJUSTE',
      numeroSequencial: 1,
      dataPublicacao: '2026-03-01',
      variacaoValor: 2000.0
    });
    const r2 = createEvent({
      id: 'EVT-R2',
      tipoEvento: 'REAJUSTE',
      numeroSequencial: 2,
      dataPublicacao: '2026-09-01',
      variacaoValor: 3500.0
    });

    const model = buildContractValueEvolutionModel(baseContract, [r1, r2]);

    expect(model.valorOriginal).toBe(100000.0);
    expect(model.valorVigente).toBe(105500.0);
    expect(model.deltaAcumulado).toBe(5500.0);
    expect(model.totalReajustes).toBe(5500.0);
    expect(model.totalEventosMonetarios).toBe(2);
  });

  it('4. Acréscimo quantitativo de 20% deve gerar delta positivo e classificar como totalAcrescimos', () => {
    const acrescimo = createEvent({
      id: 'EVT-ACRESCIMO-01',
      tipoEvento: 'ACRESCIMO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      identificadorOficial: '1º Termo Aditivo',
      numeroSequencial: 1,
      dataPublicacao: '2026-04-15',
      variacaoValor: 20000.0
    });

    const model = buildContractValueEvolutionModel(baseContract, [acrescimo]);

    expect(model.valorVigente).toBe(120000.0);
    expect(model.totalAcrescimos).toBe(20000.0);
    expect(model.deltaAcumulado).toBe(20000.0);
    expect(model.percentualVariacaoAcumulada).toBe(20.0);
  });

  it('5. Supressão quantitativa de 10% deve gerar delta negativo e totalSupressoes positivo em magnitude', () => {
    const supressao = createEvent({
      id: 'EVT-SUPRESSAO-01',
      tipoEvento: 'SUPRESSAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      identificadorOficial: '2º Termo Aditivo',
      numeroSequencial: 2,
      dataPublicacao: '2026-07-20',
      variacaoValor: 10000.0 // mesmo que passado positivo, supressão é estritamente negativa
    });

    const model = buildContractValueEvolutionModel(baseContract, [supressao]);

    expect(model.valorVigente).toBe(90000.0);
    expect(model.totalSupressoes).toBe(10000.0);
    expect(model.deltaAcumulado).toBe(-10000.0);
    expect(model.percentualVariacaoAcumulada).toBe(-10.0);
    expect(model.eventos[0].deltaValor).toBe(-10000.0);
  });

  it('6. Combinação complexa de Reajuste + Acréscimo + Supressão + Repactuação', () => {
    const eventos: ContractEvent[] = [
      createEvent({
        id: 'EVT-01',
        tipoEvento: 'CELEBRACAO',
        dataAssinatura: '2026-01-01',
        variacaoValor: 0,
        impacto: 'ATUALIZA_DADOS'
      }),
      createEvent({
        id: 'EVT-02',
        tipoEvento: 'REAJUSTE',
        numeroSequencial: 1,
        dataPublicacao: '2026-03-01',
        variacaoValor: 5000.0
      }),
      createEvent({
        id: 'EVT-03',
        tipoEvento: 'ACRESCIMO',
        numeroSequencial: 2,
        dataPublicacao: '2026-05-01',
        variacaoValor: 15000.0
      }),
      createEvent({
        id: 'EVT-04',
        tipoEvento: 'SUPRESSAO',
        numeroSequencial: 3,
        dataPublicacao: '2026-08-01',
        variacaoValor: -8000.0
      }),
      createEvent({
        id: 'EVT-05',
        tipoEvento: 'REPACTUACAO',
        numeroSequencial: 4,
        dataPublicacao: '2026-10-01',
        variacaoValor: 12000.0
      })
    ];

    const model = buildContractValueEvolutionModel(baseContract, eventos);

    // 100.000 + 5.000 (R) + 15.000 (A) - 8.000 (S) + 12.000 (Rep) = 124.000
    expect(model.valorOriginal).toBe(100000.0);
    expect(model.valorVigente).toBe(124000.0);
    expect(model.deltaAcumulado).toBe(24000.0);
    expect(model.percentualVariacaoAcumulada).toBe(24.0);
    expect(model.totalReajustes).toBe(5000.0);
    expect(model.totalAcrescimos).toBe(15000.0);
    expect(model.totalSupressoes).toBe(8000.0);
    expect(model.totalRepactuacoes).toBe(12000.0);
    expect(model.totalEventosConsiderados).toBe(5);
    expect(model.totalEventosMonetarios).toBe(4);
  });

  it('7. Eventos sem impacto monetário (Prorrogação simples, Encerramento, Rescisão) não afetam valor', () => {
    const eventos: ContractEvent[] = [
      createEvent({
        id: 'EVT-PRORR',
        tipoEvento: 'PRORROGACAO',
        naturezaInstrumento: 'TERMO_ADITIVO',
        identificadorOficial: '1º Termo Aditivo',
        dataPublicacao: '2026-11-01',
        impacto: 'ALTERA_VIGENCIA',
        variacaoValor: 0
      }),
      createEvent({
        id: 'EVT-ENCERR',
        tipoEvento: 'ENCERRAMENTO',
        naturezaInstrumento: 'TERMO_RECEBIMENTO_DEFINITIVO',
        dataPublicacao: '2027-01-01',
        impacto: 'EXTINGUE_CONTRATO'
      })
    ];

    const model = buildContractValueEvolutionModel(baseContract, eventos);

    expect(model.valorOriginal).toBe(100000.0);
    expect(model.valorVigente).toBe(100000.0);
    expect(model.deltaAcumulado).toBe(0.0);
    expect(model.totalEventosMonetarios).toBe(0);
    expect(model.totalEventosConsiderados).toBe(2);
    expect(model.eventos[0].impactoMonetario).toBe(false);
    expect(model.eventos[1].impactoMonetario).toBe(false);
  });

  it('8. Eventos na mesma data devem ser ordenados deterministicamente por sequencial e ID', () => {
    const eAditivo2 = createEvent({
      id: 'EVT-TA-02',
      tipoEvento: 'ACRESCIMO',
      numeroSequencial: 2,
      dataPublicacao: '2026-05-10',
      variacaoValor: 3000.0
    });
    const eAditivo1 = createEvent({
      id: 'EVT-TA-01',
      tipoEvento: 'REAJUSTE',
      numeroSequencial: 1,
      dataPublicacao: '2026-05-10',
      variacaoValor: 2000.0
    });
    const eCelebracao = createEvent({
      id: 'EVT-CELEB',
      tipoEvento: 'CELEBRACAO',
      dataPublicacao: '2026-05-10'
    });

    // Passa fora de ordem
    const model = buildContractValueEvolutionModel(baseContract, [eAditivo2, eCelebracao, eAditivo1]);

    expect(model.eventos[0].tipoEvento).toBe('CELEBRACAO');
    expect(model.eventos[1].eventoId).toBe('EVT-TA-01');
    expect(model.eventos[2].eventoId).toBe('EVT-TA-02');
    expect(model.valorVigente).toBe(105000.0);
  });

  it('9. Precisão monetária estrita em centavos (evitar floating point drift)', () => {
    const e1 = createEvent({
      id: 'EVT-FLOAT-1',
      tipoEvento: 'REAJUSTE',
      dataPublicacao: '2026-02-01',
      variacaoValor: 0.1
    });
    const e2 = createEvent({
      id: 'EVT-FLOAT-2',
      tipoEvento: 'REAJUSTE',
      dataPublicacao: '2026-03-01',
      variacaoValor: 0.2
    });

    const model = buildContractValueEvolutionModel({ ...baseContract, valorInicial: 100.0 }, [e1, e2]);

    expect(model.deltaAcumulado).toBe(0.3);
    expect(model.valorVigente).toBe(100.3);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  it('10. Determinismo absoluto independente da ordem do array de entrada', () => {
    const e1 = createEvent({ id: 'E1', dataPublicacao: '2026-01-10', variacaoValor: 100.0 });
    const e2 = createEvent({ id: 'E2', dataPublicacao: '2026-02-10', variacaoValor: 200.0 });
    const e3 = createEvent({ id: 'E3', dataPublicacao: '2026-03-10', variacaoValor: -50.0 });

    const modelA = buildContractValueEvolutionModel(baseContract, [e1, e2, e3]);
    const modelB = buildContractValueEvolutionModel(baseContract, [e3, e1, e2]);

    expect(modelA).toEqual(modelB);
  });

  it('11. Lista vazia ou undefined não quebra a projeção', () => {
    const modelNull = buildContractValueEvolutionModel(baseContract, undefined as any);
    expect(modelNull.valorVigente).toBe(100000.0);
    expect(modelNull.eventos).toEqual([]);
  });

  it('12. Imutabilidade estrita dos arrays e objetos de entrada', () => {
    const originalContract = { ...baseContract };
    const e1 = createEvent({ id: 'E1', dataPublicacao: '2026-01-10', variacaoValor: 100.0 });
    const eventsArray = [e1];

    Object.freeze(originalContract);
    Object.freeze(e1);
    Object.freeze(eventsArray);

    expect(() => buildContractValueEvolutionModel(originalContract, eventsArray)).not.toThrow();
  });

  it('13. Derivação de delta a partir de valorPosterior e valorAnterior caso variacaoValor seja omitido', () => {
    const e = createEvent({
      id: 'EVT-POST-ANT',
      tipoEvento: 'REAJUSTE',
      dataPublicacao: '2026-06-01',
      valorAnterior: 100000.0,
      valorPosterior: 107500.0,
      variacaoValor: undefined
    });

    const model = buildContractValueEvolutionModel(baseContract, [e]);

    expect(model.deltaAcumulado).toBe(7500.0);
    expect(model.valorVigente).toBe(107500.0);
  });

  it('14. Isolamento Arquitetural: Não contaminação do saldo quantitativo da Ata nem de empenhos', () => {
    const eAcrescimo = createEvent({
      id: 'EVT-ISO',
      tipoEvento: 'ACRESCIMO',
      variacaoValor: 25000.0
    });

    const model = buildContractValueEvolutionModel(baseContract, [eAcrescimo]);

    // O modelo é puramente contratual
    expect(model.valorVigente).toBe(125000.0);
    // Não possui entidades nem campos de Ata / Empenhos
    expect((model as any).quantidadeAta).toBeUndefined();
    expect((model as any).empenhoId).toBeUndefined();
  });
});
