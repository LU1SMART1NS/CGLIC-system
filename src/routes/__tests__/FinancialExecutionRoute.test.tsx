import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { FinancialExecutionRoute } from '../FinancialExecutionRoute';
import * as sincronizacaoModule from '../../hooks/useSincronizacaoEmpenhos';
import * as financeiroModule from '../../hooks/useFinanceiroCarteira';
import * as authModule from '../../context/AuthContext';
import type { EmpenhoCarteiraRow } from '../../services/financeiroCarteiraService';
import * as vinculacaoModule from '../../hooks/useVinculacaoEmpenhos';
import * as portfolioModule from '../../hooks/useContractsPortfolio';

vi.mock('../../hooks/useFinanceiroCarteira', async (orig) => ({ ...(await orig<typeof import('../../hooks/useFinanceiroCarteira')>()), useEmpenhosCarteira: vi.fn() }));
vi.mock('../../hooks/useSincronizacaoEmpenhos', () => ({ useSincronizacaoEmpenhos: vi.fn() }));
const situacaoPadrao = () => ({ data: new Map([['e1', { empenhoId: 'e1', contractKey: 'K', situacao: 'A_DISTRIBUIR', origem: null }]]) });
vi.mock('../../hooks/useVinculacaoEmpenhos', () => ({ useSituacaoDistribuicaoPorEmpenho: vi.fn(() => situacaoPadrao()) }));
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
        empenho({ empenhoId: 'e3', numero: '2024NE000005', ano: 2024, uasgEmitente: '200330', contractKeys: ['200330-00020-2020'] }),
        empenho({
          empenhoId: 'e4', numero: '2025NE000471', ano: 2025, valorEmpenhado: 38150244, valorPago: 0, fontePago: 'TESOURO', valorPagoFaturas: 37861227,
          saldo: 109826460, liquidadoAPagar: 37861227, tesouroAtualizadoEm: '2026-10-14 14:55:14'
        }),
        empenho({ empenhoId: 'e5', numero: '2025NE000500', ano: 2025, fontePago: 'FATURAS', valorPagoFaturas: 400 }),
        empenho({
          empenhoId: 'e6', numero: '2024NE000600', ano: 2024, fontePago: 'TESOURO', saldo: 300, liquidadoAPagar: 100,
          restosAPagar: { naoProcessadoALiquidar: 200, naoProcessadoLiquidadoAPagar: 100, processadoAPagar: 0, pagoNoAno: 50 }
        }),
        empenho({
          empenhoId: 'e7', numero: '2023NE000700', ano: 2023, fontePago: 'TESOURO', saldo: 40, liquidadoAPagar: 40,
          restosAPagar: { naoProcessadoALiquidar: 0, naoProcessadoLiquidadoAPagar: 0, processadoAPagar: 40, pagoNoAno: 10 }
        })
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      leituras: []
    } as never);
    vi.mocked(authModule.useAuth).mockReturnValue({ role: 'admin' } as never);
  });

  it('segue a moldura da Carteira: segmentos de saldo, filtros em botão e linha clicável', () => {
    const html = render();
    // Coluna Itens: a situação do vínculo da nota aos itens (o trabalho fica no menu Vínculos).
    expect(html).toContain('A vincular');
    expect(html).toContain('Empenhos');
    expect(html).toContain('data-testid="empenhos-saldo-COM_SALDO"');
    expect(html).toMatch(/Com saldo<span[^>]*>6</);
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

  it('pago e saldo do Tesouro, com a soma das faturas quando difere e a data do Tesouro no topo', () => {
    const html = render();
    expect(html).toContain('Tesouro em 14/10/2026 14:55');
    // GM: Tesouro sem pagamento; faturas dizem 37,9 mi pagos
    expect(html).toContain('data-testid="empenhos-pago-faturas-2025NE000471"');
    expect(html).toMatch(/faturas: R\$\s?37\.861\.227,00/);
    expect(html).toMatch(/R\$\s?37\.861\.227,00 liquidado a pagar/);
    // empenho fora do Tesouro: avisa que o pago é o das faturas
    expect(html).toContain('pelas faturas');
  });

  it('restos a pagar: filtro, tipo na linha e resumo no topo', () => {
    const todos = render();
    expect(todos).toContain('data-testid="empenhos-filter-rp"');
    expect(todos).toContain('data-testid="empenhos-rp-2024NE000600"');
    expect(todos).toContain('resto a pagar não processado');
    expect(todos).toContain('resto a pagar processado');
    const rp = render('/empenhos?rp=RP');
    expect(rp).toContain('2024NE000600');
    expect(rp).toContain('2023NE000700');
    expect(rp).not.toContain('2026NE000027');
    expect(rp).toMatch(/R\$\s?340(,00)? em restos a pagar \(R\$\s?140(,00)? liquidados\) · R\$\s?60(,00)? pagos no ano/);
    const processados = render('/empenhos?rp=PROCESSADO');
    expect(processados).toContain('2023NE000700');
    expect(processados).not.toContain('2024NE000600');
    const sem = render('/empenhos?rp=SEM_RP');
    expect(sem).toContain('2026NE000027');
    expect(sem).not.toContain('2024NE000600');
    expect(sem).toMatch(/de saldo a pagar/);
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

  describe('uma leitura falha: a faixa avisa e o resto fica', () => {
    const falhou = () => ({ data: undefined, isError: true, error: new Error('canceling statement due to statement timeout'), refetch: vi.fn() });

    it('situação das notas nos itens não carregou: a faixa diz o quê e os segmentos de saldo ficam', () => {
      vi.mocked(vinculacaoModule.useSituacaoDistribuicaoPorEmpenho).mockReturnValue(falhou() as never);
      const html = render();
      expect(html).toContain('data-testid="empenhos-fontes-com-falha"');
      expect(html).toContain('Parte dos Empenhos não carregou');
      expect(html).toContain('<strong>Situação das notas nos itens (coluna Itens)</strong>');
      expect(html).toMatch(/Com saldo<span[^>]*>6</);
      expect(html).toMatch(/Sem saldo<span[^>]*>1</);
      expect(html).toContain('2026NE000027');
      vi.mocked(vinculacaoModule.useSituacaoDistribuicaoPorEmpenho).mockImplementation(() => situacaoPadrao() as never);
    });

    it('perfil gestor sem os contratos do recorte: "os empenhos não carregaram", e não "nenhum empenho"', () => {
      vi.mocked(authModule.useAuth).mockReturnValue({ role: 'gestor' } as never);
      vi.mocked(portfolioModule.useContractsPortfolio).mockReturnValueOnce({
        rows: [],
        isLoading: false,
        isLoadingScope: false,
        leiturasDosContratos: [{ rotulo: 'gestores das atas', query: falhou() }]
      } as never);
      const html = render('/empenhos?saldo=TODOS');
      expect(html).toContain('<strong>Gestores das atas</strong>');
      expect(html).toContain('data-testid="empenhos-nao-carregou"');
      expect(html).not.toContain('Nenhum empenho encontrado');
    });

    it('tudo carregou: sem faixa', () => {
      expect(render()).not.toContain('empenhos-fontes-com-falha');
    });
  });
});
