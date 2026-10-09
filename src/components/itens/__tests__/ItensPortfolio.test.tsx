import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItensPortfolioTable } from '../ItensPortfolioTable';
import { ItensPortfolioFilters } from '../ItensPortfolioFilters';
import type { CarteiraItemRow } from '../../../utils/carteiraItens';

// A ordenação fica na URL (?ordem=); cada teste escolhe a ordem pelo `searchParams`.
let searchParams = new URLSearchParams();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [searchParams, vi.fn()]
}));
import type { ArpItemRecord, ArpRecord } from '../../../types';

const row = (over: Partial<CarteiraItemRow> = {}): CarteiraItemRow => ({
  key: '00001/2025-200331-00001',
  ataKey: '00001/2025-200331',
  arp: { numeroAtaRegistroPreco: '00001/2025', codigoUnidadeGerenciadora: '200331', dataVigenciaFinal: '2026-12-31' } as ArpRecord,
  item: {
    numeroItem: '00001',
    descricaoItem: 'Colete Balístico Nível III-A',
    nomeRazaoSocialFornecedor: 'Proteção Tática Brasil Ltda',
    valorUnitario: 2500
  } as ArpItemRecord,
  gestorNome: 'Marina Costa',
  diasRestantes: 120,
  faixa: 'REGULAR',
  quantitativoSenasp: 100,
  consumoPct: 45,
  alocado: 60,
  alocadoPorUnidade: { cglic: 60 },
  nivelAlocacao: 'PARCIAL',
  contratada: 50,
  contratadoSemUnidade: 0,
  empenhado: 50,
  nivelEmpenho: 'TOTAL',
  ...over
});

const noop = vi.fn();

describe('ItensPortfolioTable', () => {
  it('mostra item, ata, alocação e empenho com os números de cada um', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioTable rows={[row()]} totalItens={1} unidade="TODAS" onSelectItem={noop} onResetFilters={noop} />
    );
    expect(html).toContain('Colete Balístico Nível III-A');
    expect(html).toContain('00001/2025');
    expect(html).toContain('Parcialmente alocado');
    expect(html).toContain('60 de 100');
    expect(html).toContain('Totalmente empenhado');
    expect(html).toContain('50 de 50');
    expect(html).toContain('Marina Costa');
    expect(html).toContain('Ver saldo');
    expect(html).not.toContain('alocado</div>');
    expect(html).not.toContain('pendente');
  });

  it('mostra só o número do item, a descrição em frase normal e não repete o fornecedor', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioTable
        rows={[row({ item: { ...row().item, descricaoItem: 'TABLET, TELA SUPERIOR A 10 POL, MEMÓRIA RAM MÍNIMO 8 GB', nomeRazaoSocialFornecedor: 'VANGUARDA INFORMATICA LTDA' } as ArpItemRecord })]}
        totalItens={1}
        unidade="TODAS"
        onSelectItem={noop}
        onResetFilters={noop}
      />
    );
    // Sem o prefixo "Item": o número do item já é o identificador da coluna.
    expect(html).not.toContain('>Item 00001<');
    expect(html).toContain('>00001<');
    // Descrição que vem toda em maiúsculas é exibida em frase normal (o title guarda o original).
    expect(html).toContain('Tablet, tela superior a 10 pol');
    expect(html).toContain('title="TABLET, TELA SUPERIOR A 10 POL, MEMÓRIA RAM MÍNIMO 8 GB"');
    // O fornecedor é o mesmo para todos os itens da ata: não se repete na linha (a busca ainda o encontra).
    expect(html).not.toContain('VANGUARDA INFORMATICA LTDA');
  });

  it('avisa quando o item não tem quantidade contratada', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioTable
        rows={[row({ contratada: null, empenhado: 0, nivelEmpenho: 'SEM' })]}
        totalItens={1}
        unidade="TODAS"
        onSelectItem={noop}
        onResetFilters={noop}
      />
    );
    expect(html).toContain('Sem empenho');
    expect(html).toContain('sem qtd. contratada');
  });

  it('com uma unidade filtrada, a Execução mostra o alocado à unidade', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioTable rows={[row()]} totalItens={1} unidade="cglic" unidadeNome="CGLIC" onSelectItem={noop} onResetFilters={noop} />
    );
    expect(html).toContain('CGLIC: <strong>60</strong> alocado');
  });

  it('distingue "sem itens" de "nenhum item passou pelos filtros"', () => {
    const semItens = renderToStaticMarkup(
      <ItensPortfolioTable rows={[]} totalItens={0} unidade="TODAS" onSelectItem={noop} onResetFilters={noop} />
    );
    expect(semItens).toContain('Nenhum item encontrado.');
    const filtrado = renderToStaticMarkup(
      <ItensPortfolioTable rows={[]} totalItens={5} unidade="TODAS" onSelectItem={noop} onResetFilters={noop} />
    );
    expect(filtrado).toContain('Nenhum item corresponde aos filtros aplicados.');
  });
});

