import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagementExecutiveKPIs } from '../ManagementExecutiveKPIs';
import { ManagementKpiCard } from '../ManagementKpiCard';
import * as managementHookModule from '../../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../../types/managementDashboard';

vi.mock('../../../hooks/useManagementDashboard', () => ({
  useManagementDashboard: vi.fn()
}));

const mockFullReadModel: ManagementDashboardReadModel = {
  uasg: '200331',
  dataCalculo: '2026-09-24T12:00:00Z',
  executive: {
    totalContratos: 45,
    contratosAtivos: 38,
    contratosEncerrados: 7,
    contratosEmProrrogacao: 5,
    valorOriginalTotal: 10000000,
    valorVigenteTotal: 12500000,
    deltaAcumuladoTotal: 2500000,
    percentualVariacaoAcumulada: 25.00
  },
  deadlines: {
    vencendo30Dias: 2,
    vencendo60Dias: 4,
    vencendo90Dias: 6,
    contratosVencidos: 1,
    prorrogaçõesEmCurso: 3,
    itensVencendo: []
  },
  attention: {
    totalAlertasAtivos: 5,
    criticalCount: 2,
    overdueTasksCount: 1,
    upcomingTasksCount: 2,
    paymentAlertsCount: 1,
    reajusteAlertsCount: 1,
    atasCriticasCount: 1,
    radarsReajuste: [],
    radarsUrgentesCount: 2,
    pagamentosCriticosCount: 1,
    tarefasVencidasCount: 1,
    prazosKpis: {
      total: 10,
      atrasadas: 1,
      venceHoje: 0,
      proximos7Dias: 2,
      proximos30Dias: 3,
      futuras: 4,
      concluidas: 0
    },
    items: []
  },
  financial: {
    totalEmpenhado: 8000000,
    totalLiquidado: 6000000,
    totalPago: 4800000,
    saldoALiquidar: 2000000,
    saldoAPagar: 1200000,
    saldoNaoExecutado: 3200000,
    totalRpInscrito: 500000,
    totalRpPago: 200000,
    saldoRpPendente: 300000,
    taxaLiquidacaoPercentual: 75.00,
    taxaPagamentoPercentual: 80.00,
    burnRateMensalDisponivel: false
  },
  arp: {
    totalAtas: 12,
    totalItens: 48,
    itensCriticosCount: 3,
    topItensConsumidos: []
  },
  payments: {
    totalCiclos: 15,
    ciclosAbertosCount: 5,
    ciclosConcluidosCount: 10,
    ciclosCriticosCount: 2,
    ciclosAtrasoCgofiCount: 1,
    ciclosRecentes: [],
    tempoMedioCgofiDisponivel: false
  }
};

