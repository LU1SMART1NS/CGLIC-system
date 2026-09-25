import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeRoute } from '../HomeRoute';
import { HomeExecutiveKPIs } from '../../components/home/HomeExecutiveKPIs';
import { HomeAttentionNow } from '../../components/home/HomeAttentionNow';
import { HomeDeadlinesPortfolio } from '../../components/home/HomeDeadlinesPortfolio';
import { HomePaymentsSummary } from '../../components/home/HomePaymentsSummary';
import { HomeArpBalancesSummary } from '../../components/home/HomeArpBalancesSummary';
import { HomeHeaderAndFilters } from '../../components/home/HomeHeaderAndFilters';
import * as useManagementDashboardModule from '../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../types/managementDashboard';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/' })
}));

const mockReadModel: ManagementDashboardReadModel = {
  uasg: '200331',
  dataCalculo: '2026-09-24T12:00:00Z',
  executive: {
    totalContratos: 12,
    contratosAtivos: 9,
    contratosEncerrados: 3,
    contratosEmProrrogacao: 2,
    valorOriginalTotal: 5000000,
    valorVigenteTotal: 5800000,
    deltaAcumuladoTotal: 800000,
    percentualVariacaoAcumulada: 16.0
  },
  deadlines: {
    vencendo30Dias: 2,
    vencendo60Dias: 3,
    vencendo90Dias: 1,
    contratosVencidos: 0,
    prorrogaçõesEmCurso: 2,
    itensVencendo: [
      {
        contractKey: '200331-00015-2026',
        numeroContrato: '15/2026',
        anoContrato: 2026,
        fornecedorNome: 'Tecnologia Segurança Ltda',
        dataVigenciaFim: '2026-10-15',
        diasRestantes: 21,
        faixa: '30D'
      }
    ]
  },
  attention: {
    totalAlertasAtivos: 3,
    criticalCount: 2,
    overdueTasksCount: 1,
    upcomingTasksCount: 1,
    paymentAlertsCount: 1,
    reajusteAlertsCount: 1,
    atasCriticasCount: 1,
    radarsReajuste: [],
    radarsUrgentesCount: 0,
    pagamentosCriticosCount: 1,
    tarefasVencidasCount: 1,
    prazosKpis: {
      total: 3,
      atrasadas: 1,
      venceHoje: 0,
      proximos7Dias: 1,
      proximos30Dias: 1,
      futuras: 0,
      concluidas: 0
    },
    items: [
      {
        id: 'att-1',
        category: 'ATA_CRITICA',
        severity: 'CRITICA',
        title: 'Consumo crítico de Ata (≥85%)',
        description: 'Item 3 da Ata 12/2026 atingiu 92% da cota',
        numeroAta: '12/2026'
      },
      {
        id: 'att-2',
        category: 'PAGAMENTO_CRITICO',
        severity: 'CRITICA',
        title: 'Fatura com prazo iminente de repasse',
        description: 'Nota fiscal 4501 aguarda validação CGOFI há 6 dias',
        contractKey: '200331-00015-2026'
      },
      {
        id: 'att-3',
        category: 'TAREFA_PROXIMA',
        severity: 'URGENTE',
        title: 'Notificação de Renovação Obrigatória',
        description: 'Prazo limite em 14 dias',
        contractKey: '200331-00015-2026'
      }
    ]
  },
  financial: {
    totalEmpenhado: 3200000,
    totalLiquidado: 2800000,
    totalPago: 2500000,
    saldoALiquidar: 400000,
    saldoAPagar: 300000,
    saldoNaoExecutado: 700000,
    totalRpInscrito: 0,
    totalRpPago: 0,
    saldoRpPendente: 0,
    taxaLiquidacaoPercentual: 87.5,
    taxaPagamentoPercentual: 78.12,
    burnRateMensalDisponivel: false
  },
  arp: {
    totalAtas: 6,
    totalItens: 45,
    itensCriticosCount: 1,
    itensProximosLimiteCount: 2,
    percentualConsumoGlobal: 68.4,
    topItensConsumidos: [],
    itensCriticosDetalhe: [
      {
        itemKey: '200331-12/2026-3',
        numeroAta: '12/2026',
        numeroItem: 3,
        descricaoItem: 'Colete Balístico Nível III-A',
        quantidadeHomologada: 1000,
        quantidadeConsumida: 920,
        saldoDisponivel: 80,
        percentualConsumido: 92.0,
        isCritico: true
      }
    ]
  },
  payments: {
    totalCiclos: 14,
    ciclosAbertosCount: 4,
    ciclosConcluidosCount: 10,
    ciclosCriticosCount: 1,
    ciclosAtrasoCgofiCount: 1,
    ciclosRecentes: [],
    ciclosAbertosDetalhe: [
      {
        cycleKey: '200331-00015-2026-PGTO-202609-NF4501',
        contractKey: '200331-00015-2026',
        competencia: '2026-09',
        status: 'AGUARDANDO_CGOFI',
        input: {
          contractKey: '200331-00015-2026',
          competencia: '2026-09',
          documentoAtestoSei: 'NF-4501',
          dataAssinaturaAtesto: '2026-09-20',
          dataVencimentoFatura: '2026-09-30',
          valorAtesto: 85000
        },
        prazos: {
          diasUteisAteVencimento: 4,
          janelaTotalDiasUteis: 8,
          diasSemRespostaCgofi: 6,
          margemEnvioDiasUteis: 3,
          isVencida: false,
          statusPrazo: 'CRITICO'
        },
        alerts: [],
        criadoEm: '2026-09-20',
        atualizadoEm: '2026-09-24'
      }
    ],
    tempoMedioCgofiDisponivel: false
  },
  availableFilters: {
    contracts: [{ key: '200331-00015-2026', label: 'Contrato 15/2026', sublabel: 'Tecnologia Segurança' }],
    atas: [{ key: '12/2026', label: '12/2026' }]
  },
  syncInfo: {
    ultimoSyncEm: '2026-09-24T14:00:00Z',
    totalAtas: 6,
    totalItens: 45,
    isCachedInDb: true
  }
};

