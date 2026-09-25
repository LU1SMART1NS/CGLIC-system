import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagementContractsOverview } from '../ManagementContractsOverview';
import * as managementHookModule from '../../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../../types/managementDashboard';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../../hooks/useManagementDashboard', () => ({
  useManagementDashboard: vi.fn()
}));

const mockContractsReadModel: ManagementDashboardReadModel = {
  uasg: '200331',
  dataCalculo: '2026-09-24T12:00:00Z',
  executive: {
    totalContratos: 25,
    contratosAtivos: 22,
    contratosEncerrados: 3,
    contratosEmProrrogacao: 4,
    valorOriginalTotal: 12000000,
    valorVigenteTotal: 13500000,
    deltaAcumuladoTotal: 1500000,
    percentualVariacaoAcumulada: 12.50
  },
  deadlines: {
    vencendo30Dias: 2,
    vencendo60Dias: 5,
    vencendo90Dias: 8,
    contratosVencidos: 1,
    prorrogaçõesEmCurso: 4,
    itensVencendo: [
      {
        contractKey: '200331-00010-2025',
        numeroContrato: 'Contrato 10/2025',
        anoContrato: 2025,
        fornecedorNome: 'Empresa Alfa Serviços Ltda',
        dataVigenciaFim: '2026-10-15',
        diasRestantes: 21,
        faixa: '30D'
      },
      {
        contractKey: '200331-00020-2025',
        numeroContrato: 'Contrato 20/2025',
        anoContrato: 2025,
        fornecedorNome: 'Beta Tecnologia S/A',
        dataVigenciaFim: '2026-11-20',
        diasRestantes: 57,
        faixa: '60D'
      },
      {
        contractKey: '200331-00030-2024',
        numeroContrato: 'Contrato 30/2024',
        anoContrato: 2024,
        fornecedorNome: 'Gama Engenharia Eireli',
        dataVigenciaFim: '2026-08-30',
        diasRestantes: -25,
        faixa: 'VENCIDO'
      }
    ]
  },
  attention: {
    totalAlertasAtivos: 3,
    criticalCount: 1,
    overdueTasksCount: 1,
    upcomingTasksCount: 1,
    paymentAlertsCount: 0,
    reajusteAlertsCount: 1,
    atasCriticasCount: 0,
    radarsReajuste: [
      {
        id: 'ALERT::ANIVERSARIO_REAJUSTE::200331-00010-2025::1',
        contractKey: '200331-00010-2025',
        numeroContrato: '10',
        anoContrato: 2025,
        ciclo: 1,
        dataBase: '2025-10-15',
        origemDataBase: 'ASSINATURA',
        dataAniversario: '2026-10-15',
        diasRestantes: 21,
        nivel: 'URGENTE',
        titulo: 'Marco de 1 ano de Aniversário Contratual',
        descricao: 'Análise de reajuste preventivo',
        recomendacao: 'Instruir processo administrativo'
      }
    ],
    radarsUrgentesCount: 1,
    pagamentosCriticosCount: 0,
    tarefasVencidasCount: 1,
    prazosKpis: {
      total: 10,
      atrasadas: 1,
      venceHoje: 0,
      proximos7Dias: 1,
      proximos30Dias: 2,
      futuras: 6,
      concluidas: 0
    },
    items: []
  },
  financial: {
    totalEmpenhado: 7000000,
    totalLiquidado: 5000000,
    totalPago: 4000000,
    saldoALiquidar: 2000000,
    saldoAPagar: 1000000,
    saldoNaoExecutado: 3000000,
    totalRpInscrito: 0,
    totalRpPago: 0,
    saldoRpPendente: 0,
    taxaLiquidacaoPercentual: 71.43,
    taxaPagamentoPercentual: 80,
    burnRateMensalDisponivel: false
  },
  arp: {
    totalAtas: 6,
    totalItens: 24,
    itensCriticosCount: 0,
    topItensConsumidos: []
  },
  payments: {
    totalCiclos: 8,
    ciclosAbertosCount: 3,
    ciclosConcluidosCount: 5,
    ciclosCriticosCount: 0,
    ciclosAtrasoCgofiCount: 0,
    ciclosRecentes: [],
    tempoMedioCgofiDisponivel: false
  }
};

