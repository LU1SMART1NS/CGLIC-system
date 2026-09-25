import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagementFinancialExecution } from '../ManagementFinancialExecution';
import * as managementHookModule from '../../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../../types/managementDashboard';

vi.mock('../../../hooks/useManagementDashboard', () => ({
  useManagementDashboard: vi.fn()
}));

const mockFinancialReadModel: ManagementDashboardReadModel = {
  uasg: '200331',
  dataCalculo: '2026-09-24T12:00:00Z',
  executive: {
    totalContratos: 15,
    contratosAtivos: 12,
    contratosEncerrados: 3,
    contratosEmProrrogacao: 2,
    valorOriginalTotal: 8000000,
    valorVigenteTotal: 9000000,
    deltaAcumuladoTotal: 1000000,
    percentualVariacaoAcumulada: 12.50
  },
  deadlines: {
    vencendo30Dias: 1,
    vencendo60Dias: 2,
    vencendo90Dias: 4,
    contratosVencidos: 0,
    prorrogaçõesEmCurso: 2,
    itensVencendo: []
  },
  attention: {
    totalAlertasAtivos: 2,
    criticalCount: 1,
    overdueTasksCount: 1,
    upcomingTasksCount: 0,
    paymentAlertsCount: 0,
    reajusteAlertsCount: 0,
    atasCriticasCount: 0,
    radarsReajuste: [],
    radarsUrgentesCount: 0,
    pagamentosCriticosCount: 0,
    tarefasVencidasCount: 1,
    prazosKpis: {
      total: 5,
      atrasadas: 1,
      venceHoje: 0,
      proximos7Dias: 0,
      proximos30Dias: 1,
      futuras: 3,
      concluidas: 0
    },
    items: []
  },
  financial: {
    totalEmpenhado: 5000000,
    totalLiquidado: 3500000,
    totalPago: 2800000,
    saldoALiquidar: 1500000,
    saldoAPagar: 700000,
    saldoNaoExecutado: 2200000,
    totalRpInscrito: 400000,
    totalRpPago: 150000,
    saldoRpPendente: 250000,
    rppInscrito: 250000,
    rppPago: 100000,
    rpnpInscrito: 150000,
    rpnpPago: 50000,
    taxaLiquidacaoPercentual: 70.00,
    taxaPagamentoPercentual: 80.00,
    taxaPagamentoSobreEmpenhadoPercentual: 56.00,
    topEmpenhos: [
      {
        empenhoKey: '2026NE000100',
        numeroEmpenho: '2026NE000100',
        ano: 2026,
        contratoNumero: '10/2025',
        fornecedorNome: 'Empresa Alfa Ltda',
        valorEmpenhado: 3000000,
        valorLiquidado: 2100000,
        valorPago: 1800000,
        saldoALiquidar: 900000,
        saldoAPagar: 300000,
        saldoNaoExecutado: 1200000,
        percentualExecutado: 60.00
      },
      {
        empenhoKey: '2026NE000200',
        numeroEmpenho: '2026NE000200',
        ano: 2026,
        contratoNumero: '20/2025',
        fornecedorNome: 'Beta Serviços S/A',
        valorEmpenhado: 2000000,
        valorLiquidado: 1400000,
        valorPago: 1000000,
        saldoALiquidar: 600000,
        saldoAPagar: 400000,
        saldoNaoExecutado: 1000000,
        percentualExecutado: 50.00
      }
    ],
    burnRateMensalDisponivel: false
  },
  arp: {
    totalAtas: 4,
    totalItens: 16,
    itensCriticosCount: 0,
    topItensConsumidos: []
  },
  payments: {
    totalCiclos: 4,
    ciclosAbertosCount: 1,
    ciclosConcluidosCount: 3,
    ciclosCriticosCount: 0,
    ciclosAtrasoCgofiCount: 0,
    ciclosRecentes: [],
    tempoMedioCgofiDisponivel: false
  }
};

