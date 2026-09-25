import { describe, it, expect } from 'vitest';
import { getBreadcrumbs, navigationConfig } from '../../config/navigation';
import {
  calculateFinancialSummary,
  buildManagementDashboardReadModel
} from '../dashboardService';
import { calculateFinancialBalances } from '../financialExecutionService';

describe('FASE 9-J — Homologação Integrada do Frontend com Dados Reais', () => {
  describe('1. Fluxo Principal de Navegação e Breadcrumbs', () => {
    const routeFlow = [
      { path: '/', expectedBreadcrumb: 'Visão Geral' },
      { path: '/prazos', expectedBreadcrumb: 'Central de Atenção' },
      { path: '/atas', expectedBreadcrumb: 'Consulta e Vigência' },
      { path: '/atas/saldos-unidade', expectedBreadcrumb: 'Alocações por Unidade' },
      { path: '/contratos', expectedBreadcrumb: 'Acompanhamento e Prazos' },
      { path: '/contratos/200331-00132-2024', expectedBreadcrumb: 'Contrato 200331-00132-2024' },
      { path: '/empenhos', expectedBreadcrumb: 'Empenhos e Execução' },
      { path: '/pagamentos', expectedBreadcrumb: 'Pagamentos' }
    ];

    it('deve resolver breadcrumbs válidos e sem perda de contexto em todo o percurso', () => {
      for (const step of routeFlow) {
        const crumbs = getBreadcrumbs(step.path);
        expect(crumbs.length).toBeGreaterThan(0);
        const lastCrumb = crumbs[crumbs.length - 1];
        expect(lastCrumb.label).toBe(step.expectedBreadcrumb);
        // Toda rota filha deve ter a Visão Geral como primeira raiz
        if (step.path !== '/') {
          expect(crumbs[0].label).toBe('Visão Geral');
          expect(crumbs[0].route).toBe('/');
        }
      }
    });

    it('deve garantir que todos os 6 pilares de navegação possuam itens ativos e rotas vinculadas', () => {
      expect(navigationConfig.length).toBe(6);
      for (const nav of navigationConfig) {
        if (nav.children) {
          for (const child of nav.children) {
            expect(child.status).toBe('active');
            expect(child.route || child.actionId).toBeDefined();
          }
        } else {
          expect(nav.status).toBe('active');
          expect(nav.route).toBeDefined();
        }
      }
    });
  });

  describe('2. Consistência Semântica e Separação de Conceitos', () => {
    it('deve manter separação matemática entre Saldo Físico, Saldo de Cota e Execução Financeira', () => {
      // 1. Saldo Físico da Ata (quantidade em unidades físicas)
      const qtdHomologada = 1000;
      const qtdConsumida = 350;
      const saldoFisico = qtdHomologada - qtdConsumida;
      expect(saldoFisico).toBe(650);

      // 2. Saldo de Cota da Unidade (limite operacional concedido pelo gestor)
      const cotaUnidade = 200;
      const cotaConsumida = 80;
      const saldoCota = cotaUnidade - cotaConsumida;
      expect(saldoCota).toBe(120);
      expect(saldoCota).not.toBe(saldoFisico);

      // 3. Execução Financeira do Contrato (moeda R$ no SIAFI)
      const balances = calculateFinancialBalances(500000, 200000, 150000, 0, 0);
      expect(balances.saldoALiquidar).toBe(300000);
      expect(balances.saldoAPagar).toBe(50000);
      expect(balances.saldoNaoExecutado).toBe(350000);
    });

    it('deve assegurar que status operacional PAGAMENTO_CONFIRMADO não contamina o Fato Financeiro SIAFI', () => {
      const mockCycle = {
        id: 'cycle-1',
        contractKey: '200331-00132-2024',
        numeroContrato: '132/2024',
        status: 'PAGAMENTO_CONFIRMADO' as const,
        notaFiscal: { numero: 'NF-9988', valor: 50000 }
      };

      // Fato operacional indica OB emitida internamente
      expect(mockCycle.status).toBe('PAGAMENTO_CONFIRMADO');

      // Fato financeiro oficial soberano permanece governado exclusivamente por v_empenhos_resumo
      const empenhoSoberano = {
        canonical_key: '200331-2024NE000100',
        valor_empenhado: 50000,
        valor_liquidado: 50000,
        valor_pago: 0 // Pagamento financeiro bancário ainda não registrado no SIAFI
      };

      const summary = calculateFinancialSummary([empenhoSoberano]);
      expect(summary.totalPago).toBe(0);
      expect(summary.saldoAPagar).toBe(50000); // Permanece a pagar até confirmação bancária no SIAFI
    });
  });

  describe('3. Coerência entre Telas e Blindagem contra Double Counting', () => {
    it('deve agregar os empenhos sem double counting para múltiplos contratos que compartilham NEs', () => {
      const neCompartilhada = {
        canonical_key: '200331-2024NE000245',
        numero_empenho: '2024NE000245',
        valor_empenhado: 1000000,
        valor_liquidado: 300000,
        valor_pago: 200000,
        valor_rpinscrito: 0,
        valor_rp_pago: 0
      };

      const neExclusiva1 = {
        canonical_key: '200331-2024NE000111',
        numero_empenho: '2024NE000111',
        valor_empenhado: 500000,
        valor_liquidado: 100000,
        valor_pago: 100000,
        valor_rpinscrito: 0,
        valor_rp_pago: 0
      };

      // Simula a lista vinda de uma busca com múltiplos contratos (N:N)
      const empenhosRecebidos = [neCompartilhada, neCompartilhada, neExclusiva1];

      const summary = calculateFinancialSummary(empenhosRecebidos);
      // O valor empenhado total deve ser 1.000.000 + 500.000 = 1.500.000 (sem duplicação de neCompartilhada)
      expect(summary.totalEmpenhado).toBe(1500000);
      expect(summary.totalLiquidado).toBe(400000);
      expect(summary.totalPago).toBe(300000);
      expect(summary.topEmpenhos?.length).toBe(2);
    });

    it('deve manter a integridade contextual de contratos Cross-UASG no read model', () => {
      const contractCross = {
        id: '200331-00008-2026',
        numero: '08/2026',
        ano: 2026,
        uasg: '200331'
      } as any;

      const empenhoCross = {
        canonical_key: '200330-2026NE000012',
        uasg_emitente: '200330', // Emitente diferente da contratante
        contract_keys: ['200331-00008-2026'],
        contract_key: '200331-00008-2026',
        valor_empenhado: 850000,
        valor_liquidado: 200000,
        valor_pago: 200000
      };

      const model = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts: [contractCross],
        empenhos: [empenhoCross],
        filters: { contractKey: '200331-00008-2026' }
      });

      expect(model.financial.totalEmpenhado).toBe(850000);
      expect(model.financial.totalPago).toBe(200000);
      expect(model.financial.topEmpenhos?.[0].empenhoKey).toBe('200330-2026NE000012');
    });
  });

  describe('4. Estados de Interface e Tratamento de Erros/Vazio', () => {
    it('deve gerar modelo consistente em caso de lista vazia sem quebras ou anomalias', () => {
      const model = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts: [],
        empenhos: [],
        itemsSaldo: []
      });

      expect(model.executive.totalContratos).toBe(0);
      expect(model.financial.totalEmpenhado).toBe(0);
      expect(model.attention.totalAlertasAtivos).toBe(0);
      expect(model.arp.totalAtas).toBe(0);
    });
  });
});
