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

// A coluna Gestor (ManagerCell) usa hooks de gestores/usuários/perfis, que
// depende destes hooks de dados — mockados para o teste 4 continuar sendo um
// render puro de componente, sem QueryClientProvider.
vi.mock('../../hooks/useAtaManagers', () => ({
  useAtaManager: () => ({ data: null, isLoading: false }),
  useAllAtaManagers: () => ({ data: {}, isLoading: false }),
  useArpItemContractLinks: () => ({ data: [], isLoading: false }),
  useSaveAtaManager: () => ({ mutate: vi.fn(), isPending: false, isError: false, reset: vi.fn() })
}));
vi.mock('../../hooks/useUsers', () => ({
  useUsers: () => ({ data: [] })
}));
vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({ data: [] })
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

describe('ArpSearch & Componentes — FASE 9-G: Carteira de Atas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar o cabeçalho padronizado "Carteira de Atas"', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioHeader
        syncInfo={{ isCachedInDb: true, status: 'IDLE' }}
        onTriggerSync={vi.fn()}
      />
    );

    expect(html).toContain('Carteira de Atas');
    expect(html).toContain('Todas as atas de registro de preços, com vigência, consumo de saldo e gestor.');
    expect(html).toContain('Atualizar');
    expect(html).not.toContain('totalUGRegisteredValue');
  });

  it('2. deve renderizar os 4 cards de resumo de vigência com contadores corretos', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioSummary
        totalAtas={10}
        vigentes={8}
        criticos={1}
        atencao={2}
        historico={2}
        activeStatus="VIGENTES"
        onSelectStatus={vi.fn()}
      />
    );

    expect(html).toContain('de 10 atas');
    expect(html).toContain('Vigentes');
    expect(html).toContain('>8<');
    expect(html).toContain('Crítico (≤30 dias)');
    expect(html).toContain('Atenção (31–90 dias)');
    expect(html).toContain('Histórico');
    expect(html).toContain('Expiradas / canceladas');
  });

  it('3. deve renderizar a barra de filtros em linha com busca textual e opções', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioFilters
        filters={{ statusVigencia: 'TODOS', filtroAlocacao: 'TODAS', filtroEmpenho: 'TODAS', busca: '' }}
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

  it('4. deve renderizar a tabela de Atas com fornecedor, itens e ação de detalhes', () => {
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
    expect(html).toContain('1 item');
    expect(html).toContain('Ver Detalhes');
    // Itens ficam recolhidos por padrão: só aparecem ao expandir a linha.
    expect(html).not.toContain('Colete Balístico Nível III-A');
  });

  it('4b. deve abrir a linha já mostrando o item quando a busca casa apenas por item', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioList
        cards={[mockCard]}
        totalAtas={1}
        busca="colete"
        onSelectArp={vi.fn()}
        onSelectItem={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

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
