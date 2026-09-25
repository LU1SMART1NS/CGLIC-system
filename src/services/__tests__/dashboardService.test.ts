import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getContractDaysRemaining,
  calculateExecutiveKPIs,
  calculateDeadlinesSummary,
  calculateAttentionSummary,
  calculateFinancialSummary,
  calculateArpSummary,
  calculatePaymentsSummary,
  buildManagementDashboardReadModel,
  fetchManagementDashboardData
} from '../dashboardService';
import type {
  ContractDashboardRecord,
  ArpRecord,
  ContractManager,
  ContractTaskPlan,
  ContractEvent
} from '../../types';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';
import * as dbCacheService from '../dbCacheService';
import * as contractService from '../contractService';
import * as contractManagementService from '../contractManagementService';

vi.mock('../dbCacheService');
vi.mock('../contractService');
vi.mock('../contractManagementService');

describe('dashboardService (SaldoARP 3.0 — Fase 8-B)', () => {
  const referenceDate = new Date('2026-09-24T12:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getContractDaysRemaining', () => {
    it('returns null if dataFim is undefined or empty', () => {
      expect(getContractDaysRemaining(undefined, referenceDate)).toBeNull();
      expect(getContractDaysRemaining('', referenceDate)).toBeNull();
    });

    it('returns null if date format is invalid', () => {
      expect(getContractDaysRemaining('invalid-date', referenceDate)).toBeNull();
    });

    it('calculates difference in days correctly for valid dates', () => {
      const daysIso = getContractDaysRemaining('2026-10-24', referenceDate);
      expect(daysIso).toBe(30);

      const daysPast = getContractDaysRemaining('2026-09-20', referenceDate);
      expect(daysPast).toBe(-4);
    });
  });

  describe('calculateExecutiveKPIs', () => {
    it('handles empty contract list gracefully', () => {
      const kpis = calculateExecutiveKPIs([]);
      expect(kpis.totalContratos).toBe(0);
      expect(kpis.contratosAtivos).toBe(0);
      expect(kpis.contratosEncerrados).toBe(0);
      expect(kpis.contratosEmProrrogacao).toBe(0);
      expect(kpis.valorOriginalTotal).toBe(0);
      expect(kpis.valorVigenteTotal).toBe(0);
      expect(kpis.deltaAcumuladoTotal).toBe(0);
      expect(kpis.percentualVariacaoAcumulada).toBe(0);
    });

    it('calculates ativos, encerrados, prorrogacoes and value evolution totals accurately', () => {
      const contracts: ContractDashboardRecord[] = [
        {
          id: 'c1',
          numero: '10/2025',
          ano: 2025,
          numeroFormatado: '10/2025',
          uasg: '200331',
          fonteDados: 'Compras.gov.br',
          processo: '123',
          objeto: 'Serviço A',
          fornecedorNome: 'Empresa A',
          fornecedorCnpjCpf: '111',
          valorGlobal: 100000,
          valorInicial: 80000,
          statusVigencia: 'Vigente',
          dataVigenciaInicio: '2025-01-01',
          dataVigenciaFim: '2026-10-10'
        },
        {
          id: 'c2',
          numero: '20/2025',
          ano: 2025,
          numeroFormatado: '20/2025',
          uasg: '200331',
          fonteDados: 'Compras.gov.br',
          processo: '456',
          objeto: 'Serviço B',
          fornecedorNome: 'Empresa B',
          fornecedorCnpjCpf: '222',
          valorGlobal: 200000,
          valorInicial: 200000,
          statusVigencia: 'Vigente',
          dataVigenciaInicio: '2025-06-01',
          dataVigenciaFim: '2026-11-10'
        },
        {
          id: 'c3',
          numero: '30/2024',
          ano: 2024,
          numeroFormatado: '30/2024',
          uasg: '200331',
          fonteDados: 'Compras.gov.br',
          processo: '789',
          objeto: 'Serviço C',
          fornecedorNome: 'Empresa C',
          fornecedorCnpjCpf: '333',
          valorGlobal: 50000,
          valorInicial: 50000,
          statusVigencia: 'Expirado',
          dataVigenciaInicio: '2024-01-01',
          dataVigenciaFim: '2025-01-01'
        }
      ];

      const eventsMap: Record<string, ContractEvent[]> = {
        c1: [
          {
            id: 'ev1',
            contractId: 'c1',
            tipoEvento: 'PRORROGACAO',
            impacto: 'ALTERA_VALOR',
            numeroTermo: '1º Termo Aditivo',
            dataPublicacao: '2025-12-01',
            dataInicioVigencia: '2026-01-01',
            dataFimVigencia: '2027-01-01',
            variacaoValor: 20000,
            criadoEm: '2025-12-01T00:00:00Z',
            atualizadoEm: '2025-12-01T00:00:00Z'
          } as any
        ]
      };

      const kpis = calculateExecutiveKPIs(contracts, eventsMap);
      expect(kpis.totalContratos).toBe(3);
      expect(kpis.contratosAtivos).toBe(2);
      expect(kpis.contratosEncerrados).toBe(1);
      expect(kpis.contratosEmProrrogacao).toBe(1);
      expect(kpis.valorOriginalTotal).toBe(330000);
      expect(kpis.valorVigenteTotal).toBe(350000);
      expect(kpis.deltaAcumuladoTotal).toBe(20000);
      expect(kpis.percentualVariacaoAcumulada).toBeCloseTo(6.06, 2);
    });
  });

  describe('calculateDeadlinesSummary', () => {
    it('aggregates deadlines and groups items by urgency bracket', () => {
      const contracts: ContractDashboardRecord[] = [
        {
          id: 'c1',
          numero: '10/2025',
          ano: 2025,
          numeroFormatado: '10/2025',
          uasg: '200331',
          fonteDados: 'Compras.gov.br',
          objeto: 'Serviço A',
          fornecedorNome: 'Empresa A',
          statusVigencia: 'Vigente',
          dataVigenciaFim: '2026-10-04' // 10 days ahead -> 30D
        },
        {
          id: 'c2',
          numero: '20/2025',
          ano: 2025,
          numeroFormatado: '20/2025',
          uasg: '200331',
          fonteDados: 'Compras.gov.br',
          objeto: 'Serviço B',
          fornecedorNome: 'Empresa B',
          statusVigencia: 'Vigente',
          dataVigenciaFim: '2026-11-03' // 40 days ahead -> 60D
        },
        {
          id: 'c3',
          numero: '30/2025',
          ano: 2025,
          numeroFormatado: '30/2025',
          uasg: '200331',
          fonteDados: 'Compras.gov.br',
          objeto: 'Serviço C',
          fornecedorNome: 'Empresa C',
          statusVigencia: 'Vigente',
          dataVigenciaFim: '2026-12-10' // 77 days ahead -> 90D
        },
        {
          id: 'c4',
          numero: '40/2024',
          ano: 2024,
          numeroFormatado: '40/2024',
          uasg: '200331',
          fonteDados: 'Compras.gov.br',
          objeto: 'Serviço D',
          fornecedorNome: 'Empresa D',
          statusVigencia: 'Expirado',
          dataVigenciaFim: '2026-09-01' // -23 days -> VENCIDO
        }
      ];

      const summary = calculateDeadlinesSummary(contracts, referenceDate);
      expect(summary.vencendo30Dias).toBe(1);
      expect(summary.vencendo60Dias).toBe(1);
      expect(summary.vencendo90Dias).toBe(1);
      expect(summary.contratosVencidos).toBe(1);
      expect(summary.itensVencendo.length).toBe(4);
      expect(summary.itensVencendo[0].contractKey).toBe('c4');
      expect(summary.itensVencendo[0].faixa).toBe('VENCIDO');
      expect(summary.itensVencendo[1].contractKey).toBe('c1');
      expect(summary.itensVencendo[1].faixa).toBe('30D');
    });
  });

  describe('calculateAttentionSummary', () => {
    it('evaluates radar, central de prazos, and critical counts', () => {
      const contracts: ContractDashboardRecord[] = [
        {
          id: 'c1',
          numero: '10/2025',
          ano: 2025,
          numeroFormatado: '10/2025',
          uasg: '200331',
          fonteDados: 'Compras.gov.br',
          objeto: 'Serviço A',
          statusVigencia: 'Vigente',
          dataAssinatura: '2025-10-15',
          dataVigenciaInicio: '2025-10-15',
          dataVigenciaFim: '2026-10-15'
        }
      ];

      const arps: ArpRecord[] = [];
      const managers: Record<string, ContractManager> = {};
      const plans: Record<string, ContractTaskPlan> = {};
      const paymentCycles: PaymentFollowUpCycle[] = [
        {
          cycleKey: 'cy1',
          contractKey: 'c1',
          competencia: '2026-09',
          status: 'EM_INSTRUCAO',
          input: {
            contractKey: 'c1',
            competencia: '2026-09',
            dataAssinaturaAtesto: '2026-09-01',
            dataVencimentoFatura: '2026-09-20',
            documentoAtestoSei: 'Doc 100',
            valorAtesto: 10000
          },
          prazos: {
            diasUteisAteVencimento: 0,
            janelaTotalDiasUteis: 10,
            diasSemRespostaCgofi: 6,
            margemEnvioDiasUteis: 2,
            isVencida: true,
            statusPrazo: 'CRITICO'
          },
          alerts: [],
          criadoEm: '2026-09-01T00:00:00Z',
          atualizadoEm: '2026-09-01T00:00:00Z'
        }
      ];
      const arpItems = [
        { percentual_consumido: 90 },
        { percentual_consumido: 40 }
      ];

      const summary = calculateAttentionSummary({
        contracts,
        arps,
        managers,
        plans,
        paymentCycles,
        arpItems,
        currentDate: referenceDate
      });

      expect(summary.radarsReajuste.length).toBeGreaterThanOrEqual(1);
      expect(summary.pagamentosCriticosCount).toBe(1);
      expect(summary.atasCriticasCount).toBe(1);
      expect(summary.totalAlertasAtivos).toBeGreaterThan(0);
      expect(summary.criticalCount).toBeGreaterThan(0);
      expect(summary.items.length).toBeGreaterThan(0);
      expect(summary.items[0].severity).toBeDefined();
      expect(summary.prazosKpis).toBeDefined();
    });
  });

  describe('calculateFinancialSummary', () => {
    it('aggregates official empenho balances and flags Indicator 17 as unavailable', () => {
      const empenhos = [
        {
          valor_empenhado: 50000,
          valor_liquidado: 30000,
          valor_pago: 20000,
          valor_rpinscrito: 5000,
          valor_rp_pago: 2000
        },
        {
          valor_empenhado: 20000,
          valor_liquidado: 10000,
          valor_pago: 10000,
          valor_rpinscrito: 0,
          valor_rp_pago: 0
        }
      ];

      const summary = calculateFinancialSummary(empenhos);
      expect(summary.totalEmpenhado).toBe(70000);
      expect(summary.totalLiquidado).toBe(40000);
      expect(summary.totalPago).toBe(30000);
      expect(summary.saldoALiquidar).toBe(30000);
      expect(summary.saldoAPagar).toBe(10000);
      expect(summary.totalRpInscrito).toBe(5000);
      expect(summary.totalRpPago).toBe(2000);
      expect(summary.saldoRpPendente).toBe(3000);
      expect(summary.taxaLiquidacaoPercentual).toBeCloseTo(57.14, 2);
      expect(summary.taxaPagamentoPercentual).toBe(75);
      expect(summary.burnRateMensalDisponivel).toBe(false);
    });
  });

  describe('calculateArpSummary', () => {
    it('calculates ARP totals and physical item consumption stats with deterministic sorting', () => {
      const arps: ArpRecord[] = [
        {
          id: 'a1',
          numero: '01/2025',
          ano: 2025,
          objeto: 'Ata A'
        } as unknown as ArpRecord
      ];

      const rawItems = [
        {
          item_key: 'i1',
          numero_ata: '01/2025',
          numero_item: 1,
          descricao_item: 'Item 1',
          fornecedor_razao_social: 'Fornecedor X',
          quantidade_homologada: 100,
          quantidade_consumida: 90,
          saldo_disponivel: 10,
          percentual_consumido: 90,
          total_empenhos_vinculados: 3
        },
        {
          item_key: 'i2',
          numero_ata: '01/2025',
          numero_item: 2,
          descricao_item: 'Item 2',
          quantidade_homologada: 50,
          quantidade_consumida: 37.5,
          saldo_disponivel: 12.5,
          percentual_consumido: 75
        },
        {
          item_key: 'i3',
          numero_ata: '01/2025',
          numero_item: 3,
          descricao_item: 'Item 3',
          quantidade_homologada: 50,
          quantidade_consumida: 10,
          saldo_disponivel: 40,
          percentual_consumido: 20
        }
      ];

      const summary = calculateArpSummary(arps, rawItems);
      expect(summary.totalAtas).toBe(1);
      expect(summary.totalItens).toBe(3);
      expect(summary.itensCriticosCount).toBe(1);
      expect(summary.itensProximosLimiteCount).toBe(1);
      expect(summary.quantidadeHomologadaTotal).toBe(200);
      expect(summary.quantidadeEmpenhadaTotal).toBe(137.5);
      expect(summary.saldoFisicoTotal).toBe(62.5);
      expect(summary.percentualConsumoGlobal).toBe(68.75);

      expect(summary.topItensConsumidos.length).toBe(3);
      expect(summary.topItensConsumidos[0].itemKey).toBe('i1');
      expect(summary.topItensConsumidos[0].isCritico).toBe(true);
      expect(summary.topItensConsumidos[0].saldoDisponivel).toBe(10);
      expect(summary.topItensConsumidos[0].totalEmpenhosVinculados).toBe(3);

      expect(summary.topItensConsumidos[1].itemKey).toBe('i2');
      expect(summary.topItensConsumidos[1].isProximoLimite).toBe(true);

      // Itens críticos e próximos no detalhe
      expect(summary.itensCriticosDetalhe?.length).toBe(2);
      expect(summary.itensCriticosDetalhe?.[0].itemKey).toBe('i1');
      expect(summary.itensCriticosDetalhe?.[1].itemKey).toBe('i2');
    });

    it('safely handles items with zero homologated quantity without NaN or Infinity', () => {
      const summary = calculateArpSummary([], [
        {
          item_key: 'zero-1',
          numero_ata: '99/2025',
          numero_item: 1,
          quantidade_homologada: 0,
          quantidade_consumida: 0
        }
      ]);

      expect(summary.quantidadeHomologadaTotal).toBe(0);
      expect(summary.quantidadeEmpenhadaTotal).toBe(0);
      expect(summary.saldoFisicoTotal).toBe(0);
      expect(summary.percentualConsumoGlobal).toBe(0);
      expect(summary.topItensConsumidos[0].percentualConsumido).toBe(0);
    });
  });

  describe('calculatePaymentsSummary', () => {
    it('aggregates payment cycles and flags Indicator 18 as unavailable', () => {
      const cycles: PaymentFollowUpCycle[] = [
        {
          cycleKey: 'cy1',
          contractKey: 'c1',
          competencia: '2026-09',
          status: 'EM_INSTRUCAO',
          input: {
            contractKey: 'c1',
            competencia: '2026-09',
            dataAssinaturaAtesto: '2026-09-01',
            dataVencimentoFatura: '2026-09-20',
            documentoAtestoSei: 'Doc 100',
            valorAtesto: 10000
          },
          prazos: {
            diasUteisAteVencimento: 0,
            janelaTotalDiasUteis: 10,
            diasSemRespostaCgofi: 7,
            margemEnvioDiasUteis: 2,
            isVencida: true,
            statusPrazo: 'CRITICO'
          },
          alerts: [],
          criadoEm: '2026-09-01T00:00:00Z',
          atualizadoEm: '2026-09-20T10:00:00Z'
        },
        {
          cycleKey: 'cy2',
          contractKey: 'c1',
          competencia: '2026-08',
          status: 'CONCLUIDO',
          input: {
            contractKey: 'c1',
            competencia: '2026-08',
            dataAssinaturaAtesto: '2026-08-01',
            dataVencimentoFatura: '2026-08-20',
            documentoAtestoSei: 'Doc 90',
            valorAtesto: 10000
          },
          prazos: {
            diasUteisAteVencimento: 0,
            janelaTotalDiasUteis: 10,
            diasSemRespostaCgofi: 0,
            margemEnvioDiasUteis: 5,
            isVencida: false,
            statusPrazo: 'NORMAL'
          },
          alerts: [],
          criadoEm: '2026-08-01T00:00:00Z',
          atualizadoEm: '2026-09-22T10:00:00Z'
        }
      ];

      const summary = calculatePaymentsSummary(cycles);
      expect(summary.totalCiclos).toBe(2);
      expect(summary.ciclosAbertosCount).toBe(1);
      expect(summary.ciclosConcluidosCount).toBe(1);
      expect(summary.ciclosCriticosCount).toBe(1);
      expect(summary.ciclosAtrasoCgofiCount).toBe(1);
      expect(summary.faturasVencidasCount).toBe(1);
      expect(summary.distribuicaoPorEstado?.['EM_INSTRUCAO']).toBe(1);
      expect(summary.distribuicaoPorEstado?.['CONCLUIDO']).toBe(1);
      expect(summary.tempoMedioCgofiDisponivel).toBe(false);
      expect(summary.ciclosRecentes.length).toBe(2);
      expect(summary.ciclosRecentes[0].cycleKey).toBe('cy2');
      expect(summary.ciclosAbertosDetalhe?.length).toBe(1);
      expect(summary.ciclosAbertosDetalhe?.[0].cycleKey).toBe('cy1');
    });

    it('calculates average CGOFI response time when completed cycles have dispatch and OB data', () => {
      const cycles: PaymentFollowUpCycle[] = [
        {
          cycleKey: 'c-ob-1',
          contractKey: 'c1',
          competencia: '2026-07',
          status: 'PAGAMENTO_CONFIRMADO',
          input: {
            contractKey: 'c1',
            competencia: '2026-07',
            dataAssinaturaAtesto: '2026-07-01',
            dataVencimentoFatura: '2026-07-25',
            documentoAtestoSei: 'Doc 80',
            dataEnvioCgofi: '2026-07-10',
            dataOrdemBancaria: '2026-07-14',
            numeroOrdemBancaria: '2026OB800111',
            valorAtesto: 15000
          },
          prazos: {
            diasUteisAteVencimento: 0,
            janelaTotalDiasUteis: 15,
            diasSemRespostaCgofi: 4,
            margemEnvioDiasUteis: 9,
            isVencida: false,
            statusPrazo: 'NORMAL'
          },
          alerts: [],
          criadoEm: '2026-07-01T00:00:00Z',
          atualizadoEm: '2026-07-14T10:00:00Z'
        },
        {
          cycleKey: 'c-ob-2',
          contractKey: 'c1',
          competencia: '2026-08',
          status: 'CONCLUIDO',
          input: {
            contractKey: 'c1',
            competencia: '2026-08',
            dataAssinaturaAtesto: '2026-08-01',
            dataVencimentoFatura: '2026-08-25',
            documentoAtestoSei: 'Doc 85',
            dataEnvioCgofi: '2026-08-05',
            dataOrdemBancaria: '2026-08-11',
            numeroOrdemBancaria: '2026OB800222',
            valorAtesto: 20000
          },
          prazos: {
            diasUteisAteVencimento: 0,
            janelaTotalDiasUteis: 15,
            diasSemRespostaCgofi: 6,
            margemEnvioDiasUteis: 12,
            isVencida: false,
            statusPrazo: 'NORMAL'
          },
          alerts: [],
          criadoEm: '2026-08-01T00:00:00Z',
          atualizadoEm: '2026-08-11T10:00:00Z'
        }
      ];

      const summary = calculatePaymentsSummary(cycles);
      expect(summary.totalCiclos).toBe(2);
      expect(summary.ciclosConcluidosCount).toBe(2);
      expect(summary.ciclosAbertosCount).toBe(0);
      expect(summary.tempoMedioCgofiDisponivel).toBe(true);
      expect(summary.tempoMedioCgofiDias).toBe(5); // (4 + 6) / 2 = 5.0
    });
  });

  describe('buildManagementDashboardReadModel', () => {
    it('builds complete read model structure with deterministic timestamps', () => {
      const model = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts: [],
        arps: [],
        managers: {},
        plans: {},
        currentDate: referenceDate
      });

      expect(model.uasg).toBe('200331');
      expect(model.dataCalculo).toBe('2026-09-24T12:00:00.000Z');
      expect(model.executive).toBeDefined();
      expect(model.deadlines).toBeDefined();
      expect(model.attention).toBeDefined();
      expect(model.financial).toBeDefined();
      expect(model.arp).toBeDefined();
      expect(model.payments).toBeDefined();
    });

    it('filters dataset across all dimensions when contractKey filter is applied', () => {
      const contracts = [
        {
          id: 'c1',
          numero: '10/2025',
          ano: 2025,
          valorGlobal: 100000,
          status: 'ATIVO',
          uasg: '200331'
        } as any,
        {
          id: 'c2',
          numero: '20/2025',
          ano: 2025,
          valorGlobal: 200000,
          status: 'ATIVO',
          uasg: '200331'
        } as any
      ];

      const empenhos = [
        {
          numero_empenho: '2026NE000100',
          numero_contrato: '10/2025',
          valor_empenhado: 50000,
          valor_liquidado: 30000,
          valor_pago: 20000
        },
        {
          numero_empenho: '2026NE000200',
          numero_contrato: '20/2025',
          valor_empenhado: 80000,
          valor_liquidado: 40000,
          valor_pago: 10000
        }
      ];

      const itemsSaldo = [
        {
          item_key: 'i1',
          numero_ata: '01/2025',
          numero_item: 1,
          contract_key: 'c1',
          quantidade_homologada: 100,
          quantidade_consumida: 50
        },
        {
          item_key: 'i2',
          numero_ata: '02/2025',
          numero_item: 1,
          contract_key: 'c2',
          quantidade_homologada: 200,
          quantidade_consumida: 20
        }
      ];

      const paymentCycles = [
        {
          cycleKey: 'c1-pgto-1',
          contractKey: 'c1',
          status: 'EM_INSTRUCAO',
          input: { valorAtesto: 15000 },
          prazos: { diasUteisAteVencimento: 5, statusPrazo: 'NORMAL' },
          alerts: []
        } as any,
        {
          cycleKey: 'c2-pgto-1',
          contractKey: 'c2',
          status: 'CONCLUIDO',
          input: { valorAtesto: 25000 },
          prazos: { diasUteisAteVencimento: 0, statusPrazo: 'NORMAL' },
          alerts: []
        } as any
      ];

      // Global (unfiltered)
      const globalModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts,
        empenhos,
        itemsSaldo,
        paymentCycles,
        currentDate: referenceDate
      });

      expect(globalModel.executive.totalContratos).toBe(2);
      expect(globalModel.executive.valorVigenteTotal).toBe(300000);
      expect(globalModel.financial.totalEmpenhado).toBe(130000);
      expect(globalModel.payments.totalCiclos).toBe(2);
      expect(globalModel.availableFilters?.contracts.length).toBe(2);

      // Filtered by contractKey: 'c1'
      const filteredModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts,
        empenhos,
        itemsSaldo,
        paymentCycles,
        filters: { contractKey: 'c1' },
        currentDate: referenceDate
      });

      expect(filteredModel.executive.totalContratos).toBe(1);
      expect(filteredModel.executive.valorVigenteTotal).toBe(100000);
      expect(filteredModel.financial.totalEmpenhado).toBe(50000);
      expect(filteredModel.financial.totalPago).toBe(20000);
      expect(filteredModel.arp.totalItens).toBe(1);
      expect(filteredModel.payments.totalCiclos).toBe(1);
      expect(filteredModel.payments.ciclosAbertosCount).toBe(1);
      expect(filteredModel.filtersApplied?.contractKey).toBe('c1');
    });

    it('filters ARP dimension when numeroAta filter is applied', () => {
      const itemsSaldo = [
        {
          item_key: 'i1',
          numero_ata: '10/2025',
          numero_item: 1,
          quantidade_homologada: 100,
          quantidade_consumida: 90
        },
        {
          item_key: 'i2',
          numero_ata: '20/2025',
          numero_item: 1,
          quantidade_homologada: 50,
          quantidade_consumida: 10
        }
      ];

      const model = buildManagementDashboardReadModel({
        uasg: '200331',
        itemsSaldo,
        filters: { numeroAta: '10/2025' },
        currentDate: referenceDate
      });

      expect(model.arp.totalItens).toBe(1);
      expect(model.arp.topItensConsumidos[0].numeroAta).toBe('10/2025');
      expect(model.arp.quantidadeHomologadaTotal).toBe(100);
      expect(model.arp.quantidadeEmpenhadaTotal).toBe(90);
    });
  });

  describe('fetchManagementDashboardData', () => {
    it('fetches and consolidates data across all data providers', async () => {
      vi.mocked(contractService.fetchContractsForDashboard).mockResolvedValue([
        {
          id: 'c1',
          numero: '01/2026',
          ano: 2026,
          numeroFormatado: '01/2026',
          processo: '999',
          objeto: 'Objeto Teste',
          fornecedorNome: 'Fornecedor',
          fornecedorCnpjCpf: '000',
          valorGlobal: 50000,
          statusVigencia: 'Vigente',
          uasg: '200331',
          fonteDados: 'Compras.gov.br'
        }
      ]);

      vi.mocked(dbCacheService.fetchArpsFromDb).mockResolvedValue({
        arps: [
          {
            id: 'a1',
            numero: '01/2026',
            ano: 2026,
            objeto: 'Ata Teste'
          } as any
        ],
        syncInfo: { lastSync: '2026-09-24T00:00:00Z', totalAtas: 1 } as any
      });

      vi.mocked(contractManagementService.fetchAllContractManagers).mockResolvedValue({});
      vi.mocked(contractManagementService.fetchAllContractTaskPlans).mockResolvedValue({});

      const result = await fetchManagementDashboardData('200331', referenceDate);
      expect(result.uasg).toBe('200331');
      expect(result.executive.totalContratos).toBe(1);
      expect(result.arp.totalAtas).toBe(1);
    });
  });
});
