import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CentralPrazosRoute } from '../CentralPrazosRoute';
import { CentralAttentionSummaryCards } from '../../components/prazos/CentralAttentionSummaryCards';
import { CentralAttentionFiltersBar } from '../../components/prazos/CentralAttentionFiltersBar';
import { CentralAttentionQueue } from '../../components/prazos/CentralAttentionQueue';
import * as useManagementDashboardModule from '../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../types/managementDashboard';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/prazos' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

const mockReadModel: ManagementDashboardReadModel = {
  uasg: '200331',
  dataCalculo: '2026-09-24T12:00:00Z',
  executive: {
    totalContratos: 10,
    contratosAtivos: 8,
    contratosEncerrados: 2,
    contratosEmProrrogacao: 2,
    valorOriginalTotal: 4000000,
    valorVigenteTotal: 4500000,
    deltaAcumuladoTotal: 500000,
    percentualVariacaoAcumulada: 12.5
  },
  deadlines: {
    vencendo30Dias: 2,
    vencendo60Dias: 1,
    vencendo90Dias: 0,
    contratosVencidos: 0,
    prorrogaçõesEmCurso: 2,
    itensVencendo: []
  },
  attention: {
    totalAlertasAtivos: 5,
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
      total: 2,
      atrasadas: 1,
      venceHoje: 0,
      proximos7Dias: 1,
      proximos30Dias: 0,
      futuras: 0,
      concluidas: 0
    },
    items: [
      {
        id: 'ATT-CRIT-1',
        category: 'ATA_CRITICA',
        severity: 'CRITICA',
        title: 'Consumo Crítico em Ata (92.0%)',
        description: 'Ata 12/2026 — Item 3: Colete Balístico Nível III-A',
        numeroAta: '12/2026',
        badgeLabel: '92.0% consumido'
      },
      {
        id: 'ATT-CRIT-2',
        category: 'PAGAMENTO_CRITICO',
        severity: 'CRITICA',
        title: 'Fatura com Vencimento Crítico (NF-4501)',
        description: 'Contrato 200331-00015-2026 — Competência 2026-09 (R$ 85.000,00)',
        contractKey: '200331-00015-2026',
        numeroContrato: 'Contrato 15/2026',
        badgeLabel: '3 dias úteis'
      },
      {
        id: 'ATT-URG-1',
        category: 'TAREFA_ATRASADA',
        severity: 'URGENTE',
        title: 'Elaborar Notificação de Reajuste',
        description: 'Contrato 15/2026 (Tecnologia Segurança Ltda) — Vencida há 4 dias',
        contractKey: '200331-00015-2026',
        numeroContrato: 'Contrato 15/2026',
        badgeLabel: 'Vencida (-4d)'
      },
      {
        id: 'ATT-URG-2',
        category: 'REAJUSTE_RADAR',
        severity: 'URGENTE',
        title: 'Gatilho de Reajuste Anual Iminente',
        description: 'Contrato 15/2026 — Janela de repactuação IPCA aberta',
        contractKey: '200331-00015-2026',
        numeroContrato: 'Contrato 15/2026',
        badgeLabel: '15 dias'
      },
      {
        id: 'ATT-ATEN-1',
        category: 'PRORROGACAO_PROXIMA',
        severity: 'ATENCAO',
        title: 'Marco de Planejamento de Prorrogação',
        description: 'Contrato 15/2026 — Janela preventiva de análise (45 dias restantes)',
        contractKey: '200331-00015-2026',
        numeroContrato: 'Contrato 15/2026',
        badgeLabel: '45 dias'
      }
    ]
  },
  financial: {
    totalEmpenhado: 2500000,
    totalLiquidado: 2000000,
    totalPago: 1800000,
    saldoALiquidar: 500000,
    saldoAPagar: 200000,
    saldoNaoExecutado: 600000,
    totalRpInscrito: 0,
    totalRpPago: 0,
    saldoRpPendente: 0,
    taxaLiquidacaoPercentual: 80.0,
    taxaPagamentoPercentual: 72.0,
    burnRateMensalDisponivel: false
  },
  arp: {
    totalAtas: 4,
    totalItens: 20,
    itensCriticosCount: 1,
    percentualConsumoGlobal: 70.0,
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

describe('CentralPrazosRoute & Componentes — FASE 9-E: Central de Atenção 3.0', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar a rota com cabeçalho limpo "Central de Atenção" e descrição', () => {
    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockReturnValue({
      readModel: mockReadModel,
      data: mockReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<CentralPrazosRoute />);

    expect(html).toContain('Central de Atenção');
    expect(html).toContain('Acompanhe prazos, riscos e situações que exigem acompanhamento.');
    expect(html).not.toContain('Cockpit');
    expect(html).not.toContain('Painel Executivo');
  });

  it('2. deve renderizar o resumo superior com as 4 categorias de severidade', () => {
    const counts = { critica: 2, urgente: 2, atencao: 1, info: 0 };
    const html = renderToStaticMarkup(
      <CentralAttentionSummaryCards
        counts={counts}
        activeSeverity="TODAS"
        onSelectSeverity={vi.fn()}
      />
    );

    expect(html).toContain('Críticas');
    expect(html).toContain('2');
    expect(html).toContain('Urgentes');
    expect(html).toContain('2');
    expect(html).toContain('Atenção');
    expect(html).toContain('1');
    expect(html).toContain('Informativas');
    expect(html).toContain('0');
  });

  it('3. deve renderizar a barra de filtros compacta com opções de severidade, origem e busca', () => {
    const html = renderToStaticMarkup(
      <CentralAttentionFiltersBar
        filters={{ severidade: 'TODAS', origem: 'TODAS', busca: '' }}
        onChangeFilter={vi.fn()}
        onResetFilters={vi.fn()}
        totalFiltered={5}
        totalItems={5}
      />
    );

    expect(html).toContain('Todas as Severidades');
    expect(html).toContain('Todas as Origens');
    expect(html).toContain('Buscar por contrato, ata, descrição...');
    expect(html).toContain('5 situações');
  });

  it('4. deve renderizar a fila operacional com itens contendo o que aconteceu, objeto, por quê e ação', () => {
    const html = renderToStaticMarkup(
      <CentralAttentionQueue
        items={mockReadModel.attention.items}
        totalItems={mockReadModel.attention.items.length}
        onResetFilters={vi.fn()}
      />
    );

    // Itens com Severidade
    expect(html).toContain('CRÍTICA');
    expect(html).toContain('URGENTE');
    expect(html).toContain('ATENÇÃO');

    // Natureza e Origem
    expect(html).toContain('ALERTA');
    expect(html).toContain('TAREFA');
    expect(html).toContain('WORKFLOW');

    // Título e Descrição
    expect(html).toContain('Consumo Crítico em Ata (92.0%)');
    expect(html).toContain('Fatura com Vencimento Crítico (NF-4501)');
    expect(html).toContain('Elaborar Notificação de Reajuste');
    expect(html).toContain('Gatilho de Reajuste Anual Iminente');
    expect(html).toContain('Marco de Planejamento de Prorrogação');

    // Botões de Ação de Drill-Down
    expect(html).toContain('Ver Ata');
    expect(html).toContain('Abrir Contrato');
    expect(html).toContain('Abrir Pagamento');
  });

  it('5. deve exibir estado "Tudo em dia" quando não houver nenhuma situação no sistema', () => {
    const html = renderToStaticMarkup(
      <CentralAttentionQueue
        items={[]}
        totalItems={0}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Tudo em dia');
    expect(html).toContain('Nenhuma situação exige atenção no contexto selecionado.');
  });

  it('6. deve exibir estado "Nenhuma situação encontrada" com botão de limpar filtros quando filtro zera resultados', () => {
    const html = renderToStaticMarkup(
      <CentralAttentionQueue
        items={[]}
        totalItems={5}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhuma situação encontrada');
    expect(html).toContain('Nenhuma situação corresponde aos filtros selecionados.');
    expect(html).toContain('Limpar Filtros');
  });

  it('7. deve renderizar estado de erro explícito com mensagem quando falhar o carregamento', () => {
    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockReturnValue({
      readModel: null,
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Erro de conexão ao carregar atenção'),
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<CentralPrazosRoute />);

    expect(html).toContain('Erro ao carregar a Central de Atenção');
    expect(html).toContain('Erro de conexão ao carregar atenção');
    expect(html).toContain('Tentar Novamente');
  });

  it('8. deve renderizar loading skeleton quando isLoading for verdadeiro', () => {
    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockReturnValue({
      readModel: null,
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<CentralPrazosRoute />);

    expect(html).toContain('skeleton');
    expect(html).not.toContain('Consumo Crítico');
  });
});