describe('HomeRoute & Componentes — FASE 9-D.3: Composição Gerencial e Hierarquia da Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar a HomeRoute com título limpo "Visão Geral", sem repetição institucional e sem seções de atalhos redundantes', () => {
    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockReturnValue({
      readModel: mockReadModel,
      data: mockReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<HomeRoute />);

    // Título e Subtítulo Limpos
    expect(html).toContain('Visão Geral');
    expect(html).toContain('Acompanhe a situação da sua unidade e os principais pontos de atenção.');
    expect(html).not.toContain('Cockpit Executivo de Gestão');
    expect(html).not.toContain('Visão Geral — ComprasSUSP');

    // 4 KPIs Executivos
    expect(html).toContain('Contratos Ativos');
    expect(html).toContain('9');
    expect(html).toContain('Valor Vigente Global');
    expect(html).toContain('Variação Contratual (Delta)');
    expect(html).toContain('Execução Financeira (Pago)');
    expect(html).toContain('78.1%');

    // Seções Estruturais Gerenciais na Ordem Hierárquica
    expect(html).toContain('Atenção Agora');
    expect(html).toContain('Carteira &amp; Prazos');
    expect(html).toContain('Pagamentos');
    expect(html).not.toContain('Pagamentos &amp; Faturamento');
    expect(html).toContain('Atas de Registro de Preços &amp; Saldos');

    // NÃO deve conter Acessos Rápidos nem SyncActivityCard na Home
    expect(html).not.toContain('Acessos Rápidos');
    expect(html).not.toContain('Integração &amp; Fontes Oficiais');
    expect(html).not.toContain('Compras.gov.br Conectado');
  });

  it('2. deve renderizar a seção Atenção Agora com itens do Funil Único e botões de ação', () => {
    const html = renderToStaticMarkup(
      <HomeAttentionNow attention={mockReadModel.attention} loading={false} />
    );

    expect(html).toContain('Atenção Agora');
    expect(html).toContain('Consumo crítico de Ata (≥85%)');
    expect(html).toContain('Fatura com prazo iminente de repasse');
    expect(html).toContain('Notificação de Renovação Obrigatória');
    expect(html).toContain('CRÍTICA');
    expect(html).toContain('URGENTE');
    expect(html).toContain('Ver Central de Atenção');
    expect(html).toContain('Abrir Contrato');
    expect(html).toContain('Ver Ata');
  });

  it('3. deve exibir EmptyState na Atenção Agora quando não houver pendências', () => {
    const emptyAttention = {
      ...mockReadModel.attention,
      totalAlertasAtivos: 0,
      items: []
    };

    const html = renderToStaticMarkup(
      <HomeAttentionNow attention={emptyAttention} loading={false} />
    );

    expect(html).toContain('Tudo sob controle');
  });

  it('4. deve renderizar Carteira & Prazos com vencimentos em 30d, 60-90d, janela de prorrogação e reajustes no radar', () => {
    const html = renderToStaticMarkup(
      <HomeDeadlinesPortfolio
        deadlines={mockReadModel.deadlines}
        attention={mockReadModel.attention}
        loading={false}
      />
    );

    expect(html).toContain('Carteira &amp; Prazos');
    expect(html).toContain('Vencem em 30d');
    expect(html).toContain('2');
    expect(html).toContain('contratos');
    expect(html).toContain('Vencem em 60–90d');
    expect(html).toContain('4'); // 3 + 1 em 60-90d
    expect(html).toContain('Janela Prorrogação');
    expect(html).toContain('em até 180d');
    expect(html).toContain('Radar Reajuste');
    expect(html).toContain('no radar');
    expect(html).toContain('Contrato nº 15/2026');
  });

  it('5. deve renderizar Pagamentos com ciclos em aberto, alertas CGOFI e sem título longo', () => {
    const html = renderToStaticMarkup(
      <HomePaymentsSummary
        payments={mockReadModel.payments}
        loading={false}
      />
    );

    expect(html).toContain('Pagamentos');
    expect(html).not.toContain('Pagamentos &amp; Faturamento');
    expect(html).toContain('Acompanhamento de atesto, instrução, CGOFI e pagamento.');
    expect(html).toContain('Ciclos em Aberto');
    expect(html).toContain('4');
    expect(html).toContain('Aguardando CGOFI');
    expect(html).toContain('1');
    expect(html).toContain('Prazo Crítico');
    expect(html).toContain('Nota Fiscal NF-4501');
  });

  it('6. deve renderizar empty state limpo em Pagamentos quando não houver ciclos', () => {
    const emptyPayments = {
      ...mockReadModel.payments,
      totalCiclos: 0,
      ciclosAbertosCount: 0,
      ciclosAtrasoCgofiCount: 0,
      ciclosCriticosCount: 0,
      ciclosRecentes: [],
      ciclosAbertosDetalhe: []
    };

    const html = renderToStaticMarkup(
      <HomePaymentsSummary payments={emptyPayments} loading={false} />
    );

    expect(html).toContain('Pagamentos');
    expect(html).toContain('Nenhum ciclo de pagamento exige atenção no contexto atual.');
  });

  it('7. deve renderizar Atas de Registro de Preços & Saldos com consumo físico percentual e itens críticos', () => {
    const html = renderToStaticMarkup(
      <HomeArpBalancesSummary
        arp={mockReadModel.arp}
        loading={false}
      />
    );

    expect(html).toContain('Atas de Registro de Preços &amp; Saldos');
    expect(html).toContain('Consumo Global');
    expect(html).toContain('68.4%');
    expect(html).toContain('Consumo Crítico (≥85%)');
    expect(html).toContain('1 item');
    expect(html).toContain('Colete Balístico Nível III-A');
    expect(html).toContain('92.0% consumido');
  });

  it('8. deve renderizar filtros contextuais compactos no Header da Home', () => {
    const html = renderToStaticMarkup(
      <HomeHeaderAndFilters
        filters={{ uasg: '200331', statusContrato: 'ATIVO' }}
        availableFilters={mockReadModel.availableFilters}
        onFilterChange={vi.fn()}
        onResetFilters={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(html).toContain('Visão Geral');
    expect(html).toContain('Contrato 15/2026');
    expect(html).toContain('Ata 12/2026');
    expect(html).toContain('Limpar');
  });

  it('9. deve renderizar estado de carregamento (SkeletonLoader) nas seções', () => {
    const htmlKpis = renderToStaticMarkup(<HomeExecutiveKPIs loading={true} />);
    const htmlAttention = renderToStaticMarkup(<HomeAttentionNow loading={true} />);
    const htmlDeadlines = renderToStaticMarkup(<HomeDeadlinesPortfolio loading={true} />);

    expect(htmlKpis).toContain('kpi-card-loading');
    expect(htmlAttention).not.toContain('Consumo crítico');
    expect(htmlDeadlines).not.toContain('Contrato nº 15/2026');
  });

  it('10. deve renderizar estado de erro explícito com mensagem quando useManagementDashboard falhar', () => {
    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockReturnValue({
      readModel: null,
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Falha de conexão com a base de dados'),
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<HomeRoute />);

    expect(html).toContain('Erro ao carregar dados da Visão Geral');
    expect(html).toContain('Falha de conexão com a base de dados');
    expect(html).toContain('Tentar Novamente');
  });
});
