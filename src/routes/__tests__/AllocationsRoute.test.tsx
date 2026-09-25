import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AllocationsPortfolioHeader } from '../../components/atas/allocations/AllocationsPortfolioHeader';
import { AllocationsPortfolioSummary } from '../../components/atas/allocations/AllocationsPortfolioSummary';
import { AllocationsPortfolioFilters } from '../../components/atas/allocations/AllocationsPortfolioFilters';
import { AllocationsPortfolioContent, type EnrichedAllocationRow } from '../../components/atas/allocations/AllocationsPortfolioContent';
import type { ArpRecord, ArpItemRecord } from '../../types';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/atas/saldos-unidade' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

const mockArp: ArpRecord = {
  numeroAtaRegistroPreco: '00001/2025',
  codigoUnidadeGerenciadora: '200331',
  nomeUnidadeGerenciadora: 'SENASP',
  objeto: 'Aquisição de viaturas operacionais',
  dataVigenciaInicial: '2025-01-01',
  dataVigenciaFinal: '2026-12-31',
  quantidadeItens: 1,
  valorTotal: 1000000,
  statusAta: 'Ata de Registro de Preços',
  codigoOrgao: 20000,
  nomeOrgao: 'Ministério da Justiça',
  numeroCompra: '00001',
  anoCompra: '2025',
  codigoModalidadeCompra: '5',
  nomeModalidadeCompra: 'Pregão',
  dataAssinatura: '2025-01-01',
  dataHoraAtualizacao: '2025-01-01',
  dataHoraInclusao: '2025-01-01',
  dataHoraExclusao: null,
  ataExcluido: false,
  numeroControlePncpAta: '123',
  numeroControlePncpCompra: '123',
  idCompra: '123'
};

const mockItem: ArpItemRecord = {
  numeroItem: '1',
  codigoItem: 1001,
  descricaoItem: 'Viatura Policial Tipo SUV 4x4',
  quantidadeHomologadaItem: 50,
  quantidadeHomologadaVencedor: 50,
  valorUnitario: 200000,
  valorTotal: 10000000,
  maximoAdesao: 50,
  nomeRazaoSocialFornecedor: 'Montadora Nacional S/A',
  niFornecedor: '99.888.777/0001-66',
  numeroAtaRegistroPreco: '00001/2025',
  codigoUnidadeGerenciadora: '200331',
  numeroCompra: '00001',
  anoCompra: '2025',
  codigoModalidadeCompra: '5',
  nomeModalidadeCompra: 'Pregão',
  dataAssinatura: '2025-01-01',
  dataVigenciaInicial: '2025-01-01',
  dataVigenciaFinal: '2026-12-31',
  tipoItem: 'Material',
  classificacaoFornecedor: '1',
  nomeUnidadeGerenciadora: 'SENASP',
  idCompra: '123',
  numeroControlePncpCompra: '123',
  numeroControlePncpAta: '123',
  codigoPdm: 1,
  nomePdm: 'PDM',
  dataHoraInclusao: '2025-01-01',
  dataHoraAtualizacao: '2025-01-01',
  dataHoraExclusao: null,
  itemExcluido: false
};

const mockRows: EnrichedAllocationRow[] = [
  {
    id: 'ALLOC-1',
    itemKey: '00001/2025-200331-1',
    unitName: 'DINFRA / Coordenação de Transportes',
    allocatedQty: 20,
    empenhadaQty: 12,
    saldoQty: 8,
    unitPrice: 200000,
    allocatedValue: 4000000,
    empenhadaValue: 2400000,
    saldoValue: 1600000,
    numeroAta: '00001/2025',
    numeroItem: '1',
    descricaoItem: 'Viatura Policial Tipo SUV 4x4',
    fornecedorNome: 'Montadora Nacional S/A',
    dataVigenciaFinal: '2026-12-31',
    isExpired: false,
    isExpiringSoon: false,
    arp: mockArp,
    item: mockItem
  }
];

describe('AllocationsPortfolio & Componentes — FASE 9-G: Alocações por Unidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar o cabeçalho "Alocações por Unidade" com botões de ação', () => {
    const html = renderToStaticMarkup(
      <AllocationsPortfolioHeader
        onOpenManageDepartments={vi.fn()}
        onOpenExportExcel={vi.fn()}
      />
    );

    expect(html).toContain('Alocações por Unidade');
    expect(html).toContain('Distribuição interna de cotas e acompanhamento de saldos');
    expect(html).toContain('Unidades Internas');
    expect(html).toContain('Exportar Relatório');
  });

  it('2. deve renderizar os 4 cards de resumo com cotas, empenhos e saldo disponível', () => {
    const html = renderToStaticMarkup(
      <AllocationsPortfolioSummary
        totalAllocatedQty={100}
        totalAllocatedValue={20000000}
        totalEmpenhadaQty={60}
        totalEmpenhadaValue={12000000}
        saldoQty={40}
        saldoValue={8000000}
        totalUnits={3}
      />
    );

    expect(html).toContain('Total Alocado em Cotas');
    expect(html).toContain('100 un');
    expect(html).toContain('Empenhado por Unidades');
    expect(html).toContain('60 un');
    expect(html).toContain('Saldo Disponível de Cota');
    expect(html).toContain('40 un');
    expect(html).toContain('Unidades com Cota');
    expect(html).toContain('3');
  });

  it('3. deve renderizar a barra de filtros por unidade, vigência e busca', () => {
    const html = renderToStaticMarkup(
      <AllocationsPortfolioFilters
        filters={{ unit: 'TODAS', vigencia: 'TODAS', search: '' }}
        availableUnits={['DINFRA', 'DTI', 'CGPO']}
        onChangeFilter={vi.fn()}
        onResetFilters={vi.fn()}
        totalFiltered={1}
        totalItems={1}
      />
    );

    expect(html).toContain('Todas as Unidades');
    expect(html).toContain('DINFRA');
    expect(html).toContain('DTI');
    expect(html).toContain('CGPO');
    expect(html).toContain('Todas as Vigências');
    expect(html).toContain('Buscar por Ata, item, descrição, fornecedor...');
    expect(html).toContain('1 alocação');
  });

  it('4. deve renderizar a tabela agrupada por Unidade com cota, empenho e saldo', () => {
    const html = renderToStaticMarkup(
      <AllocationsPortfolioContent
        items={mockRows}
        totalAllocationsCount={1}
        onSelectItem={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('DINFRA / Coordenação de Transportes');
    expect(html).toContain('ATA 00001/2025');
    expect(html).toContain('Item 1');
    expect(html).toContain('Viatura Policial Tipo SUV 4x4');
    expect(html).toContain('20 un');
    expect(html).toContain('12 un');
    expect(html).toContain('8 un');
    expect(html).toContain('Ver Saldo');
  });

  it('5. deve exibir estado vazio quando não há alocações cadastradas', () => {
    const html = renderToStaticMarkup(
      <AllocationsPortfolioContent
        items={[]}
        totalAllocationsCount={0}
        onSelectItem={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhuma cota distribuída encontrada.');
  });

  it('6. deve exibir estado de filtro sem resultados com botão Limpar Filtros', () => {
    const html = renderToStaticMarkup(
      <AllocationsPortfolioContent
        items={[]}
        totalAllocationsCount={3}
        onSelectItem={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhuma alocação corresponde aos filtros aplicados.');
    expect(html).toContain('Limpar Filtros');
  });
});
