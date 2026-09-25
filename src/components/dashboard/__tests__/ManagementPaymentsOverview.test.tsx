import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagementPaymentsOverview } from '../ManagementPaymentsOverview';
import * as managementHookModule from '../../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../../types/managementDashboard';

vi.mock('../../../hooks/useManagementDashboard', () => ({
  useManagementDashboard: vi.fn()
}));

describe('ManagementPaymentsOverview Component (SaldoARP 3.0 — Fase 8-H)', () => {
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
      totalCiclos: 4,
      ciclosAbertosCount: 2,
      ciclosConcluidosCount: 2,
      ciclosCriticosCount: 1,
      ciclosAtrasoCgofiCount: 1,
      faturasVencidasCount: 1,
      faturasVenceHojeCount: 0,
      faturasProximasVencimentoCount: 0,
      envioCgofiAtrasadoCount: 0,
      documentacaoPendenteCount: 1,
      margemEnvioEstreitaCount: 0,
      distribuicaoPorEstado: {
        RECEBIDO: 0,
        ATRIBUIDO: 0,
        EM_INSTRUCAO: 1,
        PENDENTE_DOCUMENTACAO: 1,
        DESPACHO_ELABORADO: 0,
        ENVIADO_CGOFI: 0,
        AGUARDANDO_CGOFI: 1,
        DEVOLVIDO_FISCAL: 0,
        PAGAMENTO_CONFIRMADO: 1,
        CONCLUIDO: 1,
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
        },
        {
          cycleKey: '202025-PGTO-202609-NF200',
          contractKey: '202025',
          competencia: '2026-09',
          status: 'AGUARDANDO_CGOFI',
          input: {
            contractKey: '202025',
            competencia: '2026-09',
            dataAssinaturaAtesto: '2026-09-01',
            dataVencimentoFatura: '2026-09-30',
            documentoAtestoSei: 'Doc SEI 200300',
            dataEnvioCgofi: '2026-09-12',
            valorAtesto: 120000
          },
          prazos: {
            diasUteisAteVencimento: 5,
            janelaTotalDiasUteis: 20,
            diasSemRespostaCgofi: 8,
            margemEnvioDiasUteis: 12,
            isVencida: false,
            statusPrazo: 'NORMAL'
          },
          alerts: [],
          criadoEm: '2026-09-01T09:00:00Z',
          atualizadoEm: '2026-09-24T09:00:00Z'
        },
        {
          cycleKey: '302025-PGTO-202608-NF300',
          contractKey: '302025',
          competencia: '2026-08',
          status: 'PAGAMENTO_CONFIRMADO',
          input: {
            contractKey: '302025',
            competencia: '2026-08',
            dataAssinaturaAtesto: '2026-08-01',
            dataVencimentoFatura: '2026-08-25',
            documentoAtestoSei: 'Doc SEI 300400',
            dataEnvioCgofi: '2026-08-10',
            numeroOrdemBancaria: '2026OB800999',
            dataOrdemBancaria: '2026-08-20',
            valorAtesto: 80000
          },
          prazos: {
            diasUteisAteVencimento: 0,
            janelaTotalDiasUteis: 18,
            diasSemRespostaCgofi: 8,
            margemEnvioDiasUteis: 10,
            isVencida: false,
            statusPrazo: 'NORMAL'
          },
          alerts: [],
          criadoEm: '2026-08-01T09:00:00Z',
          atualizadoEm: '2026-08-20T15:00:00Z'
        }
      ],
      tempoMedioCgofiDisponivel: true,
      tempoMedioCgofiDias: 4.5
    }
  };

  it('1. deve renderizar métricas operacionais e badges do cabeçalho', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockPaymentsReadModel,
      data: mockPaymentsReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<ManagementPaymentsOverview uasg="200331" />);

    expect(html).toContain('Acompanhamento de Faturamento e Pagamentos');
    expect(html).toContain('4 Ciclos Totais');
    expect(html).toContain('Em Andamento');
    expect(html).toContain('Concluído');

    // Cards de KPI
    expect(html).toContain('Ciclos em Tramitação');
    expect(html).toContain('vencidas');
    expect(html).toContain('Gargalo CGOFI');
    expect(html).toContain('processo &gt; 5 dias úteis');
    expect(html).toContain('pendências');
  });

  it('2. deve exibir a distribuição por estágios do workflow operacional e tempo médio CGOFI', () => {
    const html = renderToStaticMarkup(<ManagementPaymentsOverview readModel={mockPaymentsReadModel} />);

    expect(html).toContain('Fluxo Operacional de Tramitação (Estágios do Workflow)');
    expect(html).toContain('1. Recebido');
    expect(html).toContain('2. Em Instrução');
    expect(html).toContain('3. Despacho');
    expect(html).toContain('4. CGOFI');
    expect(html).toContain('5. Pago / Concluído');
    expect(html).toContain('Tempo Médio CGOFI: 4.5 dias úteis');
  });

  it('3. deve listar os ciclos de faturamento na tabela com prazos e Ordem Bancária oficial', () => {
    const html = renderToStaticMarkup(
      <ManagementPaymentsOverview
        readModel={mockPaymentsReadModel}
        onNavigateContract={() => {}}
      />
    );

    // Ciclo 1 (Vencido / Pendência Documental)
    expect(html).toContain('Contrato 102025');
    expect(html).toContain('Competência: 2026-09');
    expect(html).toContain('Doc SEI 100200');
    expect(html).toContain('45.000,00');
    expect(html).toContain('Pendência Documental');
    expect(html).toContain('FATURA VENCIDA');

    // Ciclo 2 (Aguardando CGOFI)
    expect(html).toContain('Contrato 202025');
    expect(html).toContain('Aguardando CGOFI');
    expect(html).toContain('CGOFI: 8 dias sem resposta');

    // Ciclo 3 (OB Confirmada)
    expect(html).toContain('Contrato 302025');
    expect(html).toContain('2026OB800999');
    expect(html).toContain('20/08/2026');
  });

  it('4. deve assegurar a separação explícita de domínios (PAGAMENTO_CONFIRMADO != totalPago)', () => {
    const html = renderToStaticMarkup(<ManagementPaymentsOverview readModel={mockPaymentsReadModel} />);

    expect(html).toContain('Nota de Conformidade:');
    expect(html).toContain('PAGAMENTO_CONFIRMADO');
    expect(html).toContain('v_empenhos_resumo');
  });

  it('5. deve renderizar skeleton no estado de loading', () => {
    const html = renderToStaticMarkup(<ManagementPaymentsOverview isLoading={true} />);

    expect(html).toContain('data-testid="management-payments-overview-loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-testid="management-payments-overview-section"');
  });

  it('6. deve exibir mensagem de erro explícito no estado de erro', () => {
    const html = renderToStaticMarkup(
      <ManagementPaymentsOverview
        isError={true}
        errorMessage="Erro de conexão com o serviço de pagamentos"
      />
    );

    expect(html).toContain('data-testid="management-payments-overview-error"');
    expect(html).toContain('Erro de conexão com o serviço de pagamentos');
  });

  it('7. deve exibir empty state quando não houver dados de pagamento', () => {
    const emptyModel: ManagementDashboardReadModel = {
      ...mockPaymentsReadModel,
      payments: {
        totalCiclos: 0,
        ciclosAbertosCount: 0,
        ciclosConcluidosCount: 0,
        ciclosCriticosCount: 0,
        ciclosAtrasoCgofiCount: 0,
        ciclosRecentes: [],
        tempoMedioCgofiDisponivel: false
      }
    };

    const html = renderToStaticMarkup(<ManagementPaymentsOverview readModel={emptyModel} />);

    expect(html).toContain('data-testid="management-payments-overview-empty"');
    expect(html).toContain('Nenhum ciclo de pagamento registrado');
  });
});
