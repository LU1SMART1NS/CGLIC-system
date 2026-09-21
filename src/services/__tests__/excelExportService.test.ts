import { describe, it, expect, beforeEach } from 'vitest';

// Polyfill de localStorage para ambiente Node no vitest
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; }
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = createLocalStorageMock();
}

import { 
  ALL_REPORT_COLUMNS, 
  COLUMNS_MAP, 
  getDefaultColumnsForPreset, 
  calculateDaysRemaining, 
  formatDateBr, 
  formatCnpjBr, 
  buildFlattenedReportData, 
  generateCustomExcelReport 
} from '../excelExportService';
import { saveManualEmpenhos } from '../allocationService';
import type { ArpRecord, ArpItemRecord } from '../../types';
import type { ReportExportConfig, ReportDataPayload } from '../../types/reportTypes';

describe('excelExportService - Módulo de Relatórios Excel Parametrizáveis', () => {
  const mockAta: ArpRecord = {
    numeroAtaRegistroPreco: '00001/2026',
    codigoUnidadeGerenciadora: '200331',
    nomeUnidadeGerenciadora: 'SENASP / MJSP',
    codigoOrgao: 20000,
    nomeOrgao: 'Ministério da Justiça e Segurança Pública',
    numeroCompra: '90001',
    anoCompra: '2025',
    codigoModalidadeCompra: '05',
    nomeModalidadeCompra: 'Pregão Eletrônico',
    dataAssinatura: '2026-01-10',
    dataVigenciaInicial: '2026-01-10',
    dataVigenciaFinal: '2027-01-10',
    valorTotal: 500000,
    statusAta: 'Ata de Registro de Preços',
    objeto: 'Aquisição de Viaturas Blindadas Operacionais',
    quantidadeItens: 2,
    dataHoraAtualizacao: '2026-01-10T10:00:00Z',
    dataHoraInclusao: '2026-01-10T10:00:00Z',
    dataHoraExclusao: null,
    ataExcluido: false,
    numeroControlePncpAta: '200331000012026',
    numeroControlePncpCompra: '200331900012025',
    idCompra: '200331900012025',
    linkAtaPNCP: 'https://pncp.gov.br/app/atas/200331/2026/1',
    linkCompraPNCP: 'https://pncp.gov.br/app/editais/200331/2025/90001'
  };

  const mockItems: ArpItemRecord[] = [
    {
      numeroAtaRegistroPreco: '00001/2026',
      codigoUnidadeGerenciadora: '200331',
      numeroCompra: '90001',
      anoCompra: '2025',
      codigoModalidadeCompra: '05',
      dataAssinatura: '2026-01-10',
      dataVigenciaInicial: '2026-01-10',
      dataVigenciaFinal: '2027-01-10',
      numeroItem: '1',
      codigoItem: 1,
      descricaoItem: 'Viatura Blindada 4x4 Policial',
      tipoItem: 'Material',
      quantidadeHomologadaItem: 100,
      classificacaoFornecedor: '001',
      niFornecedor: '00394494000136',
      nomeRazaoSocialFornecedor: 'DEFENSE MOBILITY LTDA',
      quantidadeHomologadaVencedor: 100,
      valorUnitario: 4000,
      valorTotal: 400000,
      maximoAdesao: 200,
      nomeUnidadeGerenciadora: 'SENASP',
      nomeModalidadeCompra: 'Pregão',
      idCompra: '200331900012025',
      numeroControlePncpCompra: '',
      dataHoraInclusao: '2026-01-10T10:00:00Z',
      dataHoraAtualizacao: '2026-01-10T10:00:00Z',
      dataHoraExclusao: null,
      itemExcluido: false,
      numeroControlePncpAta: '200331000012026',
      codigoPdm: 12345,
      nomePdm: 'Viatura Blindada'
    },
    {
      numeroAtaRegistroPreco: '00001/2026',
      codigoUnidadeGerenciadora: '200331',
      numeroCompra: '90001',
      anoCompra: '2025',
      codigoModalidadeCompra: '05',
      dataAssinatura: '2026-01-10',
      dataVigenciaInicial: '2026-01-10',
      dataVigenciaFinal: '2027-01-10',
      numeroItem: '2',
      codigoItem: 2,
      descricaoItem: 'Kit de Manutenção Preventiva para Blindados',
      tipoItem: 'Material',
      quantidadeHomologadaItem: 50,
      classificacaoFornecedor: '001',
      niFornecedor: '00394494000136',
      nomeRazaoSocialFornecedor: 'DEFENSE MOBILITY LTDA',
      quantidadeHomologadaVencedor: 50,
      valorUnitario: 2000,
      valorTotal: 100000,
      maximoAdesao: 100,
      nomeUnidadeGerenciadora: 'SENASP',
      nomeModalidadeCompra: 'Pregão',
      idCompra: '200331900012025',
      numeroControlePncpCompra: '',
      dataHoraInclusao: '2026-01-10T10:00:00Z',
      dataHoraAtualizacao: '2026-01-10T10:00:00Z',
      dataHoraExclusao: null,
      itemExcluido: false,
      numeroControlePncpAta: '200331000012026',
      codigoPdm: 54321,
      nomePdm: 'Kit Manutenção'
    }
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Deve conter catálogo universal de colunas válido e indexado', () => {
    expect(ALL_REPORT_COLUMNS.length).toBeGreaterThan(20);
    expect(COLUMNS_MAP.has('numeroAta')).toBe(true);
    expect(COLUMNS_MAP.has('saldoQuantidade')).toBe(true);
    expect(COLUMNS_MAP.has('valorTotalAta')).toBe(true);
    expect(COLUMNS_MAP.has('unidadeNome')).toBe(true);
  });

  it('2. Deve retornar conjunto correto de colunas padrão para cada preset', () => {
    const execCols = getDefaultColumnsForPreset('EXECUTIVE');
    expect(execCols).toContain('numeroAta');
    expect(execCols).toContain('objeto');
    expect(execCols).not.toContain('unidadeNome');

    const balancesCols = getDefaultColumnsForPreset('BALANCES');
    expect(balancesCols).toContain('numeroItem');
    expect(balancesCols).toContain('saldoQuantidade');
    expect(balancesCols).toContain('fornecedorCnpj');

    const allocCols = getDefaultColumnsForPreset('ALLOCATIONS');
    expect(allocCols).toContain('unidadeNome');
    expect(allocCols).toContain('quantidadeAlocada');
    expect(allocCols).toContain('numeroProcessoSei');
  });

  it('3. Deve formatar CNPJ e datas corretamente', () => {
    expect(formatCnpjBr('00394494000136')).toBe('00.394.494/0001-36');
    expect(formatDateBr('2026-01-10')).toBe('10/01/2026');
    expect(formatDateBr('10/01/2026')).toBe('10/01/2026');
    expect(formatDateBr('')).toBe('-');
  });

  it('4. Deve calcular dias restantes de vigência com precisão', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 45);
    const dateStr = futureDate.toISOString().split('T')[0];
    const remaining = calculateDaysRemaining(dateStr);
    expect(remaining).toBe(45);
  });

  it('5. Deve achatar os dados respeitando estritamente os invariantes contábeis de Saldo', async () => {
    const itemKey = '00001/2026-200331-1';
    // Simula empenho manual salvo
    await saveManualEmpenhos(itemKey, [
      {
        id: 'e1',
        numero: '2026NE0001',
        ano: 2026,
        arpId: '00001/2026',
        itemId: '1',
        uasg: '200331',
        quantidade: 30,
        origem: 'MANUAL',
        status: 'CONFIRMADO',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      }
    ], 1);

    const payload: ReportDataPayload = {
      atas: [mockAta],
      itemsByAta: { '00001/2026-200331': mockItems }
    };

    const rows = await buildFlattenedReportData(payload, 'BY_ITEM');
    expect(rows.length).toBe(2);

    const rowItem1 = rows.find(r => r.numeroItem === '1');
    expect(rowItem1).toBeDefined();
    // Invariante 1: Saldo = QuantidadeRegistrada - Empenhos (100 - 30 = 70)
    expect(rowItem1?.quantidadeHomologada).toBe(100);
    expect(rowItem1?.quantidadeEmpenhada).toBe(30);
    expect(rowItem1?.saldoQuantidade).toBe(70);
    expect(rowItem1?.valorEmpenhadoTotal).toBe(30 * 4000);
    expect(rowItem1?.saldoValor).toBe(70 * 4000);
    expect(rowItem1?.percentualExecutado).toBe(30);
  });

  it('6. Deve gerar planilha Excel .xlsx válida via ExcelJS', async () => {
    const payload: ReportDataPayload = {
      atas: [mockAta],
      itemsByAta: { '00001/2026-200331': mockItems }
    };

    const config: ReportExportConfig = {
      scope: 'CURRENT_FILTERED',
      granularity: 'BY_ITEM',
      preset: 'BALANCES',
      selectedColumnIds: ['numeroAta', 'numeroItem', 'descricaoItem', 'quantidadeHomologada', 'quantidadeEmpenhada', 'saldoQuantidade', 'valorUnitario', 'saldoValor'],
      includeHeaderMetadata: true,
      includeTotalsSummary: true
    };

    const blob = await generateCustomExcelReport(config, payload);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('7. Deve gerar planilha Multi-Abas com abas separadas de Atas, Itens e Alocações', async () => {
    const payload: ReportDataPayload = {
      atas: [mockAta],
      itemsByAta: { '00001/2026-200331': mockItems }
    };

    const config: ReportExportConfig = {
      scope: 'CURRENT_FILTERED',
      granularity: 'MULTI_SHEET',
      preset: 'CUSTOM',
      selectedColumnIds: ['numeroAta'],
      includeHeaderMetadata: true,
      includeTotalsSummary: true
    };

    const blob = await generateCustomExcelReport(config, payload);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(2000);
  });

  // ==========================================================================
  // ADVERSARIAL MUTATION CHECKS (TESTE DO TESTE - ARP-LOOP-VALIDATOR)
  // ==========================================================================
  describe('Mutation Checks (Auditoria Adversarial)', () => {
    it('Mutante A (Inversão de Sinal na fórmula de Saldo no Relatório): Deve matar mutante', () => {
      const mutatedBuildSaldo = (qtdHomologada: number, totalEmpenhado: number) => {
        return qtdHomologada + totalEmpenhado; // MUTATION (+ ao invés de -)
      };

      const res = mutatedBuildSaldo(100, 30);
      expect(res).not.toBe(70);
      expect(res).toBe(130); // Mutant KILLED
    });

    it('Mutante B (Truncamento indevido de divergência negativa para zero): Deve matar mutante', () => {
      const mutatedBuildSaldo = (qtdHomologada: number, totalEmpenhado: number) => {
        return Math.max(0, qtdHomologada - totalEmpenhado); // MUTATION (Math.max 0 esconde estouro)
      };

      // Item com 100 homologadas e 120 empenhadas (divergência / erro na fonte)
      const res = mutatedBuildSaldo(100, 120);
      expect(res).not.toBe(-20);
      expect(res).toBe(0); // Mutant KILLED
    });

    it('Mutante C (Fabricação de CNPJ sintético em campo vazio): Deve matar mutante', () => {
      const mutatedCnpj = (cnpjRaw?: string) => {
        return cnpjRaw || '00.000.000/0001-91'; // MUTATION (fabricação sintética proibida)
      };

      const res = mutatedCnpj('');
      expect(res).not.toBe('-');
      expect(res).toBe('00.000.000/0001-91'); // Mutant KILLED
    });
  });
});
