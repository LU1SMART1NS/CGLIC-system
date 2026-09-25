import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArpPortfolioHeader } from '../../components/atas/ArpPortfolioHeader';
import { ArpPortfolioSummary } from '../../components/atas/ArpPortfolioSummary';
import { ArpPortfolioFilters } from '../../components/atas/ArpPortfolioFilters';
import { ArpPortfolioList } from '../../components/atas/ArpPortfolioList';
import type { ArpRecord, ArpItemRecord, AtaGroupedCard } from '../../types';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/atas' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

const mockArp: ArpRecord = {
  numeroAtaRegistroPreco: '00001/2025',
  codigoUnidadeGerenciadora: '200331',
  nomeUnidadeGerenciadora: 'SENASP',
  objeto: 'Aquisição de equipamentos de proteção individual',
  dataVigenciaInicial: '2025-01-01',
  dataVigenciaFinal: '2026-12-31',
  quantidadeItens: 2,
  valorTotal: 500000,
  statusAta: 'Ata de Registro de Preços',
  codigoOrgao: 20000,
  nomeOrgao: 'Ministério da Justiça',
  numeroCompra: '00001',
  anoCompra: '2025',
  codigoModalidadeCompra: '5',
  nomeModalidadeCompra: 'Pregão Eletrônico',
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
  descricaoItem: 'Colete Balístico Nível III-A',
  quantidadeHomologadaItem: 100,
  quantidadeHomologadaVencedor: 100,
  valorUnitario: 2500,
  valorTotal: 250000,
  maximoAdesao: 100,
  nomeRazaoSocialFornecedor: 'Proteção Tática Brasil Ltda',
  niFornecedor: '12.345.678/0001-90',
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

const mockCard: AtaGroupedCard = {
  key: 'card-00001/2025-200331',
  arp: mockArp,
  fornecedorNome: 'Proteção Tática Brasil Ltda',
  fornecedorCnpj: '12.345.678/0001-90',
  itens: [mockItem],
  adesaoStatus: 'ACEITA',
  totalItens: 1
};

describe('ArpSearch & Componentes — FASE 9-G: Consulta e Vigência de Atas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar o cabeçalho padronizado "Consulta e Vigência"', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioHeader
        syncInfo={{ isCachedInDb: true, status: 'IDLE' }}
        onTriggerSync={vi.fn()}
      />
    );

    expect(html).toContain('Consulta e Vigência');
    expect(html).toContain('Acompanhe atas de registro de preços, vigências, fornecedores e saldos físicos.');
    expect(html).toContain('Atualizar');
    expect(html).not.toContain('totalUGRegisteredValue');
  });

  it('2. deve renderizar os 4 cards de resumo de vigência com contadores corretos', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioSummary
        totalAtas={10}
        vigentes={8}
        aVencer90d={2}
        expiradas={2}
        activeStatus="TODAS"
        onSelectStatus={vi.fn()}
      />
    );

    expect(html).toContain('Total de Atas');
    expect(html).toContain('10');
    expect(html).toContain('Atas Vigentes');
    expect(html).toContain('8');
    expect(html).toContain('Próximas do Vencimento');
    expect(html).toContain('2');
    expect(html).toContain('Expiradas / Canceladas');
  });

  it('3. deve renderizar a barra de filtros em linha com busca textual e opções', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioFilters
        filters={{ statusVigencia: 'TODAS', filtroAlocacao: 'TODAS', filtroEmpenho: 'TODAS', busca: '' }}
        onChangeFilter={vi.fn()}
        onResetFilters={vi.fn()}
        totalFiltered={5}
        totalAtas={5}
      />
    );

    expect(html).toContain('Todas as Vigências');
    expect(html).toContain('Alocação (Todas)');
    expect(html).toContain('Empenho (Todos)');
    expect(html).toContain('Buscar por Ata, fornecedor, CNPJ, item...');
    expect(html).toContain('5 Atas');
  });

  it('4. deve renderizar a lista de cards de Atas com itens e fornecedor', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioList
        cards={[mockCard]}
        totalAtas={1}
        onSelectArp={vi.fn()}
        onSelectItem={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('ATA 00001/2025');
    expect(html).toContain('Proteção Tática Brasil Ltda');
    expect(html).toContain('Colete Balístico Nível III-A');
  });

  it('5. deve exibir estado vazio quando não há atas cadastradas', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioList
        cards={[]}
        totalAtas={0}
        onSelectArp={vi.fn()}
        onSelectItem={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhuma Ata de Registro de Preços encontrada.');
  });

  it('6. deve exibir estado de filtro sem resultados com botão Limpar Filtros', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioList
        cards={[]}
        totalAtas={5}
        onSelectArp={vi.fn()}
        onSelectItem={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhuma Ata corresponde aos filtros aplicados.');
    expect(html).toContain('Limpar Filtros');
  });
});
