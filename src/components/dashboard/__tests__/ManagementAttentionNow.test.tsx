import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagementAttentionNow } from '../ManagementAttentionNow';
import * as managementHookModule from '../../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../../types/managementDashboard';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../../hooks/useManagementDashboard', () => ({
  useManagementDashboard: vi.fn()
}));

const mockAttentionReadModel: ManagementDashboardReadModel = {
  uasg: '200331',
  dataCalculo: '2026-09-24T12:00:00Z',
  executive: {
    totalContratos: 20,
    contratosAtivos: 18,
    contratosEncerrados: 2,
    contratosEmProrrogacao: 3,
    valorOriginalTotal: 5000000,
    valorVigenteTotal: 5500000,
    deltaAcumuladoTotal: 500000,
    percentualVariacaoAcumulada: 10
  },
  deadlines: {
    vencendo30Dias: 2,
    vencendo60Dias: 3,
    vencendo90Dias: 5,
    contratosVencidos: 1,
    prorrogaçõesEmCurso: 2,
    itensVencendo: []
  },
  attention: {
    totalAlertasAtivos: 4,
    criticalCount: 2,
    overdueTasksCount: 1,
    upcomingTasksCount: 1,
    paymentAlertsCount: 1,
    reajusteAlertsCount: 1,
    atasCriticasCount: 0,
    radarsReajuste: [],
    radarsUrgentesCount: 1,
    pagamentosCriticosCount: 1,
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
    items: [
      {
        id: 'ATT-TASK-OVERDUE-1',
        category: 'TAREFA_ATRASADA',
        severity: 'CRITICA',
        title: 'Designar comissão de fiscalização',
        description: 'Contrato 15/2026 (Empresa Alfa) — Vencida há 5 dias',
        contractKey: '200331-00015-2026',
        numeroContrato: 'Contrato 15/2026',
        diasRelevantes: -5,
        badgeLabel: 'Vencida (-5d)'
      },
      {
        id: 'ATT-PGTO-1',
        category: 'PAGAMENTO_CRITICO',
        severity: 'CRITICA',
        title: 'Fatura Vencida (Doc 12345)',
        description: 'Contrato 200331-00015-2026 — Competência 2026-08 (R$ 50.000,00)',
        contractKey: '200331-00015-2026',
        cycleKey: 'cy1',
        badgeLabel: 'Fatura Vencida'
      },
      {
        id: 'ATT-TASK-UPCOMING-1',
        category: 'TAREFA_PROXIMA',
        severity: 'URGENTE',
        title: 'Enviar relatório mensal de conformidade',
        description: 'Contrato 20/2025 — Vence em 3 dias',
        contractKey: '200331-00020-2025',
        numeroContrato: 'Contrato 20/2025',
        diasRelevantes: 3,
        badgeLabel: '3 dias'
      },
      {
        id: 'ATT-REAJUSTE-1',
        category: 'REAJUSTE_RADAR',
        severity: 'URGENTE',
        title: 'Radar de Reajuste',
        description: 'Contrato 30/2025 — Marco de 1 ano em 25 dias',
        contractKey: '200331-00030-2025',
        numeroContrato: '30/2025',
        diasRelevantes: 25,
        badgeLabel: '25 dias'
      }
    ]
  },
  financial: {
    totalEmpenhado: 3000000,
    totalLiquidado: 2000000,
    totalPago: 1500000,
    saldoALiquidar: 1000000,
    saldoAPagar: 500000,
    saldoNaoExecutado: 1500000,
    totalRpInscrito: 0,
    totalRpPago: 0,
    saldoRpPendente: 0,
    taxaLiquidacaoPercentual: 66.67,
    taxaPagamentoPercentual: 75,
    burnRateMensalDisponivel: false
  },
  arp: {
    totalAtas: 5,
    totalItens: 20,
    itensCriticosCount: 0,
    topItensConsumidos: []
  },
  payments: {
    totalCiclos: 5,
    ciclosAbertosCount: 2,
    ciclosConcluidosCount: 3,
    ciclosCriticosCount: 1,
    ciclosAtrasoCgofiCount: 0,
    ciclosRecentes: [],
    tempoMedioCgofiDisponivel: false
  }
};

describe('ManagementAttentionNow Component (SaldoARP 3.0 — Fase 8-D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar a seção Atenção Agora com título, subtítulo e contadores', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockAttentionReadModel,
      data: mockAttentionReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<ManagementAttentionNow uasg="200331" />);

    expect(html).toContain('Atenção Agora');
    expect(html).toContain('4 pendências');
    expect(html).toContain('1</strong> atrasadas');
    expect(html).toContain('1</strong> ≤ 7 dias');
    expect(html).toContain('1</strong> pagamentos');
    expect(html).toContain('1</strong> reajustes');
  });

  it('2. deve renderizar os sinais de atenção individuais com severidades e categorias', () => {
    const html = renderToStaticMarkup(
      <ManagementAttentionNow readModel={mockAttentionReadModel} isLoading={false} isError={false} />
    );

    // Severidades
    expect(html).toContain('CRÍTICA');
    expect(html).toContain('URGENTE');

    // Títulos de itens
    expect(html).toContain('Designar comissão de fiscalização');
    expect(html).toContain('Fatura Vencida (Doc 12345)');
    expect(html).toContain('Enviar relatório mensal de conformidade');
    expect(html).toContain('Radar de Reajuste');

    // Categorias
    expect(html).toContain('Tarefa Atrasada');
    expect(html).toContain('Pagamento / Fatura');
    expect(html).toContain('Prazo Iminente');
    expect(html).toContain('Reajuste / Repactuação');

    // Botões de ação com link do contrato
    expect(html).toContain('Ver Contrato');
    expect(html).toContain('aria-label="Ver contrato 200331-00015-2026 para tratar Designar comissão de fiscalização"');
  });

  it('3. deve renderizar skeleton de loading sem exibir contadores falsos de zero', () => {
    const html = renderToStaticMarkup(
      <ManagementAttentionNow isLoading={true} isError={false} readModel={null} />
    );

    expect(html).toContain('management-attention-now animate-pulse');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Carregando prioridades operacionais do Atenção Agora');
    expect(html).not.toContain('0 pendências');
  });

  it('4. deve renderizar estado de erro explícito com role="alert"', () => {
    const html = renderToStaticMarkup(
      <ManagementAttentionNow
        isLoading={false}
        isError={true}
        errorMessage="Falha de conexão com os serviços da Central de Prazos"
        readModel={null}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Atenção Agora — Erro ao carregar sinais operacionais');
    expect(html).toContain('Falha de conexão com os serviços da Central de Prazos');
  });

  it('5. deve renderizar estado vazio explícito quando não houver pendências', () => {
    const emptyModel: ManagementDashboardReadModel = {
      ...mockAttentionReadModel,
      attention: {
        totalAlertasAtivos: 0,
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
        prazosKpis: {
          total: 10,
          atrasadas: 0,
          venceHoje: 0,
          proximos7Dias: 0,
          proximos30Dias: 0,
          futuras: 10,
          concluidas: 0
        },
        items: []
      }
    };

    const html = renderToStaticMarkup(
      <ManagementAttentionNow isLoading={false} isError={false} readModel={emptyModel} />
    );

    expect(html).toContain('Conformidade Operacional');
    expect(html).toContain('Nenhuma pendência crítica no momento.');
    expect(html).toContain('Todos os prazos contratuais, tarefas monitoradas e ciclos de faturamento estão operando dentro do cronograma regular.');
  });
});
