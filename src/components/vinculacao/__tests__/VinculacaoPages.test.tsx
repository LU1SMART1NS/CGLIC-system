import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { mapDistribuicao } from '../../../services/distribuicaoEmpenhoService';

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'gestor' })) }));
vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
vi.mock('../../../hooks/useVinculacaoEmpenhos', () => ({
  useEmpenhosParaVincularAosItens: vi.fn(),
  useContratosComEmpenhosConsultados: vi.fn(() => ({ data: new Set(['K1']), isLoading: false }))
}));
vi.mock('../../../hooks/useFinanceiroCarteira', () => ({ useFaturasCarteira: vi.fn() }));
vi.mock('../../financeiro/useContratosDoFinanceiro', async (orig) => ({
  ...(await orig<typeof import('../../financeiro/useContratosDoFinanceiro')>()),
  useContratosDoFinanceiro: vi.fn()
}));
vi.mock('../../../hooks/useAtasPortfolio', async (orig) => ({ ...(await orig<typeof import('../../../hooks/useAtasPortfolio')>()), useAtasPortfolio: vi.fn() }));
vi.mock('../../../hooks/useCarteiraItens', () => ({ useCarteiraItens: vi.fn() }));
// Janelas: não abrem no render estático; os hooks delas não rodam.
vi.mock('../VincularAosItensDialog', () => ({ VincularAosItensDialog: () => null }));
vi.mock('../../alocacao/AlocarUnidadeModal', () => ({ AlocarUnidadeModal: () => null }));
vi.mock('@tanstack/react-query', async (orig) => ({ ...(await orig<typeof import('@tanstack/react-query')>()), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../../hooks/useVinculoEmpenhosContrato', () => ({ useAcoesVinculoEmpenho: () => ({ vincular: { mutate: vi.fn(), isPending: false, error: null } }) }));

import { useAuth } from '../../../context/AuthContext';
import { useEmpenhosParaVincularAosItens } from '../../../hooks/useVinculacaoEmpenhos';
import { useFaturasCarteira } from '../../../hooks/useFinanceiroCarteira';
import { useContratosDoFinanceiro } from '../../financeiro/useContratosDoFinanceiro';
import { useAtasPortfolio } from '../../../hooks/useAtasPortfolio';
import { useCarteiraItens } from '../../../hooks/useCarteiraItens';
import { EmpenhosItensPage } from '../EmpenhosItensPage';
import { EmpenhosContratoPage } from '../EmpenhosContratoPage';
import { ItensUnidadesPage } from '../../alocacao/ItensUnidadesPage';

const render = (el: React.ReactElement, url = '/') => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{el}</MemoryRouter>);
const contratos = (escopo: Set<string> | null = null) =>
  vi.mocked(useContratosDoFinanceiro).mockReturnValue({
    contrato: (k: string) => ({ numero: k === 'K1' ? '00002/2025' : '00009/2025', fornecedorNome: 'INBRA', gestorNome: 'Maria', expirado: false }),
    lista: [],
    escopo,
    showGestorFilter: escopo === null,
    isLoading: false
  } as any);
const nota = (over: any) =>
  mapDistribuicao({ contrato_empenho_id: over.ne, contract_key: 'K1', empenho_id: over.ne, numero_oficial: over.ne, valor_nota: 14700, itens_no_contrato: 3, parcelas: [], sugestao: [], situacao: 'A_DISTRIBUIR', ...over });

describe('Vinculação → Empenhos aos itens', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    contratos(new Set(['K1']));
    vi.mocked(useEmpenhosParaVincularAosItens).mockReturnValue({
      data: [
        nota({ ne: '2024NE000328', sugestao_tipo: 'MULTIPLO_DO_PRECO', sugestao: [{ numero_item: 13, quantidade: 3 }] }),
        nota({ ne: '2024NE000330', situacao: 'REVISAR', motivo_revisao: 'VALOR_MUDOU', valor_na_distribuicao: 9800, origem: 'USUARIO' }),
        nota({ ne: '2026NE000001', contract_key: 'OUTRO' }),
        nota({ ne: '2024NE000337', situacao: 'DISTRIBUIDA', origem: 'USUARIO', parcelas: [{ numero_item: 43, valor: 14700 }], distribuido_por_nome: 'Maria' })
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn()
    } as any);
  });

  it('gestor vê só as notas dos próprios contratos, a rever primeiro, com o botão de vincular', () => {
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('Empenhos a vincular aos itens');
    expect(html).toContain('2024NE000328');
    expect(html).not.toContain('2026NE000001');
    expect(html.indexOf('2024NE000330')).toBeLessThan(html.indexOf('2024NE000328'));
    expect(html).toContain('Vincular aos itens');
    expect(html).toContain('3 un do item 13');
    expect(html).toContain('vinc-empenhos-selecionar-2024NE000328');
    // A vinculada pela equipe fica no outro segmento.
    expect(html).not.toContain('vinc-empenhos-row-2024NE000337');
    expect(html).not.toContain('Distribu');
  });

  it('consulta não vê botões nem seleção', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'leitor' } as any);
    contratos(null);
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('2026NE000001');
    expect(html).not.toContain('vinc-empenhos-vincular-');
    expect(html).not.toContain('vinc-empenhos-selecionar-');
  });

  it('segmento "Vinculadas pela equipe" mostra quem vinculou', () => {
    const html = render(<EmpenhosItensPage />, '/?fila=EQUIPE');
    expect(html).toContain('vinc-empenhos-row-2024NE000337');
    expect(html).toContain('por Maria');
    expect(html).toContain('Editar o vínculo');
  });
});

