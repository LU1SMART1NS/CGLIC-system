import { describe, it, expect } from 'vitest';
import {
  buildManagementDashboardReadModel,
  calculateFinancialSummary
} from '../dashboardService';
import type {
  ContractDashboardRecord,
  ArpRecord,
  ContractEvent
} from '../../types';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';

describe('FASE 8-J — HOMOLOGAÇÃO INTEGRADA DO DASHBOARD GERENCIAL', () => {
  const currentDate = new Date(2026, 8, 24); // 24 de Setembro de 2026

  const mockContractA: ContractDashboardRecord = {
    id: 'CONTRATO::200331::00010::2026',
    numero: '00010',
    ano: 2026,
    numeroFormatado: '00010/2026',
    uasg: '200331',
    nomeUnidadeGestora: 'Coordenação-Geral de Logística',
    objeto: 'Serviços de Manutenção e Suporte Predial',
    processo: '08020.000100/2026-01',
    fornecedorNome: 'Predial Serviços Especializados Ltda',
    fornecedorCnpjCpf: '11.222.333/0001-44',
    valorGlobal: 500000.0,
    valorInicial: 500000.0,
    dataAssinatura: '2026-01-10',
    dataVigenciaInicio: '2026-01-10',
    dataVigenciaFim: '2027-01-10',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  const mockContractB: ContractDashboardRecord = {
    id: 'CONTRATO::200331::00020::2026',
    numero: '00020',
    ano: 2026,
    numeroFormatado: '00020/2026',
    uasg: '200331',
    nomeUnidadeGestora: 'Coordenação-Geral de Logística',
    objeto: 'Fornecimento de Licenças de Software',
    processo: '08020.000200/2026-02',
    fornecedorNome: 'Softwares Globais S.A.',
    fornecedorCnpjCpf: '22.333.444/0001-55',
    valorGlobal: 120000.0,
    valorInicial: 100000.0,
    dataAssinatura: '2025-10-15',
    dataVigenciaInicio: '2025-10-15',
    dataVigenciaFim: '2026-10-15', // A vencer em < 30 dias a partir de 2026-09-24
    statusVigencia: 'A Vencer (60d)',
    fonteDados: 'Contratos.gov.br'
  };

  const mockContractCEncerrado: ContractDashboardRecord = {
    id: 'CONTRATO::200331::00005::2025',
    numero: '00005',
    ano: 2025,
    numeroFormatado: '00005/2025',
    uasg: '200331',
    nomeUnidadeGestora: 'Coordenação-Geral de Logística',
    objeto: 'Serviço Concluído Anterior',
    processo: '08020.000050/2025-99',
    fornecedorNome: 'Antiga Prestadora Ltda',
    valorGlobal: 50000.0,
    valorInicial: 50000.0,
    dataAssinatura: '2025-01-01',
    dataVigenciaInicio: '2025-01-01',
    dataVigenciaFim: '2025-12-31',
    statusVigencia: 'Expirado',
    fonteDados: 'Contratos.gov.br'
  };

  const mockArpA: ArpRecord = {
    numeroAtaRegistroPreco: '10/2026',
    codigoUnidadeGerenciadora: '200331',
    nomeUnidadeGerenciadora: 'Coordenação-Geral de Logística',
    codigoOrgao: 200331,
    nomeOrgao: 'Ministério da Justiça',
    numeroCompra: '00001',
    anoCompra: '2026',
    codigoModalidadeCompra: '5',
    nomeModalidadeCompra: 'Pregão Eletrônico',
    dataAssinatura: '2026-01-05',
    dataVigenciaInicial: '2026-01-05',
    dataVigenciaFinal: '2027-01-05',
    valorTotal: 250000.0,
    statusAta: 'Vigente',
    objeto: 'Registro de Preços para Material de Consumo e TI',
    quantidadeItens: 2,
    dataHoraAtualizacao: '2026-01-05T00:00:00Z',
    dataHoraInclusao: '2026-01-05T00:00:00Z',
    dataHoraExclusao: null,
    ataExcluido: false,
    numeroControlePncpAta: 'PNCP-ATA-10-2026',
    numeroControlePncpCompra: 'PNCP-COMPRA-01-2026',
    idCompra: 'COMPRA-01-2026'
  };

  const mockArpItemA1 = {
    item_key: 'ITEM::200331::10/2026::1',
    numero_ata: '10/2026',
    numero_item: '1',
    descricao_item: 'Nobreak Senoidal 1500VA',
    quantidade_homologada: 100,
    quantidade_consumida: 85, // Restam 15 (15% -> CRITICO < 20% / Consumo >= 85%)
    saldo_disponivel: 15,
    percentual_consumido: 85,
    valor_unitario: 1000.0,
    status_saldo: 'CRITICO' as const
  };

  const mockArpItemA2 = {
    item_key: 'ITEM::200331::10/2026::2',
    numero_ata: '10/2026',
    numero_item: '2',
    descricao_item: 'Cabo de Rede UTP Cat6 Bobina 305m',
    quantidade_homologada: 50,
    quantidade_consumida: 10, // Restam 40 (20% consumido -> REGULAR)
    saldo_disponivel: 40,
    percentual_consumido: 20,
    valor_unitario: 500.0,
    status_saldo: 'REGULAR' as const
  };

  const createMockPaymentCycle = (
    partial: Partial<PaymentFollowUpCycle> & { contractKey: string; status: PaymentFollowUpCycle['status'] }
  ): PaymentFollowUpCycle => {
    const { contractKey, status, ...rest } = partial;
    return {
      cycleKey: rest.cycleKey || `${contractKey}-PGTO-202608-01`,
      contractKey,
      competencia: rest.competencia || '2026-08',
      status,
      input: {
        contractKey,
        competencia: rest.competencia || '2026-08',
        dataAssinaturaAtesto: '2026-08-15',
        dataVencimentoFatura: '2026-09-15',
        documentoAtestoSei: 'Doc 12345',
        valorAtesto: 25000.0,
        ...rest.input
      },
      prazos: {
        diasUteisAteVencimento: 10,
        janelaTotalDiasUteis: 20,
        diasSemRespostaCgofi: 0,
        margemEnvioDiasUteis: 5,
        isVencida: false,
        statusPrazo: 'NORMAL',
        ...rest.prazos
      },
      alerts: rest.alerts || [],
      criadoEm: '2026-08-15T10:00:00Z',
      atualizadoEm: '2026-08-20T10:00:00Z',
      ...rest
    };
  };

  // --------------------------------------------------------------------------
  // 1. CENÁRIO INTEGRADO A: ARP → EMPENHO → CONTRATO
  // --------------------------------------------------------------------------
  describe('1. CENÁRIO INTEGRADO A: ARP → EMPENHO → CONTRATO', () => {
    it('deve calcular saldo físico da ARP sem misturar quantidade com valores financeiros', () => {
      const empenhoArpContrato = {
        id: 'EMP-01',
        numero_empenho: '2026NE000100',
        uasg: '200331',
        numero_contrato: '00010/2026',
        numero_ata: '10/2026',
        item_key: 'ITEM::200331::10/2026::1',
        valor_empenhado: 85000.0, // 85 unidades x R$ 1.000,00
        valor_liquidado: 50000.0,
        valor_pago: 50000.0,
        saldo_a_liquidar: 35000.0,
        saldo_a_pagar: 0.0,
        saldo_nao_executado: 35000.0
      };

      const readModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts: [mockContractA],
        arps: [mockArpA],
        itemsSaldo: [mockArpItemA1, mockArpItemA2],
        empenhos: [empenhoArpContrato],
        currentDate
      });

      // 1. ARP: Quantidade Homologada, Empenhada e Saldo Físico
      expect(readModel.arp.totalItens).toBe(2);
      expect(readModel.arp.itensCriticosCount).toBe(1); // Item 1 tem 85% de consumo (>= 85%)
      expect(readModel.arp.topItensConsumidos[0].quantidadeHomologada).toBe(100);
      expect(readModel.arp.topItensConsumidos[0].quantidadeConsumida).toBe(85);
      expect(readModel.arp.topItensConsumidos[0].saldoDisponivel).toBe(15);
      expect(readModel.arp.topItensConsumidos[0].isCritico).toBe(true);

      // 2. Financeiro: Total Financeiro oficial
      expect(readModel.financial.totalEmpenhado).toBe(85000.0);
      expect(readModel.financial.totalLiquidado).toBe(50000.0);
      expect(readModel.financial.totalPago).toBe(50000.0);
      expect(readModel.financial.saldoALiquidar).toBe(35000.0);

      // 3. Contratos: Presente na carteira
      expect(readModel.executive.totalContratos).toBe(1);
      expect(readModel.executive.contratosAtivos).toBe(1);

      // 4. Regra de Não-Mistura: O saldo físico (15 un) NUNCA é R$ 15,00 nem contamina o financeiro
      expect(readModel.arp.topItensConsumidos[0].saldoDisponivel).not.toBe(readModel.financial.saldoALiquidar);
      expect(typeof readModel.arp.topItensConsumidos[0].saldoDisponivel).toBe('number');
      expect(readModel.financial.totalEmpenhado).toBe(85000.0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. CENÁRIO INTEGRADO B: EMPENHO → LIQUIDAÇÃO → PAGAMENTO
  // --------------------------------------------------------------------------
  describe('2. CENÁRIO INTEGRADO B: EMPENHO → LIQUIDAÇÃO → PAGAMENTO', () => {
    it('deve calcular com rigor contábil: Saldo a Liquidar = max(0, E-L), Saldo a Pagar = max(0, L-P), Saldo Não Executado = max(0, E-P)', () => {
      const empenhosMultiplos = [
        {
          id: 'EMP-B1',
          numero_empenho: '2026NE000201',
          uasg: '200331',
          valor_empenhado: 10000.0,
          valor_liquidado: 6000.0,
          valor_pago: 4000.0,
          saldo_a_liquidar: 4000.0,
          saldo_a_pagar: 2000.0,
          saldo_nao_executado: 6000.0
        },
        {
          id: 'EMP-B2',
          numero_empenho: '2026NE000202',
          uasg: '200331',
          valor_empenhado: 20000.0,
          valor_liquidado: 20000.0,
          valor_pago: 20000.0,
          saldo_a_liquidar: 0.0,
          saldo_a_pagar: 0.0,
          saldo_nao_executado: 0.0
        }
      ];

      const financialSummary = calculateFinancialSummary(empenhosMultiplos);

      expect(financialSummary.totalEmpenhado).toBe(30000.0);
      expect(financialSummary.totalLiquidado).toBe(26000.0);
      expect(financialSummary.totalPago).toBe(24000.0);

      // max(0, 30000 - 26000) = 4000
      expect(financialSummary.saldoALiquidar).toBe(4000.0);
      // max(0, 26000 - 24000) = 2000
      expect(financialSummary.saldoAPagar).toBe(2000.0);
      // max(0, 30000 - 24000) = 6000
      expect(financialSummary.saldoNaoExecutado).toBe(6000.0);

      // Taxas percentuais
      expect(financialSummary.taxaLiquidacaoPercentual).toBeCloseTo(86.67, 1);
      expect(financialSummary.taxaPagamentoPercentual).toBeCloseTo(92.31, 1); // 24000 / 26000
    });
  });

  // --------------------------------------------------------------------------
  // 3. CENÁRIO INTEGRADO C: CONTRATO + PAGAMENTO OPERACIONAL (SSOT SEPARATION)
  // --------------------------------------------------------------------------
  describe('3. CENÁRIO INTEGRADO C: CONTRATO + PAGAMENTO OPERACIONAL', () => {
    it('deve garantir que PAGAMENTO_CONFIRMADO no fluxo operacional NÃO altera sozinho o totalPago financeiro oficial', () => {
      const paymentCycleConfirmado = createMockPaymentCycle({
        cycleKey: 'CYCLE-01',
        contractKey: 'CONTRATO::200331::00010::2026',
        status: 'PAGAMENTO_CONFIRMADO',
        input: {
          contractKey: 'CONTRATO::200331::00010::2026',
          competencia: '2026-08',
          dataAssinaturaAtesto: '2026-08-15',
          dataVencimentoFatura: '2026-09-15',
          documentoAtestoSei: 'Doc 9988',
          valorAtesto: 25000.0,
          dataOrdemBancaria: '2026-08-20',
          numeroOrdemBancaria: '2026OB800123'
        }
      });

      // Fato financeiro oficial: NE emitida de 50k, liquidada em 25k, mas PAGO oficial = 0.00 (snapshot do SIAFI pendente de ingestão)
      const officialEmpenho = {
        id: 'EMP-OFF-01',
        numero_empenho: '2026NE000999',
        uasg: '200331',
        numero_contrato: '00010/2026',
        valor_empenhado: 50000.0,
        valor_liquidado: 25000.0,
        valor_pago: 0.0, // Oficialmente 0
        saldo_a_liquidar: 25000.0,
        saldo_a_pagar: 25000.0,
        saldo_nao_executado: 50000.0
      };

      const readModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts: [mockContractA],
        empenhos: [officialEmpenho],
        paymentCycles: [paymentCycleConfirmado],
        currentDate
      });

      // Acompanhamento operacional: registra o ciclo como confirmado
      expect(readModel.payments.totalCiclos).toBe(1);
      expect(readModel.payments.ciclosConcluidosCount).toBe(1);
      expect(readModel.payments.distribuicaoPorEstado?.PAGAMENTO_CONFIRMADO).toBe(1);

      // Fato financeiro oficial: permanece rigorosamente 0.00 (SSOT preservation)
      expect(readModel.financial.totalPago).toBe(0.0);
      expect(readModel.financial.saldoAPagar).toBe(25000.0);
      expect(readModel.financial.saldoNaoExecutado).toBe(50000.0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. CENÁRIO INTEGRADO D: EMPENHO COM MÚLTIPLOS VÍNCULOS (SEM DUPLA CONTAGEM)
  // --------------------------------------------------------------------------
  describe('4. CENÁRIO INTEGRADO D: EMPENHO COM MÚLTIPLOS VÍNCULOS', () => {
    it('deve contabilizar cada empenho exatamente uma única vez mesmo vinculado a múltiplos domínios', () => {
      // 1 único empenho vinculado tanto ao Contrato quanto ao Item de Ata
      const empenhoMultiVinculo = {
        id: 'EMP-UNIQUE-101',
        numero_empenho: '2026NE000888',
        uasg: '200331',
        numero_contrato: '00010/2026',
        contrato_id: 'CONTRATO::200331::00010::2026',
        numero_ata: '10/2026',
        item_key: 'ITEM::200331::10/2026::1',
        valor_empenhado: 15000.0,
        valor_liquidado: 15000.0,
        valor_pago: 15000.0,
        saldo_a_liquidar: 0.0,
        saldo_a_pagar: 0.0,
        saldo_nao_executado: 0.0
      };

      const readModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts: [mockContractA],
        arps: [mockArpA],
        itemsSaldo: [mockArpItemA1],
        empenhos: [empenhoMultiVinculo],
        currentDate
      });

      // Total financeiro deve ser exatamente 15.000 (1 vez), e contagem de empenhos no topEmpenhos = 1
      expect(readModel.financial.totalEmpenhado).toBe(15000.0);
      expect(readModel.financial.totalLiquidado).toBe(15000.0);
      expect(readModel.financial.totalPago).toBe(15000.0);
      expect(readModel.financial.topEmpenhos?.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 5. CENÁRIO INTEGRADO E: MÚLTIPLOS EMPENHOS DO MESMO ITEM / CONTRATO
  // --------------------------------------------------------------------------
  describe('5. CENÁRIO INTEGRADO E: MÚLTIPLOS EMPENHOS DO MESMO ITEM', () => {
    it('deve somar atomicamente múltiplos empenhos sem falso zero ou duplicidade', () => {
      const empenhosItem = [
        {
          id: 'EMP-E1',
          numero_empenho: '2026NE000501',
          uasg: '200331',
          numero_contrato: '00010/2026',
          numero_ata: '10/2026',
          item_key: 'ITEM::200331::10/2026::1',
          valor_empenhado: 30000.0,
          valor_liquidado: 30000.0,
          valor_pago: 30000.0,
          saldo_a_liquidar: 0.0,
          saldo_a_pagar: 0.0,
          saldo_nao_executado: 0.0
        },
        {
          id: 'EMP-E2',
          numero_empenho: '2026NE000502',
          uasg: '200331',
          numero_contrato: '00010/2026',
          numero_ata: '10/2026',
          item_key: 'ITEM::200331::10/2026::1',
          valor_empenhado: 55000.0,
          valor_liquidado: 20000.0,
          valor_pago: 20000.0,
          saldo_a_liquidar: 35000.0,
          saldo_a_pagar: 0.0,
          saldo_nao_executado: 35000.0
        }
      ];

      const readModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts: [mockContractA],
        arps: [mockArpA],
        itemsSaldo: [mockArpItemA1],
        empenhos: empenhosItem,
        currentDate
      });

      expect(readModel.financial.topEmpenhos?.length).toBe(2);
      expect(readModel.financial.totalEmpenhado).toBe(85000.0);
      expect(readModel.financial.totalLiquidado).toBe(50000.0);
      expect(readModel.financial.totalPago).toBe(50000.0);
      expect(readModel.financial.saldoALiquidar).toBe(35000.0);
      expect(readModel.financial.saldoNaoExecutado).toBe(35000.0);
    });
  });

  // --------------------------------------------------------------------------
  // 6. CENÁRIO INTEGRADO F: FILTROS GLOBAIS E DRILL-DOWNS
  // --------------------------------------------------------------------------
  describe('6. CENÁRIO INTEGRADO F: FILTROS GLOBAIS E DRILL-DOWNS', () => {
    const fullDataset = {
      uasg: '200331',
      contracts: [mockContractA, mockContractB, mockContractCEncerrado],
      arps: [mockArpA],
      itemsSaldo: [mockArpItemA1, mockArpItemA2],
      empenhos: [
        {
          id: 'EMP-F1',
          numero_empenho: '2026NE000100',
          uasg: '200331',
          numero_contrato: '00010/2026',
          numero_ata: '10/2026',
          item_key: 'ITEM::200331::10/2026::1',
          valor_empenhado: 500000.0,
          valor_liquidado: 250000.0,
          valor_pago: 250000.0,
          saldo_a_liquidar: 250000.0,
          saldo_a_pagar: 0.0,
          saldo_nao_executado: 250000.0
        },
        {
          id: 'EMP-F2',
          numero_empenho: '2026NE000200',
          uasg: '200331',
          numero_contrato: '00020/2026',
          valor_empenhado: 120000.0,
          valor_liquidado: 120000.0,
          valor_pago: 100000.0,
          saldo_a_liquidar: 0.0,
          saldo_a_pagar: 20000.0,
          saldo_nao_executado: 20000.0
        }
      ],
      paymentCycles: [
        createMockPaymentCycle({
          cycleKey: 'CYCLE-F1',
          contractKey: 'CONTRATO::200331::00010::2026',
          status: 'EM_INSTRUCAO',
          input: {
            contractKey: 'CONTRATO::200331::00010::2026',
            competencia: '2026-08',
            dataAssinaturaAtesto: '2026-08-20',
            dataVencimentoFatura: '2026-09-20',
            documentoAtestoSei: 'Doc NF-1',
            valorAtesto: 25000.0
          }
        }),
        createMockPaymentCycle({
          cycleKey: 'CYCLE-F2',
          contractKey: 'CONTRATO::200331::00020::2026',
          status: 'PAGAMENTO_CONFIRMADO',
          input: {
            contractKey: 'CONTRATO::200331::00020::2026',
            competencia: '2026-08',
            dataAssinaturaAtesto: '2026-08-10',
            dataVencimentoFatura: '2026-09-10',
            documentoAtestoSei: 'Doc NF-2',
            valorAtesto: 10000.0,
            dataOrdemBancaria: '2026-08-18',
            numeroOrdemBancaria: '2026OB800222'
          }
        })
      ],
      currentDate
    };

    it('deve extrair availableFilters dinamicamente do dataset global', () => {
      const globalModel = buildManagementDashboardReadModel(fullDataset);

      expect(globalModel.availableFilters?.contracts.length).toBe(3);
      expect(globalModel.availableFilters?.atas.length).toBe(1);
    });

    it('deve isolar deterministamente os dados quando filtrado por contractKey', () => {
      const filteredModel = buildManagementDashboardReadModel({
        ...fullDataset,
        filters: { contractKey: 'CONTRATO::200331::00010::2026' }
      });

      // Executivo: Apenas 1 contrato selecionado
      expect(filteredModel.executive.totalContratos).toBe(1);
      expect(filteredModel.executive.valorVigenteTotal).toBe(500000.0);

      // Financeiro: Apenas o empenho vinculado a este contrato
      expect(filteredModel.financial.totalEmpenhado).toBe(500000.0);
      expect(filteredModel.financial.totalLiquidado).toBe(250000.0);
      expect(filteredModel.financial.totalPago).toBe(250000.0);

      // Pagamentos: Apenas o ciclo do contrato 10/2026
      expect(filteredModel.payments.totalCiclos).toBe(1);
      expect(filteredModel.payments.distribuicaoPorEstado?.EM_INSTRUCAO).toBe(1);
      expect(filteredModel.payments.distribuicaoPorEstado?.PAGAMENTO_CONFIRMADO).toBe(0);
    });

    it('deve filtrar corretamente por statusContrato: ENCERRADO', () => {
      const filteredModel = buildManagementDashboardReadModel({
        ...fullDataset,
        filters: { statusContrato: 'ENCERRADO' }
      });

      expect(filteredModel.executive.totalContratos).toBe(1);
      expect(filteredModel.executive.contratosEncerrados).toBe(1);
      expect(filteredModel.executive.contratosAtivos).toBe(0);
      expect(filteredModel.executive.valorVigenteTotal).toBe(50000.0);
    });

    it('deve filtrar corretamente por numeroAta', () => {
      const filteredModel = buildManagementDashboardReadModel({
        ...fullDataset,
        filters: { numeroAta: '10/2026' }
      });

      expect(filteredModel.arp.totalAtas).toBe(1);
      expect(filteredModel.arp.totalItens).toBe(2);
      expect(filteredModel.financial.topEmpenhos?.length).toBe(1);
      expect(filteredModel.financial.totalEmpenhado).toBe(500000.0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. CENÁRIO INTEGRADO G: CENTRAL DE ATENÇÃO E SINAIS OPERACIONAIS
  // --------------------------------------------------------------------------
  describe('7. CENÁRIO INTEGRADO G: ATENÇÃO AGORA E SINAIS OPERACIONAIS', () => {
    it('deve agregar contratos com prazos críticos, alertas de reajuste e pagamentos pendentes sem duplicações', () => {
      // Evento de reajuste para o contrato A
      const reajusteEvent: ContractEvent = {
        id: 'EVT-01',
        contractKey: 'CONTRATO::200331::00010::2026',
        uasg: '200331',
        numeroContrato: '00010',
        anoContrato: 2026,
        tipoEvento: 'REAJUSTE',
        naturezaInstrumento: 'TERMO_APOSTILAMENTO',
        identificadorOficial: 'APOST-01/2026',
        descricao: 'Reajuste anual IPCA',
        impacto: 'ALTERA_VALOR',
        variacaoValor: 50000.0,
        valorPosterior: 550000.0,
        fonteOrigem: 'PNCP',
        capturedAt: '2026-06-01T12:00:00Z'
      };

      const readModel = buildManagementDashboardReadModel({
        uasg: '200331',
        contracts: [mockContractA, mockContractB],
        eventsMap: {
          'CONTRATO::200331::00010::2026': [reajusteEvent]
        },
        arps: [mockArpA],
        itemsSaldo: [mockArpItemA1],
        paymentCycles: [
          createMockPaymentCycle({
            cycleKey: 'CYCLE-ATTN',
            contractKey: 'CONTRATO::200331::00010::2026',
            status: 'EM_INSTRUCAO',
            input: {
              contractKey: 'CONTRATO::200331::00010::2026',
              competencia: '2026-08',
              dataAssinaturaAtesto: '2026-08-01', // > 20 dias atrás
              dataVencimentoFatura: '2026-09-01',
              documentoAtestoSei: 'Doc NF-100',
              valorAtesto: 15000.0
            },
            prazos: {
              diasUteisAteVencimento: -10,
              janelaTotalDiasUteis: 20,
              diasSemRespostaCgofi: 0,
              margemEnvioDiasUteis: -10,
              isVencida: true,
              statusPrazo: 'VENCIDO'
            }
          })
        ],
        currentDate
      });

      // Contrato A tem reajuste aplicado (+50k): valorOriginal 500k, valorVigente 550k. Contrato B: valorOriginal 100k, valorVigente 100k
      expect(readModel.executive.valorOriginalTotal).toBe(600000.0); // 500k + 100k
      expect(readModel.executive.valorVigenteTotal).toBe(650000.0); // 550k + 100k
      expect(readModel.executive.deltaAcumuladoTotal).toBe(50000.0);

      // Deadlines: Contrato B vence em menos de 30 dias (2026-10-15 vs 2026-09-24 = 21 dias)
      expect(readModel.deadlines.vencendo30Dias).toBe(1);
      expect(readModel.deadlines.vencendo60Dias).toBe(0);
      expect(readModel.deadlines.vencendo90Dias).toBe(0);

      // Atenção: Alertas identificados
      expect(readModel.attention.totalAlertasAtivos).toBeGreaterThan(0);
    });
  });
});