describe('ordenação pelo cabeçalho', () => {
  const a = row({ key: 'A', consumoPct: 10, item: { ...row().item, numeroItem: '00001', descricaoItem: 'Item A' } });
  const b = row({ key: 'B', consumoPct: 90, item: { ...row().item, numeroItem: '00002', descricaoItem: 'Item B' } });
  const c = row({ key: 'C', consumoPct: null, item: { ...row().item, numeroItem: '00003', descricaoItem: 'Item C' } });

  it('sem ?ordem= mantém a ordem recebida', () => {
    searchParams = new URLSearchParams();
    const html = renderToStaticMarkup(<ItensPortfolioTable rows={[a, b, c]} totalItens={3} unidade="TODAS" onSelectItem={noop} onResetFilters={noop} />);
    expect(html.indexOf('Item A')).toBeLessThan(html.indexOf('Item B'));
  });

  it('?ordem=consumo:desc põe o maior consumo primeiro e o vazio por último', () => {
    searchParams = new URLSearchParams('ordem=consumo:desc');
    const html = renderToStaticMarkup(<ItensPortfolioTable rows={[a, c, b]} totalItens={3} unidade="TODAS" onSelectItem={noop} onResetFilters={noop} />);
    expect(html.indexOf('Item B')).toBeLessThan(html.indexOf('Item A'));
    expect(html.indexOf('Item A')).toBeLessThan(html.indexOf('Item C'));
    expect(html).toContain('aria-sort="descending"');
    searchParams = new URLSearchParams();
  });

  it('com onFilter, os selos de alocação e empenho viram filtro', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioTable rows={[a]} totalItens={1} unidade="TODAS" onSelectItem={noop} onResetFilters={noop} onFilter={noop} />
    );
    expect(html).toContain('Filtrar por parcialmente alocado');
    expect(html).toContain('Filtrar por totalmente empenhado');
    expect(html).toContain('Filtrar por gestor Marina Costa');
  });

  it('o perfil gestor não filtra pelo nome do gestor', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioTable rows={[a]} totalItens={1} unidade="TODAS" onSelectItem={noop} onResetFilters={noop} onFilter={noop} canFilterGestor={false} />
    );
    expect(html).not.toContain('Filtrar por gestor');
  });
});

describe('ItensPortfolioFilters', () => {
  it('oferece alocação, empenho, unidade e gestor (a vigência fica nos segmentos)', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioFilters
        filters={{ statusVigencia: 'VIGENTES', filtroAlocacao: 'TODOS', filtroEmpenho: 'TODOS', unidade: 'TODAS', gestor: 'TODOS', busca: '' }}
        unidades={[{ chave: 'cglic', nome: 'CGLIC' }]}
        gestores={['Marina Costa']}
        onChangeFilter={noop}
        onResetFilters={noop}
        totalFiltered={3}
        totalItens={3}
      />
    );
    expect(html).toContain('Buscar por item, descrição, ata, fornecedor...');
    expect(html).toContain('itens-filter-alocacao');
    expect(html).toContain('itens-filter-empenho');
    expect(html).toContain('itens-filter-unidade');
    expect(html).toContain('itens-filter-gestor');
    expect(html).toContain('3 itens');
  });

  it('esconde o seletor de gestor para o perfil gestor', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioFilters
        filters={{ statusVigencia: 'VIGENTES', filtroAlocacao: 'TODOS', filtroEmpenho: 'TODOS', unidade: 'TODAS', gestor: 'TODOS', busca: '' }}
        showGestorFilter={false}
        onChangeFilter={noop}
        onResetFilters={noop}
        totalFiltered={1}
        totalItens={1}
      />
    );
    expect(html).not.toContain('itens-filter-gestor');
  });
});

describe('filtro em botão', () => {
  it('mostra o valor escolhido no botão, com opção de remover', () => {
    const html = renderToStaticMarkup(
      <ItensPortfolioFilters
        filters={{ statusVigencia: 'VIGENTES', filtroAlocacao: 'SEM', filtroEmpenho: 'TODOS', unidade: 'cglic', gestor: 'TODOS', busca: '' }}
        unidades={[{ chave: 'cglic', nome: 'CGLIC' }]}
        onChangeFilter={noop}
        onResetFilters={noop}
        totalFiltered={2}
        totalItens={9}
      />
    );
    expect(html).toContain('Sem alocação');
    expect(html).toContain('CGLIC');
    expect(html).toContain('Remover filtro Alocação');
    expect(html).toContain('Remover filtro Unidade');
    expect(html).toContain('Exibindo 2 de 9 itens');
  });
});
