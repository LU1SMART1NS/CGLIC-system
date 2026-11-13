import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { CarteiraItemRow } from '../../../utils/carteiraItens';

// Duas atas: 00031/2025 não divide entre as unidades (migration 297), 00051/2024 divide.
const linha = (ata: string, extra: Partial<CarteiraItemRow>): CarteiraItemRow =>
  ({
    key: `${ata}-200331-00001`,
    ataKey: `${ata}-200331`,
    arp: { numeroAtaRegistroPreco: ata, codigoUnidadeGerenciadora: '200331', dataVigenciaFinal: '2027-09-22' },
    item: { numeroItem: '00001', descricaoItem: 'PISTOLA', nomeRazaoSocialFornecedor: 'FORNECEDOR A' },
    diasRestantes: 300, faixa: 'REGULAR', quantitativoSenasp: 2000, consumoPct: 0, alocado: 0, alocadoPorUnidade: {},
    nivelAlocacao: 'SEM', contratada: null, contratadoSemUnidade: 0, empenhado: 0, nivelEmpenho: 'SEM', ataAssinada: null,
    limiteProvisorioOutrosOrgaos: 0, ...extra
  }) as unknown as CarteiraItemRow;

const rows = [linha('00031/2025', { semDivisaoNaAta: true }), linha('00051/2024', { semDivisaoNaAta: false })];
const divisoes = new Map([
  ['00031/2025-200331', { situacao: 'NAO_DIVIDE', fonte: 'PDF' }],
  ['00051/2024-200331', { situacao: 'DIVIDE', fonte: 'PESSOA', marcadoPorNome: 'Fulano', marcadoEm: '2026-11-13T10:00:00Z' }]
]);

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ role: 'gestor_saldos' }) }));
vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => () => {} }));
vi.mock('../../../hooks/useAtasPortfolio', () => ({
  useAtasPortfolio: () => ({ arps: [{}], scopedArps: [{}], isLoading: false, scopeLoading: false, itemsByAta: {}, gestorByAta: {}, syncError: null, reload: () => {}, leiturasDasAtas: [], atasNaoCarregaram: false })
}));
vi.mock('../../../hooks/useCarteiraItens', () => ({
  ROTULOS_CARTEIRA_ITENS: { alocacoes: 'alocações', saldos: 'saldos' },
  useCarteiraItens: () => ({ rows, unidades: [], isLoading: false, leituras: [] })
}));
vi.mock('../../../hooks/useAtasAMontar', () => ({ useDivisoesDasAtasMontadas: () => new Map() }));
vi.mock('../AlocarUnidadeModal', () => ({ AlocarUnidadeModal: () => null }));
vi.mock('../../../hooks/useProgramasDaAlocacao', () => ({ useProgramasDosItens: () => new Map() }));
vi.mock('../../../hooks/useDivisaoNaAta', () => ({
  useDivisoesNaAta: () => ({ de: (k: string) => divisoes.get(k) ?? { situacao: 'A_CONFERIR' }, mapa: divisoes, query: { isError: false } }),
  useMarcarDivisaoDaAta: () => ({ mutateAsync: vi.fn(), isPending: false })
}));

const { ItensUnidadesPage } = await import('../ItensUnidadesPage');
const render = (url: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><ItensUnidadesPage /></MemoryRouter>);

describe('Alocação: ata que não divide entre as unidades', () => {
  it('trilho próprio: a ata sem divisão sai de "Sem alocação"', () => {
    const html = render('/alocacao');
    expect(html).toContain('Sem divisão na ata');
    expect(html).toContain('data-testid="vinc-atas-row-00051/2024-200331"');
    expect(html).not.toContain('data-testid="vinc-atas-row-00031/2025-200331"');
    const livre = render('/alocacao?alocacao=LIVRE');
    expect(livre).toContain('data-testid="vinc-atas-row-00031/2025-200331"');
    expect(livre).not.toContain('data-testid="vinc-atas-row-00051/2024-200331"');
  });

  it('selo ao lado do número e situação "Sem divisão"', () => {
    const html = render('/alocacao?alocacao=TODOS');
    expect(html).toContain('data-testid="vinc-atas-divisao-00031/2025-200331"');
    expect(html).toContain('Ata sem divisão');
    expect(html).toContain('Divisão pela ata');
    expect(html).toContain('2.000 livre');
  });

  it('filtro "Divisão na ata" e caixa de marcação na ata aberta, com quem marcou (só para marcação na tela)', () => {
    const html = render('/alocacao?alocacao=TODOS&divisao=DIVIDE&busca=pistola');
    expect(html).toContain('data-testid="vinc-itens-filter-divisao"');
    expect(html).not.toContain('data-testid="vinc-atas-row-00031/2025-200331"');
    expect(html).toContain('data-testid="vinc-atas-sem-divisao-00051/2024-200331"');
    expect(html).toContain('Marcado por Fulano em 13/11/2026.');
    expect(html).not.toContain('Lido do PDF');
  });
});