describe('ManagementContractsOverview Component (SaldoARP 3.0 — Fase 8-E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar a seção Contratos & Reajustes com cabeçalho, métricas e valores consolidados', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockContractsReadModel,
      data: mockContractsReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<ManagementContractsOverview uasg="200331" />);

    expect(html).toContain('Contratos &amp; Reajustes');
    expect(html).toContain('25 contratos');
    expect(html).toContain('13.500.000,00'); // Valor Vigente
    expect(html).toContain('1.500.000,00'); // Variação
    expect(html).toContain('+12,50%');
  });

  it('2. deve exibir os 4 cards de métricas de vigência e radar corretamente', () => {
    const html = renderToStaticMarkup(
      <ManagementContractsOverview readModel={mockContractsReadModel} isLoading={false} isError={false} />
    );

    // Vigência Ativa
    expect(html).toContain('Vigência Ativa');
    expect(html).toContain('22');
    expect(html).toContain('3 encerrados');

    // Vencendo ≤ 30d
    expect(html).toContain('Vencendo em ≤ 30d');
    expect(html).toContain('2');

    // Vencendo ≤ 90d
    expect(html).toContain('Vencendo em ≤ 90d');
    expect(html).toContain('8');

    // Radar de Reajuste
    expect(html).toContain('Radar de Reajuste');
    expect(html).toContain('1');
    expect(html).toContain('1 urgentes (marco 1 ano)');
  });

  it('3. deve listar os contratos em monitoramento com informações de vigência, fornecedor e radar', () => {
    const html = renderToStaticMarkup(
      <ManagementContractsOverview readModel={mockContractsReadModel} isLoading={false} isError={false} />
    );

    // Contrato 10/2025
    expect(html).toContain('Contrato 10/2025');
    expect(html).toContain('Empresa Alfa Serviços Ltda');
    expect(html).toContain('21 dias de vigência');
    expect(html).toContain('Radar: 21d');
    expect(html).toContain('15/10/2026');

    // Contrato 20/2025
    expect(html).toContain('Contrato 20/2025');
    expect(html).toContain('Beta Tecnologia S/A');
    expect(html).toContain('57 dias de vigência');

    // Contrato 30/2024
    expect(html).toContain('Contrato 30/2024');
    expect(html).toContain('Vencido');

    // Botão de navegação para Contrato 360°
    expect(html).toContain('Ver Contrato 360°');
    expect(html).toContain('aria-label="Ver Contrato 360 do contrato Contrato 10/2025"');
  });

  it('4. deve renderizar skeleton de loading sem exibir valores 0 artificiais', () => {
    const html = renderToStaticMarkup(
      <ManagementContractsOverview isLoading={true} isError={false} readModel={null} />
    );

    expect(html).toContain('management-contracts-overview animate-pulse');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Carregando visão geral de contratos e reajustes');
    expect(html).not.toContain('25 contratos');
  });

  it('5. deve renderizar estado de erro explícito com role="alert"', () => {
    const html = renderToStaticMarkup(
      <ManagementContractsOverview
        isLoading={false}
        isError={true}
        errorMessage="Falha de comunicação com o serviço de contratos"
        readModel={null}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Contratos &amp; Reajustes — Erro ao carregar carteira contratual');
    expect(html).toContain('Falha de comunicação com o serviço de contratos');
  });

  it('6. deve renderizar estado vazio explícito quando não houver contratos', () => {
    const emptyModel: ManagementDashboardReadModel = {
      ...mockContractsReadModel,
      executive: {
        totalContratos: 0,
        contratosAtivos: 0,
        contratosEncerrados: 0,
        contratosEmProrrogacao: 0,
        valorOriginalTotal: 0,
        valorVigenteTotal: 0,
        deltaAcumuladoTotal: 0,
        percentualVariacaoAcumulada: 0
      },
      deadlines: {
        vencendo30Dias: 0,
        vencendo60Dias: 0,
        vencendo90Dias: 0,
        contratosVencidos: 0,
        prorrogaçõesEmCurso: 0,
        itensVencendo: []
      }
    };

    const html = renderToStaticMarkup(
      <ManagementContractsOverview isLoading={false} isError={false} readModel={emptyModel} />
    );

    expect(html).toContain('Nenhum contrato cadastrado para esta UASG.');
    expect(html).toContain('Não foram localizados contratos oficiais ou manuais para exibição de vigências e reajustes.');
  });
});
