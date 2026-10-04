import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readCarteiraFilters, writeCarteiraFilters, hasActiveCarteiraFilters } from '../carteiraFilters';
import { canFilterByGestor, listGestores, matchesGestorFilter, SEM_GESTOR } from '../carteiraGestor';
import { gestorFilterOptions } from '../CarteiraFilterBar';
import { ARP_FILTER_SCHEMA, ArpPortfolioFilters, DEFAULT_ARP_FILTERS } from '../../atas/ArpPortfolioFilters';
import { CONTRACTS_FILTER_SCHEMA, ContractsPortfolioFilters, DEFAULT_CONTRACTS_FILTERS } from '../../contracts/portfolio/ContractsPortfolioFilters';

describe('filtros das carteiras na URL', () => {
  it('sem parâmetros, lê os padrões', () => {
    expect(readCarteiraFilters(new URLSearchParams(), CONTRACTS_FILTER_SCHEMA)).toEqual(DEFAULT_CONTRACTS_FILTERS);
    expect(readCarteiraFilters(new URLSearchParams(), ARP_FILTER_SCHEMA)).toEqual(DEFAULT_ARP_FILTERS);
  });

  it('lê os parâmetros e descarta valores desconhecidos', () => {
    const params = new URLSearchParams('situacao=CRITICO&gestor=Maria%20Souza&empenho=TALVEZ&busca=papel');
    expect(readCarteiraFilters(params, ARP_FILTER_SCHEMA)).toEqual({
      ...DEFAULT_ARP_FILTERS,
      statusVigencia: 'CRITICO',
      gestor: 'Maria Souza',
      busca: 'papel'
    });
  });

  it('escreve só o que difere do padrão e preserva outros parâmetros', () => {
    const next = writeCarteiraFilters(new URLSearchParams('aba=itens&situacao=CRITICO'), CONTRACTS_FILTER_SCHEMA, {
      ...DEFAULT_CONTRACTS_FILTERS,
      gestor: SEM_GESTOR
    });
    expect(next.get('aba')).toBe('itens');
    expect(next.has('situacao')).toBe(false);
    expect(next.get('gestor')).toBe(SEM_GESTOR);
  });

  it('busca só com espaços não conta como filtro ativo', () => {
    expect(hasActiveCarteiraFilters(CONTRACTS_FILTER_SCHEMA, { ...DEFAULT_CONTRACTS_FILTERS, busca: '  ' })).toBe(false);
    expect(hasActiveCarteiraFilters(CONTRACTS_FILTER_SCHEMA, { ...DEFAULT_CONTRACTS_FILTERS, gestor: 'Ana' })).toBe(true);
  });
});

describe('filtro de gestor', () => {
  it('casa todos, sem gestor e gestor específico', () => {
    expect(matchesGestorFilter(undefined, 'TODOS')).toBe(true);
    expect(matchesGestorFilter(undefined, SEM_GESTOR)).toBe(true);
    expect(matchesGestorFilter('Ana', SEM_GESTOR)).toBe(false);
    expect(matchesGestorFilter('Ana', 'Ana')).toBe(true);
    expect(matchesGestorFilter('Bruno', 'Ana')).toBe(false);
  });

  it('lista nomes distintos em ordem alfabética', () => {
    expect(listGestores(['Úrsula', undefined, 'Ana', 'Ana', 'Bruno'])).toEqual(['Ana', 'Bruno', 'Úrsula']);
  });

  it('só o perfil gestor fica sem o filtro', () => {
    expect(canFilterByGestor('gestor')).toBe(false);
    expect(canFilterByGestor('admin')).toBe(true);
    expect(canFilterByGestor('leitor')).toBe(true);
  });

  it('a carteira de atas mostra o seletor de gestor com "Sem gestor"', () => {
    const html = renderToStaticMarkup(
      <ArpPortfolioFilters
        filters={DEFAULT_ARP_FILTERS}
        gestores={['Maria Souza']}
        onChangeFilter={vi.fn()}
        onResetFilters={vi.fn()}
        totalFiltered={2}
        totalAtas={2}
      />
    );
    expect(html).toContain('arp-filter-gestor');
    expect(html).toContain('Gestor');
    expect(gestorFilterOptions('TODOS', ['Maria Souza']).map((o) => o.label)).toEqual(['Sem gestor', 'Maria Souza']);
  });

  it('esconde o seletor quando showGestorFilter é falso', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioFilters
        filters={DEFAULT_CONTRACTS_FILTERS}
        gestores={['Maria Souza']}
        showGestorFilter={false}
        onChangeFilter={vi.fn()}
        onResetFilters={vi.fn()}
        totalFiltered={2}
        totalContracts={2}
      />
    );
    expect(html).not.toContain('contracts-filter-gestor');
  });

  it('um gestor vindo da URL fora da lista continua selecionado', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioFilters
        filters={{ ...DEFAULT_CONTRACTS_FILTERS, gestor: 'Carlos' }}
        gestores={['Maria Souza']}
        onChangeFilter={vi.fn()}
        onResetFilters={vi.fn()}
        totalFiltered={0}
        totalContracts={2}
      />
    );
    expect(html).toContain('Carlos');
    expect(gestorFilterOptions('Carlos', ['Maria Souza']).map((o) => o.value)).toContain('Carlos');
    expect(html).toContain('Exibindo 0 de 2 contratos');
  });
});