describe('ManagementExecutiveKPIs Component (SaldoARP 3.0 — Fase 8-C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar os quatro KPIs da primeira dobra com dados consolidados', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockFullReadModel,
      data: mockFullReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<ManagementExecutiveKPIs uasg="200331" />);

    // Título da seção
    expect(html).toContain('Visão Executiva Global');
    expect(html).toContain('UASG 200331');

    // 4 títulos de KPIs
    expect(html).toContain('Contratos Ativos');
    expect(html).toContain('Valor Global Vigente');
    expect(html).toContain('Variação Acumulada');
    expect(html).toContain('Execução Financeira');
  });

  it('2. deve exibir KPI 1 (Contratos Ativos) com valores e prorrogações corretos', () => {
    const html = renderToStaticMarkup(
      <ManagementExecutiveKPIs readModel={mockFullReadModel} isLoading={false} isError={false} />
    );

    expect(html).toContain('38');
    expect(html).toContain('vigentes');
    expect(html).toContain('Total de <strong>45</strong> contratos (7 encerrados)');
    expect(html).toContain('<strong>5</strong> com prorrogação vigente');
  });

  it('3. deve exibir KPI 2 (Valor Global Vigente) formatado em BRL estritamente contratual', () => {
    const html = renderToStaticMarkup(
      <ManagementExecutiveKPIs readModel={mockFullReadModel} isLoading={false} isError={false} />
    );

    expect(html).toContain('12.500.000,00');
    expect(html).toContain('Valor original base: <strong>');
    expect(html).toContain('10.000.000,00');
  });

  it('4. deve exibir KPI 3 (Variação Acumulada) com sinal positivo e percentual correto', () => {
    const html = renderToStaticMarkup(
      <ManagementExecutiveKPIs readModel={mockFullReadModel} isLoading={false} isError={false} />
    );

    expect(html).toContain('+');
    expect(html).toContain('2.500.000,00');
    expect(html).toContain('+25,00%');
    expect(html).toContain('Impacto monetário acumulado de aditamentos e apostilamentos');
  });

  it('5. deve exibir KPI 3 com sinal negativo quando houver supressão líquida', () => {
    const negativeReadModel: ManagementDashboardReadModel = {
      ...mockFullReadModel,
      executive: {
        ...mockFullReadModel.executive,
        valorOriginalTotal: 1000000,
        valorVigenteTotal: 900000,
        deltaAcumuladoTotal: -100000,
        percentualVariacaoAcumulada: -10.00
      }
    };

    const html = renderToStaticMarkup(
      <ManagementExecutiveKPIs readModel={negativeReadModel} isLoading={false} isError={false} />
    );

    expect(html).toContain('-');
    expect(html).toContain('100.000,00');
    expect(html).toContain('-10,00%');
  });

  it('6. deve exibir KPI 4 (Execução Financeira) com progressão Empenhado -> Liquidado -> Pago', () => {
    const html = renderToStaticMarkup(
      <ManagementExecutiveKPIs readModel={mockFullReadModel} isLoading={false} isError={false} />
    );

    expect(html).toContain('4.800.000,00');
    expect(html).toContain('pagos');
    expect(html).toContain('Empenhado');
    expect(html).toContain('Liquidado');
    expect(html).toContain('Pago');
    expect(html).toContain('8.000.000,00'); // Empenhado
    expect(html).toContain('6.000.000,00'); // Liquidado
    expect(html).toContain('Liq: <strong>75%</strong>');
    expect(html).toContain('Pago/Liq: <strong>80%</strong>');
    expect(html).toContain('Fontes oficiais: SIAFI / Contratos.gov');
  });

  it('7. deve renderizar skeletons de loading sem exibir 0 ou R$ 0,00', () => {
    const html = renderToStaticMarkup(
      <ManagementExecutiveKPIs isLoading={true} isError={false} readModel={null} />
    );

    expect(html).toContain('management-kpi-card animate-pulse');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Carregando Contratos Ativos');
    expect(html).toContain('Carregando Valor Global Vigente');
    expect(html).toContain('Carregando Variação Acumulada');
    expect(html).toContain('Carregando Execução Financeira');
    // Não deve exibir zeros nus
    expect(html).not.toContain('>0<');
  });

  it('8. deve renderizar estado de erro explícito com role="alert" sem exibir zero', () => {
    const html = renderToStaticMarkup(
      <ManagementExecutiveKPIs
        isLoading={false}
        isError={true}
        error={new Error('Falha de conexão com a API oficial')}
        readModel={null}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Falha de conexão com a API oficial');
    expect(html).not.toContain('R$ 0,00');
  });

  it('9. deve exibir estado vazio explícito quando não houver contratos', () => {
    const emptyModel: ManagementDashboardReadModel = {
      ...mockFullReadModel,
      executive: {
        totalContratos: 0,
        contratosAtivos: 0,
        contratosEncerrados: 0,
        contratosEmProrrogacao: 0,
        valorOriginalTotal: 0,
        valorVigenteTotal: 0,
        deltaAcumuladoTotal: 0,
        percentualVariacaoAcumulada: 0
      }
    };

    const html = renderToStaticMarkup(
      <ManagementExecutiveKPIs isLoading={false} isError={false} readModel={emptyModel} />
    );

    expect(html).toContain('Nenhum contrato cadastrado');
    expect(html).toContain('Sem valores vigentes');
    expect(html).toContain('Sem aditamentos de valor');
  });

  it('10. ManagementKpiCard componente isolado deve suportar variants e acessibilidade', () => {
    const html = renderToStaticMarkup(
      <ManagementKpiCard
        title="Indicador Teste"
        value="42"
        unit="unidades"
        variant="warning"
        description="Descrição de teste"
        ariaLabel="Indicador Teste: 42 unidades"
      />
    );

    expect(html).toContain('Indicador Teste');
    expect(html).toContain('42');
    expect(html).toContain('unidades');
    expect(html).toContain('Descrição de teste');
    expect(html).toContain('aria-label="Indicador Teste: 42 unidades"');
  });
});
