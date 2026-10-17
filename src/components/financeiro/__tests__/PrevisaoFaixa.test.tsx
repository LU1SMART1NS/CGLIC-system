import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LinhaPrevisao } from '../../../services/previsaoMensalService';

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin', user: null })) }));
vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
vi.mock('../../../hooks/usePrevisaoMensal', async (orig) => ({ ...(await orig<typeof import('../../../hooks/usePrevisaoMensal')>()), usePrevisaoMensal: vi.fn() }));
vi.mock('../../../hooks/useFinanceiroCarteira', async (orig) => ({ ...(await orig<typeof import('../../../hooks/useFinanceiroCarteira')>()), useFaturasCarteira: vi.fn() }));
vi.mock('../../../hooks/useExpectativasPagamento', () => ({ useExpectativasPagamento: vi.fn() }));
vi.mock('../useContratosDoFinanceiro', async (orig) => ({ ...(await orig<typeof import('../useContratosDoFinanceiro')>()), useContratosDoFinanceiro: vi.fn() }));

import { usePrevisaoMensal } from '../../../hooks/usePrevisaoMensal';
import { ROTULOS_FINANCEIRO, useFaturasCarteira } from '../../../hooks/useFinanceiroCarteira';
import { useExpectativasPagamento } from '../../../hooks/useExpectativasPagamento';
import { useContratosDoFinanceiro } from '../useContratosDoFinanceiro';
import { PrevisaoMes } from '../PrevisaoMes';
import { PrevisaoContratos } from '../PrevisaoContratos';

const render = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>
  );
const ok = { data: [], isError: false, error: null, refetch: vi.fn() };
const falhou = () => ({ data: undefined, isError: true, error: new Error('canceling statement due to statement timeout'), refetch: vi.fn() });

const linha = (over: Partial<LinhaPrevisao>): LinhaPrevisao => ({
  chave: 'L1',
  origem: 'FATURA',
  contractKey: 'K1',
  ug: '200331',
  empenho: '2026NE000412',
  empenhoKey: null,
  subitem: null,
  valor: 1000,
  valorOriginal: 1000,
  emenda: false,
  emendaAutomatica: false,
  retirada: false,
  ajustada: false,
  detalhe: 'NF 231 · liquidada',
  semSaldo: false,
  semValor: false,
  ...over
});

describe('Previsão: uma leitura falha, a faixa avisa e o resto fica', () => {
  beforeEach(() => {
    vi.mocked(useContratosDoFinanceiro).mockReturnValue({
      contrato: () => ({ numero: '00094/2022', fornecedorNome: 'MIRANDA TURISMO' }),
      lista: [{ contractKey: 'K1', numero: '00094/2022', expirado: false }],
      escopo: null,
      showGestorFilter: true,
      isLoading: false,
      leituras: [],
      contratosNaoCarregaram: false
    } as never);
  });

  it('Previsão do mês: os ciclos não carregaram → a faixa diz, e as linhas das faturas ficam', () => {
    vi.mocked(usePrevisaoMensal).mockReturnValue({
      linhas: [linha({}), linha({ chave: 'L2', valor: 500 })],
      ajustes: [],
      envio: null,
      prazoEmenda: null,
      sugeridosSemMarca: 0,
      isLoading: false,
      ajustar: vi.fn(),
      registrarEnvio: vi.fn(),
      leituras: [
        { rotulo: ROTULOS_FINANCEIRO.faturas, query: ok },
        { rotulo: ROTULOS_FINANCEIRO.ciclos, query: falhou() }
      ]
    } as never);
    const html = render(<PrevisaoMes />);
    expect(html).toContain('data-testid="previsao-fontes-com-falha"');
    expect(html).toContain('Parte da previsão não carregou');
    expect(html).toContain('<strong>Ciclos de pagamento</strong>');
    expect(html).toMatch(/Faturas<span[^>]*>2</);
  });

  it('Previsão do mês: tudo carregou, sem faixa', () => {
    vi.mocked(usePrevisaoMensal).mockReturnValue({
      linhas: [linha({})],
      ajustes: [],
      envio: null,
      prazoEmenda: null,
      sugeridosSemMarca: 0,
      isLoading: false,
      ajustar: vi.fn(),
      registrarEnvio: vi.fn(),
      leituras: [{ rotulo: ROTULOS_FINANCEIRO.faturas, query: ok }]
    } as never);
    expect(render(<PrevisaoMes />)).not.toContain('previsao-fontes-com-falha');
  });

  it('Como cada contrato é pago: as marcas não carregaram → a faixa diz, e os contratos ficam', () => {
    vi.mocked(useFaturasCarteira).mockReturnValue({ ...ok, isLoading: false, tesouro: ok } as never);
    vi.mocked(useExpectativasPagamento).mockReturnValue({
      marcas: new Map(),
      entregas: [],
      isLoading: false,
      error: new Error('canceling statement due to statement timeout'),
      consulta: falhou(),
      definir: vi.fn()
    } as never);
    const html = render(<PrevisaoContratos />);
    expect(html).toContain('data-testid="previsao-contratos-fontes-com-falha"');
    expect(html).toContain('<strong>Como cada contrato costuma ser pago e entregas previstas</strong>');
    // Os contratos carregaram: a lista conta o contrato vigente (sem marca, sem pagamento recente).
    expect(html).toMatch(/Todos<span[^>]*>1</);
  });
});
