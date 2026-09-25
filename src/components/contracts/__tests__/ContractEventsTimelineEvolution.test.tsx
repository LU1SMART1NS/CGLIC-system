import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractEventsTimeline } from '../ContractEventsTimeline';
import { formatCurrencyBRL } from '../../../utils/ataGrouping';
import type { ContractDashboardRecord, ContractEvent } from '../../../types';

// Mock do hook useContractEvents para controle determinístico dos testes
vi.mock('../../../hooks/useContractEvents', () => ({
  useContractEvents: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null
  })
}));

describe('ContractEventsTimeline — Integração da Evolução do Valor Contratual (Fase 7.5-C2)', () => {
  const baseContract: ContractDashboardRecord = {
    id: 'CONTRATO::200331::00010::2026',
    numero: '10/2026',
    ano: 2026,
    numeroFormatado: '10/2026',
    uasg: '200331',
    objeto: 'Serviços de Manutenção Predial',
    fornecedorNome: 'EMPRESA PREDIAL LTDA',
    fornecedorCnpjCpf: '11.222.333/0001-44',
    valorInicial: 100000.0,
    valorGlobal: 100000.0,
    dataVigenciaInicio: '2026-01-01',
    dataVigenciaFim: '2027-01-01',
    statusVigencia: 'Vigente',
    fonteDados: 'PNCP'
  };

  const createEvent = (partial: Partial<ContractEvent>): ContractEvent => ({
    id: partial.id || `EVT::${Math.random()}`,
    contractKey: 'CONTRATO::200331::00010::2026',
    uasg: '200331',
    numeroContrato: '10/2026',
    anoContrato: 2026,
    tipoEvento: partial.tipoEvento || 'REAJUSTE',
    naturezaInstrumento: partial.naturezaInstrumento || 'TERMO_APOSTILAMENTO',
    identificadorOficial: partial.identificadorOficial || 'APOST-01/2026',
    descricao: partial.descricao || 'Reajuste anual',
    impacto: partial.impacto || 'ALTERA_VALOR',
    fonteOrigem: partial.fonteOrigem || 'PNCP',
    capturedAt: '2026-01-01T12:00:00Z',
    ...partial
  });

  it('1. Contrato sem eventos deve renderizar o painel executivo com valor original e indicação de ausência de aditamentos', () => {
    const html = renderToStaticMarkup(
      <ContractEventsTimeline contract={baseContract} eventsOverride={[]} />
    );

    expect(html).toContain('Evolução do Valor Contratual');
    expect(html).toContain('Valor Original (Celebração)');
    expect(html).toContain(formatCurrencyBRL(100000.0));
    expect(html).toContain('Sem aditamentos de valor registrados');
    expect(html).toContain('Ainda não há eventos contratuais registrados');
  });

  it('2. Contrato com evento positivo (Reajuste) renderiza valor original, variação com sinal positivo e valor vigente atualizado', () => {
    const reajuste = createEvent({
      id: 'EVT-01',
      tipoEvento: 'REAJUSTE',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      identificadorOficial: 'Apostilamento 01/2026',
      dataPublicacao: '2026-06-01',
      variacaoValor: 5500.0,
      impacto: 'ALTERA_VALOR'
    });

    const html = renderToStaticMarkup(
      <ContractEventsTimeline contract={baseContract} eventsOverride={[reajuste]} />
    );

    expect(html).toContain('Evolução do Valor Contratual');
    expect(html).toContain('1 alteração(ões) com impacto monetário');
    expect(html).toContain(formatCurrencyBRL(100000.0)); // Original
    expect(html).toContain(`+ ${formatCurrencyBRL(5500.0)}`); // Variação
    expect(html).toContain('(+5.50%)'); // Percentual
    expect(html).toContain(formatCurrencyBRL(105500.0)); // Valor Vigente
    expect(html).toContain(`+${formatCurrencyBRL(5500.0)}`); // Delta no card
  });

  it('3. Contrato com evento negativo (Supressão) renderiza variação com sinal negativo e valor vigente reduzido', () => {
    const supressao = createEvent({
      id: 'EVT-02',
      tipoEvento: 'SUPRESSAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      identificadorOficial: '1º Termo Aditivo',
      dataPublicacao: '2026-07-01',
      variacaoValor: 10000.0,
      impacto: 'ALTERA_VALOR'
    });

    const html = renderToStaticMarkup(
      <ContractEventsTimeline contract={baseContract} eventsOverride={[supressao]} />
    );

    expect(html).toContain(`- ${formatCurrencyBRL(10000.0)}`); // Variação negativa
    expect(html).toContain('(-10.00%)');
    expect(html).toContain(formatCurrencyBRL(90000.0)); // Vigente resultante
    expect(html).toContain(`Supressões: -${formatCurrencyBRL(10000.0)}`);
  });

  it('4. Múltiplos eventos combinados (Acréscimo + Supressão + Reajuste) compõem a síntese analítica', () => {
    const eventos = [
      createEvent({
        id: 'E1',
        tipoEvento: 'ACRESCIMO',
        numeroSequencial: 1,
        dataPublicacao: '2026-03-01',
        variacaoValor: 20000.0
      }),
      createEvent({
        id: 'E2',
        tipoEvento: 'SUPRESSAO',
        numeroSequencial: 2,
        dataPublicacao: '2026-06-01',
        variacaoValor: 5000.0
      }),
      createEvent({
        id: 'E3',
        tipoEvento: 'REAJUSTE',
        numeroSequencial: 3,
        dataPublicacao: '2026-09-01',
        variacaoValor: 3000.0
      })
    ];

    const html = renderToStaticMarkup(
      <ContractEventsTimeline contract={baseContract} eventsOverride={eventos} />
    );

    // 100.000 + 20.000 - 5.000 + 3.000 = 118.000 (+18%)
    expect(html).toContain(`+ ${formatCurrencyBRL(18000.0)}`);
    expect(html).toContain('(+18.00%)');
    expect(html).toContain(formatCurrencyBRL(118000.0));
    expect(html).toContain(`Acréscimos: +${formatCurrencyBRL(20000.0)}`);
    expect(html).toContain(`Supressões: -${formatCurrencyBRL(5000.0)}`);
    expect(html).toContain(`Reajustes: +${formatCurrencyBRL(3000.0)}`);
  });

  it('5. Eventos puramente temporais (Prorrogação) não geram deltas monetários fictícios', () => {
    const prorrogacao = createEvent({
      id: 'E-PRORR',
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      identificadorOficial: '1º Termo Aditivo',
      dataPublicacao: '2026-11-01',
      impacto: 'ALTERA_VIGENCIA',
      vigenciaPosterior: '2028-01-01',
      variacaoValor: 0
    });

    const html = renderToStaticMarkup(
      <ContractEventsTimeline contract={baseContract} eventsOverride={[prorrogacao]} />
    );

    expect(html).toContain(formatCurrencyBRL(100000.0)); // Original
    expect(html).toContain(formatCurrencyBRL(100000.0)); // Vigente
    expect(html).toContain('Sem aditamentos de valor registrados');
    expect(html).not.toContain('Delta:</strong>');
    expect(html).toContain('Altera Vigência');
  });

  it('6. Renderização responsiva e sem duplicidade de timeline', () => {
    const html = renderToStaticMarkup(
      <ContractEventsTimeline contract={baseContract} eventsOverride={[]} />
    );

    // Deve conter exatamente uma única seção de evolução de valor
    const matches = html.match(/data-testid="contract-value-evolution-section"/g);
    expect(matches).toHaveLength(1);
  });
});
