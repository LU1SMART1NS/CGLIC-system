import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { FinancialExecutionRoute } from '../FinancialExecutionRoute';
import * as sincronizacaoModule from '../../hooks/useSincronizacaoEmpenhos';
import * as financeiroModule from '../../hooks/useFinanceiroCarteira';
import * as authModule from '../../context/AuthContext';
import type { EmpenhoCarteiraRow } from '../../services/financeiroCarteiraService';

vi.mock('../../hooks/useFinanceiroCarteira', () => ({ useEmpenhosCarteira: vi.fn() }));
vi.mock('../../hooks/useSincronizacaoEmpenhos', () => ({ useSincronizacaoEmpenhos: vi.fn() }));
vi.mock('../../hooks/useContractsPortfolio', () => ({
  useContractsPortfolio: vi.fn(() => ({
    rows: [
      { contractKey: '200331-00094-2022', contract: { numero: '00094', ano: 2022, fornecedorNome: 'MIRANDA TURISMO' }, gestorNome: 'Marina Costa' }
    ],
    isLoading: false,
    isLoadingScope: false
  }))
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));

const empenho = (over: Partial<EmpenhoCarteiraRow>): EmpenhoCarteiraRow => ({
  empenhoId: 'e1',
  numero: '2026NE000027',
  ano: 2026,
  uasgEmitente: '200331',
  dataEmissao: '2026-01-07',
  credorNome: 'MIRANDA TURISMO',
  credorDocumento: '24.929.614/0001-10',
  valorEmpenhado: 1000,
  valorPago: 400,
  saldo: 600,
  contractKeys: ['200331-00094-2022'],
  ...over
});

const render = (url = '/empenhos') =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <FinancialExecutionRoute />
    </MemoryRouter>
  );

describe('Financeiro → Empenhos', () => {
  beforeEach(() => {
    vi.mocked(sincronizacaoModule.useSincronizacaoEmpenhos).mockReturnValue({
      podeForcar: true,
      sincronizando: false,
      ultimoSucessoEm: null,
      atualizar: vi.fn()
    } as never);
    vi.mocked(financeiroModule.useEmpenhosCarteira).mockReturnValue({
      rows: [
        empenho({}),
        empenho({ empenhoId: 'e2', numero: '2025NE000010', ano: 2025, valorPago: 1000, saldo: 0 }),
        empenho({ empenhoId: 'e3', numero: '2024NE000005', ano: 2024, uasgEmitente: '200330', contractKeys: ['200330-00020-2020'] })
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn()
    } as never);
    vi.mocked(authModule.useAuth).mockReturnValue({ role: 'admin' } as never);
  });

  it('segue a moldura da Carteira: segmentos de saldo, filtros em botão e linha clicável', () => {
    const html = render();
    expect(html).toContain('Empenhos');
    expect(html).toContain('data-testid="empenhos-saldo-COM_SALDO"');
    expect(html).toMatch(/Com saldo<span[^>]*>2</);
    expect(html).toMatch(/Sem saldo<span[^>]*>1</);
    expect(html).toContain('data-testid="empenhos-filter-ano"');
    expect(html).toContain('data-testid="empenhos-filter-gestor"');
    expect(html).toContain('carteira-row-link');
    // Padrão "Com saldo": o empenho todo pago fica de fora.
    expect(html).toContain('2026NE000027');
    expect(html).not.toContain('2025NE000010');
    // Número do contrato e gestor vêm da carteira; contrato fora dela usa a chave.
    expect(html).toContain('00094/2022');
    expect(html).toContain('Marina Costa');
    expect(html).toContain('00020/2020');
  });

  it('não mostra os quadros antigos nem as abas de UASG', () => {
    const html = render();
    expect(html).not.toContain('Total liquidado');
    expect(html).not.toContain('Restos a Pagar');
    expect(html).not.toContain('financial-execution-uasg-tabs');
    expect(html).not.toContain('Ver contrato');
  });

  it('filtros vêm do endereço', () => {
    const html = render('/empenhos?saldo=TODOS&ano=2025');
    expect(html).toContain('2025NE000010');
    expect(html).not.toContain('2026NE000027');
  });

  it('perfil gestor vê só os empenhos dos próprios contratos e não tem filtro de gestor', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({ role: 'gestor' } as never);
    const html = render('/empenhos?saldo=TODOS');
    expect(html).toContain('2026NE000027');
    expect(html).not.toContain('2024NE000005');
    expect(html).not.toContain('data-testid="empenhos-filter-gestor"');
  });

  it('perfil que não força a atualização vê só o indicador', () => {
    vi.mocked(sincronizacaoModule.useSincronizacaoEmpenhos).mockReturnValue({
      podeForcar: false,
      sincronizando: false,
      ultimoSucessoEm: '2026-10-07T08:44:00Z',
      atualizar: vi.fn()
    } as never);
    const html = render();
    expect(html).toContain('Atualizado');
    expect(html).not.toContain('data-testid="financial-execution-refresh-btn"');
  });
});
