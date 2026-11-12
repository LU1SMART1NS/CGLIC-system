import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Carteira de Atas e Carteira de Itens quando uma leitura falha (passo 2 da auditoria das telas, achados 3a, 3b, 3f e
 * 3i): a faixa diz o que não carregou, os números das outras fontes ficam e a lista vazia por falha diz "não carregou".
 */
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));
vi.mock('../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
vi.mock('../../hooks/useAtasPortfolio', async (orig) => ({ ...(await orig<typeof import('../../hooks/useAtasPortfolio')>()), useAtasPortfolio: vi.fn() }));
vi.mock('../../hooks/useCarteiraItens', async (orig) => ({ ...(await orig<typeof import('../../hooks/useCarteiraItens')>()), useCarteiraItens: vi.fn() }));
vi.mock('../../hooks/useGruposGti', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useGruposGti')>()),
  useFatiasGtiLeitura: vi.fn(),
  useFatiasItensGtiLeitura: vi.fn()
}));
// Listas e janelas têm testes próprios: aqui só importa se a página as mostra e com quantas linhas.
vi.mock('../atas/ArpPortfolioList', () => ({ ArpPortfolioList: (p: { cards: unknown[] }) => <div data-testid="lista-atas">{p.cards.length} atas</div> }));
vi.mock('../itens/ItensPortfolioTable', () => ({ ItensPortfolioTable: (p: { rows: unknown[] }) => <div data-testid="lista-itens">{p.rows.length} itens</div> }));

import { useAtasPortfolio, ROTULO_ITENS_NAS_FONTES } from '../../hooks/useAtasPortfolio';
import { useCarteiraItens, ROTULOS_CARTEIRA_ITENS } from '../../hooks/useCarteiraItens';
import { ROTULO_GTI_ATAS, useFatiasGtiLeitura, useFatiasItensGtiLeitura } from '../../hooks/useGruposGti';
import { ArpSearch } from '../ArpSearch';
import { ItensPortfolio } from '../itens/ItensPortfolio';

