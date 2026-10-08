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
  fetchManagementDashboardData,
  fetchAllPaymentCyclesForDashboard
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
import * as paymentCycleRpcAdapter from '../../adapters/paymentCycleRpcAdapter';

vi.mock('../dbCacheService');
vi.mock('../contractService');
vi.mock('../contractManagementService');
vi.mock('../../adapters/paymentCycleRpcAdapter');

describe('dashboardService (CGLIC 3.0 — Fase 8-B)', () => {
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

  describe('buildManagementDashboardReadModel — empenhos por UASG', () => {
    it('não conta o empenho de outra UASG (evita somar em dobro entre as duas UASGs)', () => {
      const empenhos = [
        { empenho_id: 'a', uasg_emitente: '200331', valor_empenhado: 100, valor_liquidado: 0, valor_pago: 0 },
        { empenho_id: 'b', uasg_emitente: '200330', valor_empenhado: 50, valor_liquidado: 0, valor_pago: 0 },
        { empenho_id: 'c', valor_empenhado: 10, valor_liquidado: 0, valor_pago: 0 }
      ];
      const rm = buildManagementDashboardReadModel({ uasg: '200331', empenhos, currentDate: new Date('2026-10-02T12:00:00-03:00') });
      expect(rm.financial.totalEmpenhado).toBe(110);
    });
  });

  describe('buildManagementDashboardReadModel — só Atas vigentes', () => {
    it('ignora Ata vencida no total, no saldo crítico e nas tarefas', () => {
      const now = new Date('2026-10-02T12:00:00-03:00');
      const vigente = { numeroAtaRegistroPreco: '00001/2026', codigoUnidadeGerenciadora: '200331', dataVigenciaFinal: '2027-06-30' } as ArpRecord;
      const vencida = { numeroAtaRegistroPreco: '00002/2025', codigoUnidadeGerenciadora: '200331', dataVigenciaFinal: '2026-01-01' } as ArpRecord;
      const atrasada = { id: 't', nome: 'Atrasada', prazo: '2026-09-01', status: 'PENDENTE' };
      const plan = (key: string) => ({ id: key, ataKey: key, templateNome: 'T', appliedAt: '', progresso: {}, macrotarefas: [{ id: `m${key}`, planId: key, nome: 'M', ordem: 1, tarefas: [{ ...atrasada, id: `t${key}` }] }] }) as any;
      const rm = buildManagementDashboardReadModel({
        uasg: '200331',
        arps: [vigente, vencida],
        ataPlans: { '00001/2026': plan('00001/2026'), '00002/2025': plan('00002/2025') },
        itemsSaldo: [
          { item_key: 'a', numero_ata: '00001/2026', numero_item: 1, percentual_consumido: 90 },
          { item_key: 'b', numero_ata: '00002/2025', numero_item: 1, percentual_consumido: 95 }
        ],
        currentDate: now
      });
      expect(rm.arp.totalAtas).toBe(1);
      const ids = rm.attention.items.map((i) => i.id);
      expect(ids).toContain('ATT-ATA-TASK-t00001/2026');
      expect(ids).not.toContain('ATT-ATA-TASK-t00002/2025');
      expect(rm.attention.items.filter((i) => i.category === 'ATA_CRITICA')).toHaveLength(1);
    });
  });

  describe('calculateAttentionSummary — prazo da etapa da CGLIC nos ciclos de pagamento', () => {
    const cicloComEtapa = (etapaAtual: PaymentFollowUpCycle['etapaAtual'], status: PaymentFollowUpCycle['status'] = 'RECEBIDO'): PaymentFollowUpCycle => ({
      cycleKey: 'c1-PGTO-202610-12345678',
      contractKey: 'c1',
      competencia: '2026-10',
      status,
      input: {
        contractKey: 'c1',
        competencia: '2026-10',
        dataRecebimento: '2026-10-01',
        dataAssinaturaAtesto: '2026-10-01',
        dataVencimentoFatura: '2026-12-30',
        documentoAtestoSei: '12345678',
        valorAtesto: 1000
      },
      prazos: { diasUteisAteVencimento: 60, janelaTotalDiasUteis: 60, diasSemRespostaCgofi: 0, margemEnvioDiasUteis: 0, isVencida: false, statusPrazo: 'NORMAL' },
      etapaAtual,
      alerts: [],
      criadoEm: '2026-10-01T00:00:00Z',
      atualizadoEm: '2026-10-01T00:00:00Z'
    });
    const itensDoCiclo = (cycle: PaymentFollowUpCycle) =>
      calculateAttentionSummary({ paymentCycles: [cycle] }).items.filter((i) => i.cycleKey === cycle.cycleKey);

    it('conferência atrasada aparece como urgente, com o atraso em dias úteis', () => {
      const [item] = itensDoCiclo(cicloComEtapa({ etapa: 'CONFERENCIA', dono: 'CGLIC', dataAlvo: '2026-10-07', diasUteisRestantes: -2, atrasado: true }));
      expect(item).toMatchObject({ category: 'PAGAMENTO_CRITICO', severity: 'URGENTE', badgeLabel: '2d úteis de atraso', contractKey: 'c1' });
      expect(item.title).toContain('Conferir a documentação (12345678): atrasada há 2 dias úteis');
    });

    it('prazo da etapa dentro da janela de aviso vira atenção; fora dela não aparece', () => {
      const [aviso] = itensDoCiclo(cicloComEtapa({ etapa: 'ENVIO', dono: 'CGLIC', dataAlvo: '2026-10-09', diasUteisRestantes: 1, atrasado: false }, 'CONFERIDO'));
      expect(aviso).toMatchObject({ severity: 'ATENCAO' });
      expect(aviso.title).toContain('Enviar à CGOFI (12345678): prazo em 1 dia útil');

      const longe = itensDoCiclo(cicloComEtapa({ etapa: 'CONFERENCIA', dono: 'CGLIC', dataAlvo: '2026-10-20', diasUteisRestantes: 9, atrasado: false }));
      expect(longe).toEqual([]);
    });

    it('na CGOFI o prazo é de cobrança e não gera item de atraso da CGLIC; sem prazo de etapa também não', () => {
      const naCgofi = itensDoCiclo(cicloComEtapa({ etapa: 'COBRANCA_CGOFI', dono: 'CGOFI', dataAlvo: '2026-10-07', diasUteisRestantes: -3, atrasado: true }, 'ENVIADO_CGOFI'));
      expect(naCgofi).toEqual([]);
      expect(itensDoCiclo(cicloComEtapa(undefined))).toEqual([]);
    });
  });

  describe('calculateAttentionSummary — Atas', () => {
    const now = new Date('2026-10-02T12:00:00-03:00');
    const arp = { numeroAtaRegistroPreco: '00041/2026', codigoUnidadeGerenciadora: '200331' } as ArpRecord;
    const task = (id: string, prazo: string, status = 'PENDENTE') => ({ id, nome: `Tarefa ${id}`, prazo, status });
    const ataPlans: any = {
      '00041/2026': {
        id: 'p', ataKey: '00041/2026', templateNome: 'T', appliedAt: '2026-01-01', progresso: {},
        macrotarefas: [{
          id: 'm', planId: 'p', nome: 'Atividades Preliminares', ordem: 1,
          tarefas: [task('hoje', '2026-10-02'), task('em2dias', '2026-10-04'), task('longe', '2026-12-01'), task('feita', '2026-10-02', 'CONCLUIDA')]
        }]
      }
    };

    it('inclui tarefas de plano de Ata vencendo em até 7 dias e ignora distantes e concluídas', () => {
      const { items } = calculateAttentionSummary({ arps: [arp], ataPlans, currentDate: now });
      const ids = items.map((i) => i.id);
      expect(ids).toEqual(expect.arrayContaining(['ATT-ATA-TASK-hoje', 'ATT-ATA-TASK-em2dias']));
      expect(ids).not.toContain('ATT-ATA-TASK-longe');
      expect(ids).not.toContain('ATT-ATA-TASK-feita');
      expect(items.find((i) => i.id === 'ATT-ATA-TASK-hoje')).toMatchObject({ severity: 'URGENTE', numeroAta: '00041/2026' });
    });

    it('inclui tarefa de Ata entre 8 e 30 dias como atenção', () => {
      const plans: any = { '00041/2026': { ...ataPlans['00041/2026'], macrotarefas: [{ ...ataPlans['00041/2026'].macrotarefas[0], tarefas: [task('em15', '2026-10-17')] }] } };
      const { items } = calculateAttentionSummary({ arps: [arp], ataPlans: plans, currentDate: now });
      expect(items.find((i) => i.id === 'ATT-ATA-TASK-em15')).toMatchObject({ severity: 'ATENCAO' });
    });

    it('inclui lembretes de vigência da Ata e respeita os dispensados', () => {
      const vigente = { ...arp, dataVigenciaFinal: '2026-12-15' } as ArpRecord;
      const base = calculateAttentionSummary({ arps: [vigente], currentDate: now }).items.filter((i) => i.category === 'LEMBRETE');
      expect(base.length).toBeGreaterThan(0);
      expect(base.every((i) => i.severity === 'INFO' && i.numeroAta === '00041/2026')).toBe(true);
      const chaves = base.map((i) => i.avisoChave!);
      expect(chaves.every((c) => c.startsWith('LEMBRETE::ARP::00041/2026-'))).toBe(true);
      const after = calculateAttentionSummary({ arps: [vigente], avisosResolvidos: new Set(chaves), currentDate: now });
      expect(after.items.filter((i) => i.category === 'LEMBRETE')).toEqual([]);
      expect(after.resolvidos?.map((i) => i.id).sort()).toEqual(base.map((i) => i.id).sort());
    });

    it('inclui saldo de item entre 70% e 85% como atenção', () => {
      const { items } = calculateAttentionSummary({
        arps: [arp],
        arpItems: [{ percentual_consumido: 75, numero_ata: '00041/2026', numero_item: 1, codigo_uasg: '200331' } as any],
        currentDate: now
      });
      expect(items.find((i) => i.category === 'ATA_CRITICA')).toMatchObject({ severity: 'ATENCAO' });
    });

    it('saldo resolvido sai da lista e volta quando o nível piora (mesma chave da Ata 360)', () => {
      const item = (pct: number) => ({ percentual_consumido: pct, numero_ata: '00041/2026', numero_item: '00001', codigo_uasg: '200331' }) as any;
      const atencao = calculateAttentionSummary({ arps: [arp], arpItems: [item(75)], currentDate: now }).items[0];
      expect(atencao.avisoChave).toBe('SALDO::00041/2026-200331::1::ATENCAO');
      const resolvido = calculateAttentionSummary({ arps: [arp], arpItems: [item(75)], avisosResolvidos: new Set([atencao.avisoChave!]), currentDate: now });
      expect(resolvido.items.filter((i) => i.category === 'ATA_CRITICA')).toEqual([]);
      expect(resolvido.resolvidos).toHaveLength(1);
      const piorou = calculateAttentionSummary({ arps: [arp], arpItems: [item(100)], avisosResolvidos: new Set([atencao.avisoChave!]), currentDate: now });
      expect(piorou.items.filter((i) => i.category === 'ATA_CRITICA')).toHaveLength(1);
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
          status: 'RECEBIDO',
          input: {
            contractKey: 'c1',
            competencia: '2026-09',
            dataRecebimento: '2026-09-01',
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
          status: 'ENVIADO_CGOFI',
          input: {
            contractKey: 'c1',
            competencia: '2026-09',
            dataRecebimento: '2026-09-01',
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
          alerts: [
            { id: 'a1', cycleKey: 'cy1', contractKey: 'c1', nivel: 'ATENCAO', tipo: 'CGOFI_SEM_RESPOSTA', mensagem: 'Cobrar a CGOFI', diasRelevantes: 7 }
          ],
          criadoEm: '2026-09-01T00:00:00Z',
          atualizadoEm: '2026-09-20T10:00:00Z'
        },
        {
          cycleKey: 'cy2',
          contractKey: 'c1',
          competencia: '2026-08',
          status: 'PAGO',
          input: {
            contractKey: 'c1',
            competencia: '2026-08',
            dataRecebimento: '2026-08-01',
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
      expect(summary.distribuicaoPorEstado?.['ENVIADO_CGOFI']).toBe(1);
      expect(summary.distribuicaoPorEstado?.['PAGO']).toBe(1);
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
          status: 'PAGO',
          input: {
            contractKey: 'c1',
            competencia: '2026-07',
            dataRecebimento: '2026-07-01',
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
          status: 'PAGO',
          input: {
            contractKey: 'c1',
            competencia: '2026-08',
            dataRecebimento: '2026-08-01',
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
          status: 'RECEBIDO',
          input: { valorAtesto: 15000 },
          prazos: { diasUteisAteVencimento: 5, statusPrazo: 'NORMAL' },
          alerts: []
        } as any,
        {
          cycleKey: 'c2-pgto-1',
          contractKey: 'c2',
          status: 'PAGO',
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

    it('scopes all dimensions to assignedContractKeys (perfil "gestor", escopo ASSIGNED)', () => {
      const contracts = [
        { id: 'c1', numero: '10/2025', ano: 2025, valorGlobal: 100000, status: 'ATIVO', uasg: '200331' } as any,
        { id: 'c2', numero: '20/2025', ano: 2025, valorGlobal: 200000, status: 'ATIVO', uasg: '200331' } as any
      ];

      const empenhos = [
        { numero_empenho: '2026NE000100', numero_contrato: '10/2025', valor_empenhado: 50000, valor_liquidado: 30000, valor_pago: 20000 },
        { numero_empenho: '2026NE000200', numero_contrato: '20/2025', valor_empenhado: 80000, valor_liquidado: 40000, valor_pago: 10000 }
      ];

      const itemsSaldo = [
        { item_key: 'i1', numero_ata: '01/2025', numero_item: 1, contract_key: 'c1', quantidade_homologada: 100, quantidade_consumida: 50 },
        { item_key: 'i2', numero_ata: '02/2025', numero_item: 1, contract_key: 'c2', quantidade_homologada: 200, quantidade_consumida: 20 }
      ];

      const paymentCycles = [
        { cycleKey: 'c1-pgto-1', contractKey: 'c1', status: 'RECEBIDO', input: { valorAtesto: 15000 }, prazos: { diasUteisAteVencimento: 5, statusPrazo: 'NORMAL' }, alerts: [] } as any,
        { cycleKey: 'c2-pgto-1', contractKey: 'c2', status: 'PAGO', input: { valorAtesto: 25000 }, prazos: { diasUteisAteVencimento: 0, statusPrazo: 'NORMAL' }, alerts: [] } as any
      ];

      const managers = {
        c1: { contractKey: 'c1', uasg: '200331', numero: '10/2025', ano: 2025, gestorNome: 'Fulano', gestorUserId: 'gestor-1', createdAt: '', updatedAt: '' },
        c2: { contractKey: 'c2', uasg: '200331', numero: '20/2025', ano: 2025, gestorNome: 'Ciclano', gestorUserId: 'gestor-2', createdAt: '', updatedAt: '' }
      };

      // Escopo do gestor-1: só enxerga o contrato 'c1' — os agregados
      // (executive/financial/arp/payments) devem nascer já recortados,
      // não só a lista de exibição.
      const scopedModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts,
        empenhos,
        itemsSaldo,
        paymentCycles,
        managers,
        filters: { assignedContractKeys: ['c1'] },
        currentDate: referenceDate
      });

      expect(scopedModel.executive.totalContratos).toBe(1);
      expect(scopedModel.executive.valorVigenteTotal).toBe(100000);
      expect(scopedModel.financial.totalEmpenhado).toBe(50000);
      expect(scopedModel.arp.totalItens).toBe(1);
      expect(scopedModel.payments.totalCiclos).toBe(1);
      expect(scopedModel.availableFilters?.contracts.length).toBe(2); // catálogo bruto, não usado como lista navegável

      // Um gestor sem nenhum contrato atribuído (conjunto vazio) não deve
      // enxergar nada — nunca cair de volta para o comportamento GLOBAL.
      const emptyScopeModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts,
        empenhos,
        itemsSaldo,
        paymentCycles,
        managers,
        filters: { assignedContractKeys: ['contrato-inexistente'] },
        currentDate: referenceDate
      });

      expect(emptyScopeModel.executive.totalContratos).toBe(0);
      expect(emptyScopeModel.financial.totalEmpenhado).toBe(0);
      expect(emptyScopeModel.payments.totalCiclos).toBe(0);
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
            objeto: 'Ata Teste',
            dataVigenciaFinal: '2027-06-30'
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

  describe('fetchAllPaymentCyclesForDashboard (Fase 10-A.2.1 — GAP corrigido: visão consolidada não lia mais localStorage)', () => {
    it('retorna array vazio quando não há contratos', async () => {
      const result = await fetchAllPaymentCyclesForDashboard([]);
      expect(result).toEqual([]);
      expect(paymentCycleRpcAdapter.fetchPaymentCyclesForContracts).not.toHaveBeenCalled();
    });

    it('busca ciclos via Supabase (contract_payment_cycles) para as chaves de contrato informadas, nunca via localStorage', async () => {
      const contracts: ContractDashboardRecord[] = [
        { id: 'c1', numero: '01/2026', ano: 2026, numeroFormatado: '01/2026', uasg: '200331', objeto: 'X', fornecedorNome: 'F', statusVigencia: 'Vigente', fonteDados: 'PNCP' } as any
      ];

      vi.mocked(paymentCycleRpcAdapter.fetchPaymentCyclesForContracts).mockResolvedValue([
        {
          id: 'row-1',
          cycle_key: 'c1-PGTO-202609-DOC1',
          contract_key: 'c1',
          competencia: '2026-09',
          documento_atesto_sei: 'Doc 1',
          valor_atesto: 1000,
          data_assinatura_atesto: '2026-09-01',
          data_vencimento_fatura: '2026-09-20',
          status: 'RECEBIDO',
          origem_dado: 'MANUAL',
          criado_em: '2026-09-01T00:00:00Z',
          atualizado_em: '2026-09-01T00:00:00Z'
        } as any
      ]);

      const result = await fetchAllPaymentCyclesForDashboard(contracts);

      expect(paymentCycleRpcAdapter.fetchPaymentCyclesForContracts).toHaveBeenCalledWith(['c1']);
      expect(result).toHaveLength(1);
      expect(result[0].cycleKey).toBe('c1-PGTO-202609-DOC1');
      expect(result[0].contractKey).toBe('c1');
    });

    it('retorna array vazio (sem lançar) se a consulta ao Supabase falhar', async () => {
      const contracts: ContractDashboardRecord[] = [
        { id: 'c1', numero: '01/2026', ano: 2026, numeroFormatado: '01/2026', uasg: '200331', objeto: 'X', fornecedorNome: 'F', statusVigencia: 'Vigente', fonteDados: 'PNCP' } as any
      ];
      vi.mocked(paymentCycleRpcAdapter.fetchPaymentCyclesForContracts).mockRejectedValue(new Error('network error'));

      const result = await fetchAllPaymentCyclesForDashboard(contracts);
      expect(result).toEqual([]);
    });
  });
});
