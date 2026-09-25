import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GestaoInstrumentosRoute } from '../GestaoInstrumentosRoute';
import { GestaoInstrumentosSummaryCards } from '../../components/instrumentos/GestaoInstrumentosSummaryCards';
import { GestaoInstrumentosCategoryTabs } from '../../components/instrumentos/GestaoInstrumentosCategoryTabs';
import { GestaoInstrumentosTable } from '../../components/instrumentos/GestaoInstrumentosTable';
import * as useManagementDashboardModule from '../../hooks/useManagementDashboard';
import * as useAllContractManagersModule from '../../hooks/useAllContractManagers';
import type { ManagementDashboardReadModel } from '../../types/managementDashboard';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/instrumentos' }),
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
    vencendo30Dias: 1,
    vencendo60Dias: 1,
    vencendo90Dias: 1,
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
    itensProximosLimiteCount: 1,
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
  },
  availableFilters: {
    contracts: [{ key: '200331-00015-2026', label: 'Contrato 15/2026', sublabel: 'Tecnologia Segurança Ltda' }],
    atas: [{ key: '12/2026', label: 'Ata 12/2026', sublabel: 'Aquisição de equipamentos de proteção' }]
  }
};

describe('GestaoInstrumentosRoute & Componentes — Painel Unificado de Gestão e Monitoramento (Lei 14.133)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAllContractManagersModule, 'useAllContractManagers').mockReturnValue({
      data: { '200331-00015-2026': { contractKey: '200331-00015-2026', uasg: '200331', numero: '15', ano: 2026, gestorNome: 'Ana Costa', createdAt: '', updatedAt: '' } },
      isLoading: false,
      isError: false
    } as any);
  });

  it('1. deve renderizar a rota com cabeçalho "Gestão de Instrumentos", subtítulo institucional e UASG', () => {
    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockReturnValue({
      readModel: mockReadModel,
      data: mockReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<GestaoInstrumentosRoute />);

    expect(html).toContain('Gestão de Instrumentos');
    expect(html).toContain('Painel unificado de gestão e monitoramento — Lei 14.133');
    expect(html).toContain('UASGs 200330 · 200331');
    expect(html).toContain('Ações Imediatas / Pendências da Carteira');
  });

  it('1b. deve consolidar instrumentos das duas UASGs (200330 e 200331) e identificar a origem de cada linha na coluna UASG', () => {
    const readModel200330: ManagementDashboardReadModel = {
      ...mockReadModel,
      uasg: '200330',
      attention: {
        ...mockReadModel.attention,
        items: [
          {
            id: 'ATT-200330-1',
            category: 'ATA_CRITICA',
            severity: 'CRITICA',
            title: 'Consumo Crítico em Ata (95.0%)',
            description: 'Ata 40/2026 — Item 1: Viaturas Operacionais',
            numeroAta: '40/2026',
            badgeLabel: '95.0% consumido'
          }
        ]
      },
      availableFilters: {
        contracts: [],
        atas: [{ key: '40/2026', label: 'Ata 40/2026', sublabel: 'Fornecedor UASG 200330 LTDA' }]
      }
    };

    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockImplementation((filtersOrUasg) => {
      const uasg = typeof filtersOrUasg === 'string' ? filtersOrUasg : filtersOrUasg?.uasg;
      const rm = uasg === '200330' ? readModel200330 : mockReadModel;
      return {
        readModel: rm,
        data: rm,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn()
      };
    });

    const html = renderToStaticMarkup(<GestaoInstrumentosRoute />);

    // Instrumento exclusivo da UASG 200330, com fornecedor real dessa unidade
    expect(html).toContain('Ata 40/2026');
    expect(html).toContain('Fornecedor UASG 200330 LTDA');

    // Instrumentos da UASG 200331 continuam presentes (consolidação, não substituição)
    expect(html).toContain('Ata 12/2026');
    expect(html).toContain('Contrato 15/2026');

    // Tabs somam os itens das duas unidades (1 da 200330 + 5 da 200331 = 6)
    expect(html).toContain('Todas (6)');
  });

  it('2. deve renderizar os 4 cards de resumo com dados reais (ARP, Contratos, Valor Global, Alertas) e ser clicáveis', () => {
    const html = renderToStaticMarkup(
      <GestaoInstrumentosSummaryCards
        counts={{
          totalAtas: 4,
          itensCriticosArp: 1,
          itensProximosLimiteArp: 1,
          contratosAtivos: 8,
          contratosEmAtencao60a90d: 2,
          contratosEmProrrogacao: 2,
          contratosAVencer30d: 1,
          valorVigenteTotal: 4500000,
          totalEmpenhado: 2500000,
          criticalCount: 2,
          totalAlertasAtivos: 5,
          urgenteCount: 2,
          atencaoCount: 1
        }}
        activeCard={null}
        onSelectCard={vi.fn()}
      />
    );

    expect(html).toContain('Atas de Registro de Preço (ARP)');
    expect(html).toContain('Contratos Vigentes');
    expect(html).toContain('Valor Total Global');
    expect(html).toContain('Alertas Críticos');
    expect(html).toContain('R$');
    expect(html).toContain('Saldo disponível');
  });

  it('3. deve renderizar os tabs de categoria com contagens reais e destacar o ativo', () => {
    const html = renderToStaticMarkup(
      <GestaoInstrumentosCategoryTabs
        counts={{ TODAS: 5, VENCIMENTOS: 1, SALDOS: 1, REAJUSTES: 1, PAGAMENTOS: 1, TAREFAS: 1 }}
        active="SALDOS"
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('Todas (5)');
    expect(html).toContain('Vencimentos (1)');
    expect(html).toContain('Saldos (1)');
    expect(html).toContain('Reajustes (1)');
    expect(html).toContain('Pagamentos (1)');
    expect(html).toContain('Tarefas (1)');
  });

  it('4. deve renderizar a tabela com prioridade, instrumento, motivo, prazo, responsável e ação contextual', () => {
    const fornecedorByKey = new Map([
      ['200331-00015-2026', 'Tecnologia Segurança Ltda'],
      ['200331-12/2026', 'Aquisição de equipamentos de proteção']
    ]);
    const responsavelByContractKey = new Map([['200331-00015-2026', 'Ana Costa']]);

    const itemsComUasg = mockReadModel.attention.items.map((item) => ({ ...item, uasg: '200331' }));

    const html = renderToStaticMarkup(
      <GestaoInstrumentosTable
        items={itemsComUasg}
        totalItems={itemsComUasg.length}
        fornecedorByKey={fornecedorByKey}
        responsavelByContractKey={responsavelByContractKey}
        onResetFilters={vi.fn()}
      />
    );

    // Prioridade
    expect(html).toContain('CRÍTICA');
    expect(html).toContain('URGENTE');
    expect(html).toContain('ATENÇÃO');

    // Coluna UASG
    expect(html).toContain('200331');

    // Instrumento + tipo
    expect(html).toContain('Ata 12/2026');
    expect(html).toContain('ARP');
    expect(html).toContain('Contrato 15/2026');
    expect(html).toContain('Contrato');

    // Objeto/Fornecedor real (enriquecido via availableFilters/useAllContractManagers)
    expect(html).toContain('Tecnologia Segurança Ltda');
    expect(html).toContain('Aquisição de equipamentos de proteção');

    // Motivo da Atenção
    expect(html).toContain('Saldo em Atenção');
    expect(html).toContain('Execução / Pagamento');
    expect(html).toContain('Tarefa Atrasada');
    expect(html).toContain('Reajuste / Repactuação');
    expect(html).toContain('Vigência Próxima');

    // Responsável
    expect(html).toContain('Ana Costa');

    // Ação contextual por motivo (não apenas "Visualizar")
    expect(html).toContain('Verificar Saldo');
    expect(html).toContain('Abrir Pagamento');
    expect(html).toContain('Abrir Tarefa');
    expect(html).toContain('Analisar Reajuste');
    expect(html).toContain('Prorrogar Vigência');
  });

  it('5. deve exibir estado "Tudo em dia" quando não houver nenhum instrumento em atenção', () => {
    const html = renderToStaticMarkup(
      <GestaoInstrumentosTable
        items={[]}
        totalItems={0}
        fornecedorByKey={new Map()}
        responsavelByContractKey={new Map()}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Tudo em dia');
  });

  it('6. deve exibir estado "Nenhum instrumento encontrado" com botão de limpar filtros quando o filtro zera resultados', () => {
    const html = renderToStaticMarkup(
      <GestaoInstrumentosTable
        items={[]}
        totalItems={5}
        fornecedorByKey={new Map()}
        responsavelByContractKey={new Map()}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhum instrumento encontrado');
    expect(html).toContain('Limpar Filtros');
  });

  it('7. deve renderizar estado de erro explícito quando useManagementDashboard falhar', () => {
    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockReturnValue({
      readModel: null,
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Erro de conexão ao carregar a carteira de instrumentos'),
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<GestaoInstrumentosRoute />);

    expect(html).toContain('Erro ao carregar a Gestão de Instrumentos');
    expect(html).toContain('Erro de conexão ao carregar a carteira de instrumentos');
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

    const html = renderToStaticMarkup(<GestaoInstrumentosRoute />);

    expect(html).toContain('skeleton');
    expect(html).not.toContain('Consumo Crítico');
  });
});
