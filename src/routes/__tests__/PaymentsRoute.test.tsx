import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentsRoute } from '../PaymentsRoute';
import * as managementHookModule from '../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../types/managementDashboard';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/pagamentos' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

vi.mock('../../hooks/useManagementDashboard', () => ({
  useManagementDashboard: vi.fn()
}));

describe('PaymentsRoute — FASE 9-H: Pagamentos / Faturamento & CGOFI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockPaymentsReadModel: ManagementDashboardReadModel = {
    uasg: '200331',
    dataCalculo: '2026-09-24T10:00:00.000Z',
    executive: {
      totalContratos: 5,
      contratosAtivos: 4,
      contratosEncerrados: 1,
      contratosEmProrrogacao: 0,
      valorOriginalTotal: 1000000,
      valorVigenteTotal: 1100000,
      deltaAcumuladoTotal: 100000,
      percentualVariacaoAcumulada: 10
    },
    deadlines: {
      vencendo30Dias: 0,
      vencendo60Dias: 0,
      vencendo90Dias: 0,
      contratosVencidos: 0,
      prorrogaçõesEmCurso: 0,
      itensVencendo: []
    },
    attention: {
      totalAlertasAtivos: 2,
      criticalCount: 1,
      overdueTasksCount: 0,
      upcomingTasksCount: 0,
      paymentAlertsCount: 1,
      reajusteAlertsCount: 0,
      atasCriticasCount: 0,
      radarsReajuste: [],
      radarsUrgentesCount: 0,
      pagamentosCriticosCount: 1,
      tarefasVencidasCount: 0,
      prazosKpis: {} as any,
      items: []
    },
    financial: {
      totalEmpenhado: 500000,
      totalLiquidado: 300000,
      totalPago: 200000,
      saldoALiquidar: 200000,
      saldoAPagar: 100000,
      saldoNaoExecutado: 300000,
      totalRpInscrito: 0,
      totalRpPago: 0,
      saldoRpPendente: 0,
      taxaLiquidacaoPercentual: 60,
      taxaPagamentoPercentual: 66.67,
      burnRateMensalDisponivel: false
    },
    arp: {
      totalAtas: 2,
      totalItens: 4,
      itensCriticosCount: 0,
      topItensConsumidos: []
    },
    payments: {
      totalCiclos: 2,
      ciclosAbertosCount: 1,
      ciclosConcluidosCount: 1,
      ciclosCriticosCount: 1,
      ciclosAtrasoCgofiCount: 0,
      faturasVencidasCount: 1,
      faturasVenceHojeCount: 0,
      faturasProximasVencimentoCount: 0,
      envioCgofiAtrasadoCount: 0,
      documentacaoPendenteCount: 1,
      margemEnvioEstreitaCount: 0,
      distribuicaoPorEstado: {
        RECEBIDO: 0,
        ATRIBUIDO: 0,
        EM_INSTRUCAO: 0,
        PENDENTE_DOCUMENTACAO: 1,
        DESPACHO_ELABORADO: 0,
        ENVIADO_CGOFI: 0,
        AGUARDANDO_CGOFI: 0,
        DEVOLVIDO_FISCAL: 0,
        PAGAMENTO_CONFIRMADO: 1,
        CONCLUIDO: 0,
        CANCELADO: 0
      },
      ciclosRecentes: [],
      ciclosAbertosDetalhe: [
        {
          cycleKey: '102025-PGTO-202609-NF100',
          contractKey: '102025',
          competencia: '2026-09',
          status: 'PENDENTE_DOCUMENTACAO',
          input: {
            contractKey: '102025',
            competencia: '2026-09',
            dataAssinaturaAtesto: '2026-09-10',
            dataVencimentoFatura: '2026-09-20',
            documentoAtestoSei: 'Doc SEI 100200',
            numeroProcessoPagamentoSei: '08200.000100/2026-10',
            valorAtesto: 45000,
            responsavelNome: 'Carlos Analista'
          },
          prazos: {
            diasUteisAteVencimento: -4,
            janelaTotalDiasUteis: 8,
            diasSemRespostaCgofi: 0,
            margemEnvioDiasUteis: -4,
            isVencida: true,
            statusPrazo: 'VENCIDO'
          },
          alerts: [],
          criadoEm: '2026-09-10T09:00:00Z',
          atualizadoEm: '2026-09-24T09:00:00Z'
        }
      ],
      tempoMedioCgofiDisponivel: true,
      tempoMedioCgofiDias: 3.2
    }
  };

  it('1. deve renderizar a página de pagamentos com título padronizado e botão de atualizar', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockPaymentsReadModel,
      data: mockPaymentsReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<PaymentsRoute />);

    expect(html).toContain('Pagamentos');
    expect(html).toContain('Acompanhamento operacional do ciclo de faturamento, liquidação de atestos');
    expect(html).toContain('Atualizar');
  });

  it('2. deve encapsular o componente ManagementPaymentsOverview e exibir os ciclos', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockPaymentsReadModel,
      data: mockPaymentsReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<PaymentsRoute />);

    expect(html).toContain('Contrato 102025');
    expect(html).toContain('Doc SEI 100200');
    expect(html).toContain('Carlos Analista');
    expect(html).toContain('45.000,00');
  });
});