const render = (el: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const ok = (data: unknown = []) => ({ data, isError: false, error: null, refetch: vi.fn() });
const falhou = (mensagem = 'canceling statement due to statement timeout') => ({ data: undefined, isError: true, error: new Error(mensagem), refetch: vi.fn() });

const ata = (numero: string, fim: string) => ({
  numeroAtaRegistroPreco: numero,
  codigoUnidadeGerenciadora: '200331',
  dataVigenciaInicial: '2025-01-01',
  dataVigenciaFinal: fim,
  objeto: `Objeto ${numero}`,
  valorTotal: 1000,
  idCompra: 'C1'
});
const ATAS = [ata('00001/2026', '2030-12-31'), ata('00002/2026', '2030-12-31'), ata('00003/2020', '2021-01-01')];

const portfolio = (over: Record<string, unknown> = {}) =>
  vi.mocked(useAtasPortfolio).mockReturnValue({
    arps: ATAS,
    scopedArps: ATAS,
    isLoading: false,
    scopeLoading: false,
    itemsByAta: {},
    itemsLoadingByAta: {},
    loadItemsForArp: vi.fn(),
    loadItemsForArps: vi.fn(),
    gestorByAta: {},
    saldoStatsByAta: {},
    syncInfo: { isCachedInDb: true },
    isSyncing: false,
    syncProgress: null,
    syncError: null,
    situacaoSincronizacao: { incompleta: false },
    triggerSync: vi.fn(),
    reload: vi.fn(),
    leiturasDasAtas: [{ rotulo: 'atas da UASG 200331', query: ok() }],
    leiturasDosSaldos: [{ rotulo: 'saldo dos itens', query: ok() }],
    leituraDosItensNasFontes: null,
    atasNaoCarregaram: false,
    ...over
  } as any);

const linhaItem = (numero: string) => ({
  key: numero,
  ataKey: '00001/2026-200331',
  arp: ATAS[0],
  item: { numeroItem: numero, descricaoItem: `Item ${numero}`, valorUnitario: 10 },
  faixa: 'REGULAR',
  alocadoPorUnidade: {},
  nivelAlocacao: 'SEM',
  nivelEmpenho: 'SEM'
});
const carteiraItens = (leituras: unknown[] = [], over: Record<string, unknown> = {}) =>
  vi.mocked(useCarteiraItens).mockReturnValue({
    rows: [linhaItem('00001'), linhaItem('00002')],
    resumoPorAta: new Map(),
    unidades: [],
    unidadesDoContrato: new Map(),
    saldosComErro: false,
    isLoading: false,
    leituras,
    ...over
  } as any);

describe('Carteira de Atas: uma leitura falha, a faixa avisa e o resto fica', () => {
  beforeEach(() => {
    portfolio();
    carteiraItens();
    vi.mocked(useFatiasGtiLeitura).mockReturnValue({ fatias: new Map(), consulta: ok(new Map()) } as any);
  });

  it('tudo carregou: sem faixa', () => {
    const html = render(<ArpSearch onSelectArp={vi.fn()} />);
    expect(html).not.toContain('fontes-com-falha');
    expect(html).toContain('2 atas');
  });

  it('as alocações e o GTI não carregaram: a faixa diz os dois, e as atas e os segmentos ficam', () => {
    carteiraItens([{ rotulo: ROTULOS_CARTEIRA_ITENS.alocacoes, query: falhou() }]);
    vi.mocked(useFatiasGtiLeitura).mockReturnValue({ fatias: new Map(), consulta: falhou() } as any);
    const html = render(<ArpSearch onSelectArp={vi.fn()} />);
    expect(html).toContain('data-testid="atas-fontes-com-falha"');
    expect(html).toContain('Parte da carteira não carregou');
    expect(html).toContain('<strong>Alocações às unidades internas</strong>');
    expect(html).toContain(`<strong>${ROTULO_GTI_ATAS.charAt(0).toUpperCase()}${ROTULO_GTI_ATAS.slice(1)}</strong>`);
    // Os números das atas não mudam: 2 vigentes, 1 encerrada (o padrão mostra as vigentes).
    expect(html).toContain('2 atas');
    expect(html).not.toContain('alocacoes-falha-notice');
  });

  it('ata ainda sem itens no banco (3i, passo 3 6e): a faixa diz quais atas, em vez de "ata sem itens" calada', () => {
    portfolio({
      leituraDosItensNasFontes: {
        rotulo: ROTULO_ITENS_NAS_FONTES,
        query: { data: undefined, isError: true, error: new Error('a ata 00002/2026 ainda sem itens no banco'), refetch: vi.fn() }
      }
    });
    const html = render(<ArpSearch onSelectArp={vi.fn()} />);
    expect(html).toContain('<strong>Itens das atas</strong>');
    expect(html).toContain('a ata 00002/2026 ainda sem itens no banco');
  });

  it('as atas não carregaram: "as atas não carregaram", e não uma carteira vazia calada', () => {
    portfolio({ arps: [], scopedArps: [], leiturasDasAtas: [{ rotulo: 'atas da UASG 200331', query: falhou() }], atasNaoCarregaram: true });
    const html = render(<ArpSearch onSelectArp={vi.fn()} />);
    expect(html).toContain('<strong>Atas da UASG 200331</strong>');
    expect(html).toContain('data-testid="atas-nao-carregou"');
    expect(html).not.toContain('data-testid="lista-atas"');
  });

  it('perfil gestor sem o recorte (gestores das atas não carregaram): a faixa, e não a carteira vazia', () => {
    portfolio({ scopedArps: [], leiturasDasAtas: [{ rotulo: 'gestores das atas', query: falhou() }], atasNaoCarregaram: true });
    const html = render(<ArpSearch onSelectArp={vi.fn()} />);
    expect(html).toContain('<strong>Gestores das atas</strong>');
    expect(html).toContain('data-testid="atas-nao-carregou"');
  });
});

describe('Carteira de Itens: uma leitura falha, a faixa avisa e o resto fica', () => {
  beforeEach(() => {
    portfolio();
    carteiraItens();
    vi.mocked(useFatiasItensGtiLeitura).mockReturnValue({ fatias: new Map(), consulta: ok(new Map()) } as any);
  });

  it('tudo carregou: sem faixa', () => {
    const html = render(<ItensPortfolio />);
    expect(html).not.toContain('fontes-com-falha');
    expect(html).toContain('2 itens');
  });

  it('o empenhado e o saldo não carregaram (3f): a faixa diz, os itens ficam', () => {
    carteiraItens(
      [
        { rotulo: ROTULOS_CARTEIRA_ITENS.empenhos, query: falhou() },
        { rotulo: ROTULOS_CARTEIRA_ITENS.saldos, query: falhou('Failed to fetch') }
      ],
      { saldosComErro: true }
    );
    const html = render(<ItensPortfolio />);
    expect(html).toContain('data-testid="itens-fontes-com-falha"');
    expect(html).toContain('<strong>Empenhado dos itens</strong>');
    expect(html).toContain('<strong>Saldo dos itens</strong>');
    expect(html).toContain('sem conexão com o banco');
    expect(html).toContain('2 itens');
    expect(html).not.toContain('saldo-itens-falha-notice');
  });

  it('as atas não carregaram: "os itens não carregaram", e não "nenhum item"', () => {
    portfolio({ arps: [], scopedArps: [], leiturasDasAtas: [{ rotulo: 'atas da UASG 200331', query: falhou() }], atasNaoCarregaram: true });
    carteiraItens([], { rows: [] });
    const html = render(<ItensPortfolio />);
    expect(html).toContain('<strong>Atas da UASG 200331</strong>');
    expect(html).toContain('data-testid="itens-nao-carregou"');
    expect(html).not.toContain('data-testid="lista-itens"');
  });
});
