import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialExecutionRoute } from '../FinancialExecutionRoute';
import * as managementHookModule from '../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../types/managementDashboard';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/empenhos' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

vi.mock('../../hooks/useManagementDashboard', () => ({
  useManagementDashboard: vi.fn()
}));

const mockFinancialReadModel: ManagementDashboardReadModel = {
  uasg: '200331',
  dataCalculo: '2026-09-24T12:00:00Z',
  executive: {
    totalContratos: 10,
    contratosAtivos: 8,
    contratosEncerrados: 2,
    contratosEmProrrogacao: 1,
    valorOriginalTotal: 5000000,
    valorVigenteTotal: 5500000,
    deltaAcumuladoTotal: 500000,
    percentualVariacaoAcumulada: 10
  },
  deadlines: {
    vencendo30Dias: 0,
    vencendo60Dias: 1,
    vencendo90Dias: 2,
    contratosVencidos: 0,
    prorrogaçõesEmCurso: 1,
    itensVencendo: []
  },
  attention: {
    totalAlertasAtivos: 1,
    criticalCount: 0,
    overdueTasksCount: 0,
    upcomingTasksCount: 0,
    paymentAlertsCount: 0,
    reajusteAlertsCount: 0,
    atasCriticasCount: 0,
    radarsReajuste: [],
    radarsUrgentesCount: 0,
    pagamentosCriticosCount: 0,
    tarefasVencidasCount: 0,
    prazosKpis: {} as any,
    items: []
  },
  financial: {
    totalEmpenhado: 4000000,
    totalLiquidado: 2800000,
    totalPago: 2400000,
    saldoALiquidar: 1200000,
    saldoAPagar: 400000,
    saldoNaoExecutado: 1600000,
    totalRpInscrito: 300000,
    totalRpPago: 100000,
    saldoRpPendente: 200000,
    rppInscrito: 200000,
    rppPago: 80000,
    rpnpInscrito: 100000,
    rpnpPago: 20000,
    taxaLiquidacaoPercentual: 70.00,
    taxaPagamentoPercentual: 85.71,
    taxaPagamentoSobreEmpenhadoPercentual: 60.00,
    topEmpenhos: [
      {
        empenhoKey: '2026NE000500',
        numeroEmpenho: '2026NE000500',
        ano: 2026,
        contratoNumero: '12/2025',
        fornecedorNome: 'Empresa Delta Serviços Ltda',
        valorEmpenhado: 2500000,
        valorLiquidado: 1750000,
        valorPago: 1500000,
        saldoALiquidar: 750000,
        saldoAPagar: 250000,
        saldoNaoExecutado: 1000000,
        percentualExecutado: 60.00
      }
    ],
    burnRateMensalDisponivel: false
  },
  arp: {
    totalAtas: 2,
    totalItens: 8,
    itensCriticosCount: 0,
    topItensConsumidos: []
  },
  payments: {
    totalCiclos: 2,
    ciclosAbertosCount: 1,
    ciclosConcluidosCount: 1,
    ciclosCriticosCount: 0,
    ciclosAtrasoCgofiCount: 0,
    ciclosRecentes: [],
    tempoMedioCgofiDisponivel: false
  }
};

describe('FinancialExecutionRoute — FASE 9-I: Empenhos & Execução', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar a página com título padronizado e botão de atualizar', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockFinancialReadModel,
      data: mockFinancialReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<FinancialExecutionRoute />);

    expect(html).toContain('Empenhos e Execução');
    expect(html).toContain('Execução financeira oficial dos empenhos, liquidações e pagamentos');
    expect(html).toContain('Atualizar');
  });

  it('2. deve encapsular o ManagementFinancialExecution e renderizar o funil e os saldos', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockFinancialReadModel,
      data: mockFinancialReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<FinancialExecutionRoute />);

    // Funil
    expect(html).toContain('4.000.000,00'); // Empenhado
    expect(html).toContain('2.800.000,00'); // Liquidado
    expect(html).toContain('2.400.000,00'); // Pago

    // Saldos
    expect(html).toContain('Saldo a Liquidar');
    expect(html).toContain('1.200.000,00');
    expect(html).toContain('Saldo a Pagar');
    expect(html).toContain('400.000,00');
    expect(html).toContain('Saldo Não Executado');
    expect(html).toContain('1.600.000,00');

    // Tabela
    expect(html).toContain('2026NE000500');
    expect(html).toContain('Empresa Delta Serviços Ltda');
    expect(html).toContain('Contrato 12/2025');
    expect(html).toContain('Contrato 360°');
  });
});
