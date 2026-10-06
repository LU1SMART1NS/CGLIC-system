import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable } from '../components/DataTable';

interface Row { id: string; sigla: string; nome: string; interno: string }
const data: Row[] = [
  { id: '1', sigla: 'CGLIC', nome: 'Coordenação-Geral de Licitações', interno: 'x' },
  { id: '2', sigla: 'DGE', nome: 'Diretoria de Gestão', interno: 'y' }
];
const columns = [
  { key: 'sigla', header: 'Sigla', priority: 'primary' as const },
  { key: 'nome', header: 'Nome completo', mobileLabel: 'Nome' },
  { key: 'interno', header: 'Interno', priority: 'tertiary' as const }
];

const mockMobile = (isMobile: boolean) =>
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: isMobile, addEventListener: () => {}, removeEventListener: () => {} })
  });

describe('DataTable — modos desktop e mobile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('desktop renderiza tabela com coluna de ações', () => {
    mockMobile(false);
    const html = renderToStaticMarkup(
      <DataTable<Row> columns={columns} data={data} keyExtractor={(r) => r.id} rowActions={(r) => <button>Editar {r.sigla}</button>} />
    );
    expect(html).toContain('<table');
    expect(html).toContain('Ações');
    expect(html).toContain('Editar CGLIC');
    expect(html).not.toContain('ds-table-cards');
  });

  it('mobile renderiza cartões: primary vira título, secondary vira dl e tertiary some', () => {
    mockMobile(true);
    const html = renderToStaticMarkup(
      <DataTable<Row> testId="t" columns={columns} data={data} keyExtractor={(r) => r.id} rowActions={(r) => <button>Editar {r.sigla}</button>} />
    );
    expect(html).not.toContain('<table');
    expect(html).toContain('ds-table-cards__title');
    expect(html).toContain('<dt>Nome</dt>');
    expect(html).toContain('Coordenação-Geral de Licitações');
    expect(html).not.toContain('Interno');
    expect(html).toContain('data-testid="t-row-1"');
    expect(html).toContain('ds-table-cards__actions');
  });

  it('mobile sem primary usa a primeira coluna como título', () => {
    mockMobile(true);
    const html = renderToStaticMarkup(
      <DataTable<Row> columns={[{ key: 'sigla', header: 'Sigla' }, { key: 'nome', header: 'Nome' }]} data={data} keyExtractor={(r) => r.id} />
    );
    expect(html).toMatch(/ds-table-cards__title"><div>CGLIC/);
  });

  it('mobileLayout="scroll" mantém a tabela com primeira coluna fixa', () => {
    mockMobile(true);
    const html = renderToStaticMarkup(
      <DataTable<Row> columns={columns} data={data} keyExtractor={(r) => r.id} mobileLayout="scroll" stickyFirstColumn minTableWidth="720px" />
    );
    expect(html).toContain('<table');
    expect(html).toContain('ds-table--sticky-first');
    expect(html).toContain('min-width:720px');
  });

  it('renderMobileCard substitui o cartão padrão e vazio mostra a mensagem', () => {
    mockMobile(true);
    const html = renderToStaticMarkup(
      <DataTable<Row> columns={columns} data={data} keyExtractor={(r) => r.id} renderMobileCard={(r) => <b>CUSTOM {r.id}</b>} />
    );
    expect(html).toContain('CUSTOM 1');
    const empty = renderToStaticMarkup(<DataTable<Row> columns={columns} data={[]} keyExtractor={(r) => r.id} emptyMessage="Sem dados" />);
    expect(empty).toContain('Sem dados');
  });

  it('só as colunas com sortValue ganham botão de ordenação', () => {
    mockMobile(false);
    const html = renderToStaticMarkup(
      <DataTable<Row>
        columns={[{ key: 'sigla', header: 'Sigla', sortValue: (r) => r.sigla }, { key: 'nome', header: 'Nome completo' }]}
        data={data}
        keyExtractor={(r) => r.id}
      />
    );
    expect(html).toContain('data-testid="sort-sigla"');
    expect(html).not.toContain('data-testid="sort-nome"');
    expect(html).toContain('aria-sort="none"');
  });
});
