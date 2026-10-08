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

  it('rowOpen: só a linha com destino vira clicável (tabela e cartão); sem rowOpen nada muda', () => {
    const abrir = () => undefined;
    const rowOpen = (r: Row) => (r.id === '1' ? abrir : null);
    mockMobile(false);
    const tabela = renderToStaticMarkup(<DataTable<Row> testId="t" columns={columns} data={data} keyExtractor={(r) => r.id} rowOpen={rowOpen} />);
    expect(tabela).toMatch(/data-testid="t-row-1"[^>]*class="carteira-row-link"|class="carteira-row-link"[^>]*data-testid="t-row-1"/);
    expect(tabela).not.toMatch(/data-testid="t-row-2"[^>]*carteira-row-link/);
    mockMobile(true);
    const cartoes = renderToStaticMarkup(<DataTable<Row> testId="t" columns={columns} data={data} keyExtractor={(r) => r.id} rowOpen={rowOpen} />);
    expect(cartoes).toContain('ds-table-cards__item action-row--go');
    expect((cartoes.match(/action-row--go/g) ?? []).length).toBe(1);
    mockMobile(false);
    expect(renderToStaticMarkup(<DataTable<Row> columns={columns} data={data} keyExtractor={(r) => r.id} />)).not.toContain('carteira-row-link');
  });
});

describe('DataTable — linha com detalhes (renderExpanded)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const detalhe = (r: Row) => <p>Detalhe de {r.sigla}</p>;

  it('desktop: setinha em cada linha; só a linha aberta mostra os detalhes logo abaixo', () => {
    mockMobile(false);
    const html = renderToStaticMarkup(
      <DataTable<Row>
        testId="t"
        columns={columns}
        data={data}
        keyExtractor={(r) => r.id}
        renderExpanded={detalhe}
        expandedKeys={new Set(['2'])}
        expandLabel={(r) => r.sigla}
      />
    );
    expect(html).toContain('data-testid="t-expand-1"');
    expect(html).toContain('aria-label="Abrir detalhes de CGLIC"');
    expect(html).toContain('aria-label="Recolher detalhes de DGE"');
    expect(html).toContain('data-testid="t-detail-2"');
    expect(html).not.toContain('t-detail-1');
    expect(html).toContain('Detalhe de DGE');
    expect(html).not.toContain('Detalhe de CGLIC');
    // A linha toda é clicável e a aberta fica marcada.
    expect(html).toContain('carteira-row-link');
    expect(html).toContain('ds-table__row--open');
    // A célula de detalhes ocupa a largura toda (setinha + colunas).
    expect(html).toContain('colSpan="4"');
  });

  it('mobile: o cartão aberto mostra os detalhes e o botão de recolher', () => {
    mockMobile(true);
    const html = renderToStaticMarkup(
      <DataTable<Row> testId="t" columns={columns} data={data} keyExtractor={(r) => r.id} renderExpanded={detalhe} expandedKeys={new Set(['1'])} />
    );
    expect(html).toContain('Detalhe de CGLIC');
    expect(html).not.toContain('Detalhe de DGE');
    expect(html).toContain('t-expand-2');
  });

  it('sem renderExpanded, nada muda: sem setinha nem coluna extra', () => {
    mockMobile(false);
    const html = renderToStaticMarkup(<DataTable<Row> testId="t" columns={columns} data={data} keyExtractor={(r) => r.id} />);
    expect(html).not.toContain('t-expand-');
    expect(html).not.toContain('aria-label="Detalhes"');
  });
});