describe('Vinculação → Empenhos ao contrato', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    contratos(new Set(['K1']));
    vi.mocked(useFaturasCarteira).mockReturnValue({
      data: [
        { idFatura: 1490, contractKey: 'K1', numero: '1490', referencia: '07/2026', emissao: '2026-07-10', valorLiquido: 24500, cancelada: false, empenhosSemVinculo: 1, empenhosSemVinculoNumeros: '2024NE000412' },
        { idFatura: 2231, contractKey: 'K2', numero: '2231', emissao: '2026-09-01', valorLiquido: 11800, cancelada: false, empenhosSemVinculo: 1, empenhosSemVinculoNumeros: '2025NE000603' }
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn()
    } as any);
  });

  it('lista a NE citada pela fatura, com vincular ao contrato e o portal oficial', () => {
    const html = render(<EmpenhosContratoPage />);
    expect(html).toContain('Empenhos a vincular ao contrato');
    expect(html).toContain('2024NE000412');
    expect(html).toContain('1490');
    expect(html).toContain('Vincular ao contrato');
    expect(html).toContain('Contratos.gov.br');
    // Contrato fora do escopo do gestor e contrato sem empenhos consultados não entram.
    expect(html).not.toContain('2025NE000603');
  });

  it('consulta vê a lista sem o botão de vincular', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'leitor' } as any);
    contratos(null);
    const html = render(<EmpenhosContratoPage />);
    expect(html).toContain('2024NE000412');
    expect(html).not.toContain('Vincular ao contrato');
  });
});

describe('Alocação → Itens às unidades', () => {
  const linha = (over: any) => ({
    key: over.key,
    ataKey: '00021/2024-200331',
    arp: { numeroAtaRegistroPreco: '00021/2024', codigoUnidadeGerenciadora: '200331' },
    item: { numeroItem: over.numero, descricaoItem: over.desc },
    gestorNome: 'Maria',
    diasRestantes: 100,
    faixa: 'REGULAR',
    quantitativoSenasp: over.senasp,
    consumoPct: null,
    alocado: over.alocado,
    alocadoPorUnidade: over.un,
    nivelAlocacao: over.nivel,
    contratada: null,
    empenhado: 0,
    empenhosPendentes: 0,
    nivelEmpenho: 'SEM'
  });
  beforeEach(() => {
    vi.mocked(useAtasPortfolio).mockReturnValue({ arps: [{}], scopedArps: [], isLoading: false, scopeLoading: false, itemsByAta: {}, gestorByAta: {}, syncError: null, reload: vi.fn() } as any);
    vi.mocked(useCarteiraItens).mockReturnValue({
      rows: [
        linha({ key: 'a', numero: '00013', desc: 'Placa balística', senasp: 79, alocado: 0, un: {}, nivel: 'SEM' }),
        linha({ key: 'b', numero: '00043', desc: 'Capacete balístico', senasp: 342, alocado: 200, un: { dfnsp: 200 }, nivel: 'PARCIAL' }),
        linha({ key: 'c', numero: '00045', desc: 'Capacete lote 2', senasp: 35, alocado: 35, un: { dfnsp: 35 }, nivel: 'TOTAL' })
      ],
      unidades: [{ chave: 'dfnsp', nome: 'DFNSP' }],
      isLoading: false
    } as any);
  });

  it('gestor de saldos abre em "Sem alocação" e aloca da linha', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_saldos' } as any);
    const html = render(<ItensUnidadesPage />);
    expect(html).toContain('Itens a alocar às unidades internas');
    expect(html).toContain('Placa balística');
    expect(html).not.toContain('Capacete balístico');
    expect(html).toContain('vinc-itens-alocar-a');
    expect(html).toContain('221 un ainda sem unidade');
  });

  it('parcialmente alocados mostram o que falta e as unidades', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_saldos' } as any);
    const html = render(<ItensUnidadesPage />, '/?alocacao=PARCIAL');
    expect(html).toContain('Capacete balístico');
    expect(html).toContain('142 un');
    expect(html).toContain('DFNSP 200');
  });

  it('gestor e consulta só acompanham: sem botão Alocar', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    expect(render(<ItensUnidadesPage />)).not.toContain('vinc-itens-alocar-');
  });
});