describe('ManagementFinancialExecution Component (SaldoARP 3.0 — Fase 9-I)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar a seção de execução financeira com funil (Empenhado -> Liquidado -> Pago)', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockFinancialReadModel,
      data: mockFinancialReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<ManagementFinancialExecution uasg="200331" />);

    expect(html).toContain('Execução Orçamentária e Financeira Oficial');
    expect(html).toContain('SIAFI / Contratos.gov');

    // Funil
    expect(html).toContain('5.000.000,00'); // Empenhado
    expect(html).toContain('3.500.000,00'); // Liquidado
    expect(html).toContain('2.800.000,00'); // Pago
    expect(html).toContain('70%');          // Taxa Liquidação
    expect(html).toContain('80%');          // Taxa Pagamento
  });

  it('2. deve exibir os 4 cards de saldos canônicos e restos a pagar', () => {
    const html = renderToStaticMarkup(
      <ManagementFinancialExecution readModel={mockFinancialReadModel} isLoading={false} isError={false} />
    );

    // Saldo a Liquidar
    expect(html).toContain('Saldo a Liquidar');
    expect(html).toContain('1.500.000,00');

    // Saldo a Pagar
    expect(html).toContain('Saldo a Pagar');
    expect(html).toContain('700.000,00');

    // Saldo Não Executado
    expect(html).toContain('Saldo Não Executado');
    expect(html).toContain('2.200.000,00');

    // Restos a Pagar
    expect(html).toContain('Restos a Pagar (RP)');
    expect(html).toContain('250.000,00');
    expect(html).toContain('400.000,00'); // Inscrito
    expect(html).toContain('150.000,00'); // Pago
  });

  it('3. deve listar os empenhos detalhados na tabela com contratos vinculados', () => {
    const html = renderToStaticMarkup(
      <ManagementFinancialExecution
        readModel={mockFinancialReadModel}
        isLoading={false}
        isError={false}
        onNavigateContract={() => {}}
      />
    );

    // Empenho 1
    expect(html).toContain('2026NE000100');
    expect(html).toContain('Contrato 10/2025');
    expect(html).toContain('3.000.000,00');
    expect(html).toContain('2.100.000,00');
    expect(html).toContain('1.800.000,00');
    expect(html).toContain('60%');

    // Empenho 2
    expect(html).toContain('2026NE000200');
    expect(html).toContain('Contrato 20/2025');
    expect(html).toContain('2.000.000,00');
    expect(html).toContain('1.400.000,00');
    expect(html).toContain('1.000.000,00');
    expect(html).toContain('50%');

    // Botões de drill-down para Contrato 360°
    expect(html).toContain('Contrato 360°');
  });

  it('4. deve renderizar skeleton de loading sem exibir números 0 artificiais', () => {
    const html = renderToStaticMarkup(
      <ManagementFinancialExecution isLoading={true} isError={false} readModel={null} />
    );

    expect(html).toContain('management-financial-execution animate-pulse');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Carregando execução orçamentária e financeira detalhada');
    expect(html).not.toContain('5.000.000,00');
  });

  it('5. deve renderizar estado de erro explícito com role="alert"', () => {
    const html = renderToStaticMarkup(
      <ManagementFinancialExecution
        isLoading={false}
        isError={true}
        errorMessage="Falha de conexão com a view de empenhos"
        readModel={null}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Execução Financeira — Erro ao carregar dados oficiais');
    expect(html).toContain('Falha de conexão com a view de empenhos');
  });

  it('6. deve renderizar estado vazio explícito quando não houver empenhos', () => {
    const emptyModel: ManagementDashboardReadModel = {
      ...mockFinancialReadModel,
      financial: {
        totalEmpenhado: 0,
        totalLiquidado: 0,
        totalPago: 0,
        saldoALiquidar: 0,
        saldoAPagar: 0,
        saldoNaoExecutado: 0,
        totalRpInscrito: 0,
        totalRpPago: 0,
        saldoRpPendente: 0,
        taxaLiquidacaoPercentual: 0,
        taxaPagamentoPercentual: 0,
        topEmpenhos: [],
        burnRateMensalDisponivel: false
      }
    };

    const html = renderToStaticMarkup(
      <ManagementFinancialExecution isLoading={false} isError={false} readModel={emptyModel} />
    );

    expect(html).toContain('Não há execução financeira disponível para o período selecionado.');
    expect(html).toContain('Nenhum registro oficial de empenho ou pagamento foi localizado na base SIAFI/Contratos.gov.');
  });

  it('7. deve conter campo de busca textual e chips de filtro de empenhos', () => {
    const html = renderToStaticMarkup(
      <ManagementFinancialExecution readModel={mockFinancialReadModel} isLoading={false} isError={false} />
    );

    expect(html).toContain('data-testid="empenhos-search-input"');
    expect(html).toContain('Buscar empenho, credor, contrato...');
    expect(html).toContain('data-testid="empenhos-filter-todos"');
    expect(html).toContain('data-testid="empenhos-filter-com-saldo"');
    expect(html).toContain('data-testid="empenhos-filter-executados"');
  });

  it('8. deve conter nota de conformidade contábil e referência a v_empenhos_resumo', () => {
    const html = renderToStaticMarkup(
      <ManagementFinancialExecution readModel={mockFinancialReadModel} isLoading={false} isError={false} />
    );

    expect(html).toContain('Nota de Conformidade Contábil:');
    expect(html).toContain('v_empenhos_resumo');
    expect(html).toContain('v_arp_item_saldo_detalhado');
  });
});
