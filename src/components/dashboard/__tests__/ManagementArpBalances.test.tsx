import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagementArpBalances } from '../ManagementArpBalances';
import * as managementHookModule from '../../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../../types/managementDashboard';

vi.mock('../../../hooks/useManagementDashboard', () => ({
  useManagementDashboard: vi.fn()
}));

describe('ManagementArpBalances Component (SaldoARP 3.0 — Fase 8-G)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockArpReadModel: ManagementDashboardReadModel = {
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
      totalAlertasAtivos: 0,
      criticalCount: 0,
      overdueTasksCount: 0,
      upcomingTasksCount: 0,
      paymentAlertsCount: 0,
      reajusteAlertsCount: 0,
      atasCriticasCount: 1,
      radarsReajuste: [],
      radarsUrgentesCount: 0,
      pagamentosCriticosCount: 0,
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
      totalAtas: 3,
      totalItens: 4,
      itensCriticosCount: 1,
      itensProximosLimiteCount: 1,
      quantidadeHomologadaTotal: 1000,
      quantidadeEmpenhadaTotal: 750,
      saldoFisicoTotal: 250,
      percentualConsumoGlobal: 75,
      topItensConsumidos: [],
      itensCriticosDetalhe: [
        {
          itemKey: 'ATA01-ITEM01',
          numeroAta: '10/2025',
          codigoUasg: '200331',
          numeroItem: 1,
          descricaoItem: 'Servidor Rack 2U Enterprise',
          fornecedorNome: 'Dell Computadores do Brasil',
          quantidadeHomologada: 100,
          quantidadeConsumida: 90,
          saldoDisponivel: 10,
          percentualConsumido: 90,
          isCritico: true,
          isProximoLimite: false,
          totalEmpenhosVinculados: 3,
          contractKey: '102025'
        },
        {
          itemKey: 'ATA02-ITEM01',
          numeroAta: '15/2025',
          codigoUasg: '200331',
          numeroItem: 1,
          descricaoItem: 'Licença de Software de Banco de Dados',
          fornecedorNome: 'Oracle do Brasil',
          quantidadeHomologada: 200,
          quantidadeConsumida: 150,
          saldoDisponivel: 50,
          percentualConsumido: 75,
          isCritico: false,
          isProximoLimite: true,
          totalEmpenhosVinculados: 2
        },
        {
          itemKey: 'ATA03-ITEM01',
          numeroAta: '20/2025',
          codigoUasg: '200331',
          numeroItem: 1,
          descricaoItem: 'Cabo de Rede Cat6a 305m',
          fornecedorNome: 'Furukawa Electric',
          quantidadeHomologada: 700,
          quantidadeConsumida: 510,
          saldoDisponivel: 190,
          percentualConsumido: 72.86,
          isCritico: false,
          isProximoLimite: true,
          totalEmpenhosVinculados: 1
        }
      ]
    },
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

  it('1. deve renderizar métricas físicas da ARP via props ou hook', () => {
    vi.mocked(managementHookModule.useManagementDashboard).mockReturnValue({
      readModel: mockArpReadModel,
      data: mockArpReadModel,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    });

    const html = renderToStaticMarkup(<ManagementArpBalances uasg="200331" />);

    expect(html).toContain('Saldos Físicos de Ata de Registro de Preços (ARP)');
    expect(html).toContain('3 Atas');
    expect(html).toContain('4 Itens Monitorados');

    // Quantidade Homologada
    expect(html).toContain('1.000');
    // Quantidade Empenhada
    expect(html).toContain('750');
    // Saldo Físico
    expect(html).toContain('250');
    // Consumo Global
    expect(html).toContain('75,00% consumido');
  });

  it('2. deve garantir separação estrita de domínios (zero menção a R$ em saldos físicos)', () => {
    const html = renderToStaticMarkup(<ManagementArpBalances readModel={mockArpReadModel} />);

    // Não deve haver menção a R$ na seção física de ARP
    expect(html).not.toContain('R$');
    expect(html).toContain('unidades');
  });

  it('3. deve exibir a tabela de itens que exigem acompanhamento com suas informações completas', () => {
    const html = renderToStaticMarkup(
      <ManagementArpBalances
        readModel={mockArpReadModel}
        onNavigateAta={() => {}}
        onNavigateContract={() => {}}
      />
    );

    // Item 1 (Crítico)
    expect(html).toContain('Ata 10/2025');
    expect(html).toContain('Servidor Rack 2U Enterprise');
    expect(html).toContain('Dell Computadores do Brasil');
    expect(html).toContain('3 empenhos');
    expect(html).toContain('Crítico (≥85%)');
    expect(html).toContain('90,00%');
    expect(html).toContain('Ver Ata');
    expect(html).toContain('Contrato 360°');

    // Item 2 (Próximo)
    expect(html).toContain('Ata 15/2025');
    expect(html).toContain('Licença de Software de Banco de Dados');
    expect(html).toContain('Próximo (70-84%)');
    expect(html).toContain('75,00%');
  });

  it('4. deve tratar itens com quantidade homologada zero de forma segura sem NaN ou Infinity', () => {
    const zeroModel: ManagementDashboardReadModel = {
      ...mockArpReadModel,
      arp: {
        totalAtas: 1,
        totalItens: 1,
        itensCriticosCount: 0,
        itensProximosLimiteCount: 0,
        quantidadeHomologadaTotal: 0,
        quantidadeEmpenhadaTotal: 0,
        saldoFisicoTotal: 0,
        percentualConsumoGlobal: 0,
        topItensConsumidos: [],
        itensCriticosDetalhe: [
          {
            itemKey: 'ZERO-ITEM',
            numeroAta: '99/2025',
            numeroItem: 1,
            descricaoItem: 'Item Especial Sem Quantitativo Inicial',
            quantidadeHomologada: 0,
            quantidadeConsumida: 0,
            saldoDisponivel: 0,
            percentualConsumido: 0,
            isCritico: false,
            isProximoLimite: false
          }
        ]
      }
    };

    const html = renderToStaticMarkup(<ManagementArpBalances readModel={zeroModel} />);

    expect(html).toContain('ZERO-ITEM');
    expect(html).toContain('0,00%');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('5. deve renderizar skeleton no estado de loading', () => {
    const html = renderToStaticMarkup(<ManagementArpBalances isLoading={true} />);

    expect(html).toContain('data-testid="management-arp-balances-loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-testid="management-arp-balances-section"');
  });

  it('6. deve exibir mensagem de erro explícito no estado de erro', () => {
    const html = renderToStaticMarkup(
      <ManagementArpBalances
        isError={true}
        errorMessage="Erro de conexão com v_arp_item_saldo_detalhado"
      />
    );

    expect(html).toContain('data-testid="management-arp-balances-error"');
    expect(html).toContain('Erro de conexão com v_arp_item_saldo_detalhado');
  });

  it('7. deve exibir empty state quando não houver dados de ARP', () => {
    const emptyModel: ManagementDashboardReadModel = {
      ...mockArpReadModel,
      arp: {
        totalAtas: 0,
        totalItens: 0,
        itensCriticosCount: 0,
        itensProximosLimiteCount: 0,
        quantidadeHomologadaTotal: 0,
        quantidadeEmpenhadaTotal: 0,
        saldoFisicoTotal: 0,
        percentualConsumoGlobal: 0,
        topItensConsumidos: [],
        itensCriticosDetalhe: []
      }
    };

    const html = renderToStaticMarkup(<ManagementArpBalances readModel={emptyModel} />);

    expect(html).toContain('data-testid="management-arp-balances-empty"');
    expect(html).toContain('Nenhuma Ata de Registro de Preços ou item encontrado');
  });
});
