import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { CarteiraItemRow } from '../../../utils/carteiraItens';

// Item com quantitativo SENASP negativo pela fonte (ata 00058/2025, item 1: registrado 298 − gerenciado 722 = −424).
const linha = (extra: Partial<CarteiraItemRow>): CarteiraItemRow =>
  ({
    key: '00058/2025-200331-00001',
    ataKey: '00058/2025-200331',
    arp: { numeroAtaRegistroPreco: '00058/2025', codigoUnidadeGerenciadora: '200331', dataVigenciaFinal: '2027-09-22' },
    item: { numeroItem: '00001', descricaoItem: 'MOTOCICLETA', nomeRazaoSocialFornecedor: 'FORNECEDOR A' },
    diasRestantes: 314,
    faixa: 'REGULAR',
    quantitativoSenasp: -424,
    consumoPct: 0,
    alocado: 111,
    alocadoPorUnidade: { FNSP: 111 },
    nivelAlocacao: 'TOTAL',
    contratada: 117,
    contratadoSemUnidade: 117,
    empenhado: 0,
    nivelEmpenho: 'SEM',
    ataAssinada: null,
    limiteProvisorioOutrosOrgaos: 0,
    ...extra
  }) as unknown as CarteiraItemRow;

let rows: CarteiraItemRow[] = [];

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }));
vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => () => {} }));
vi.mock('../../../hooks/useAtasPortfolio', () => ({
  useAtasPortfolio: () => ({ arps: [{}], scopedArps: [{}], isLoading: false, scopeLoading: false, itemsByAta: {}, gestorByAta: {}, syncError: null, reload: () => {}, leiturasDasAtas: [], atasNaoCarregaram: false })
}));
vi.mock('../../../hooks/useCarteiraItens', () => ({
  ROTULOS_CARTEIRA_ITENS: { alocacoes: 'alocações', saldos: 'saldos' },
  useCarteiraItens: () => ({ rows, unidades: [{ chave: 'FNSP', nome: 'FNSP' }], isLoading: false, leituras: [] })
}));
vi.mock('../../../hooks/useAtasAMontar', () => ({ useDivisoesDasAtasMontadas: () => new Map() }));
vi.mock('../AlocarUnidadeModal', () => ({ AlocarUnidadeModal: () => null }));
vi.mock('../../../hooks/useProgramasDaAlocacao', () => ({ useProgramasDosItens: () => new Map() }));
vi.mock('../../../hooks/useDivisaoNaAta', () => ({
  useDivisoesNaAta: () => ({ de: () => ({ situacao: 'A_CONFERIR' }), mapa: new Map(), query: { isError: false } }),
  useMarcarDivisaoDaAta: () => ({ mutateAsync: vi.fn(), isPending: false })
}));


const { ItensUnidadesPage } = await import('../ItensUnidadesPage');
const render = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <ItensUnidadesPage />
    </MemoryRouter>
  );

describe('Alocação: item com quantitativo SENASP negativo', () => {
  it('não some: aviso no topo mesmo no filtro padrão (Sem alocação), com o botão para ver', () => {
    rows = [linha({})];
    const html = render('/alocacao');
    expect(html).toContain('data-testid="alocacao-negativos"');
    expect(html).toContain('1 item com quantitativo SENASP negativo');
    expect(html).toContain('ata 00058/2025 item 1');
    expect(html).toContain('Ver o item');
  });

  it('em Todos, a ata aparece marcada e o item mostra o negativo', () => {
    rows = [linha({})];
    const html = render('/alocacao?alocacao=TODOS&ver=ITEM');
    expect(html).toContain('data-testid="alocacao-negativo-00058/2025-200331-00001"');
    expect(html).toContain('negativo: conferir na fonte');
    const porAta = render('/alocacao?alocacao=TODOS');
    expect(porAta).toContain('data-testid="vinc-atas-negativo-00058/2025-200331"');
    expect(porAta).toContain('1 item com quantitativo SENASP negativo');
  });

  it('sem negativo, nada de aviso; ata vencida não avisa', () => {
    rows = [linha({ quantitativoSenasp: 298 })];
    expect(render('/alocacao')).not.toContain('alocacao-negativos');
    rows = [linha({ faixa: 'EXPIRADO' as CarteiraItemRow['faixa'] })];
    expect(render('/alocacao')).not.toContain('alocacao-negativos');
  });
});
