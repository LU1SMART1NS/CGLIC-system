import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@tanstack/react-query', async (orig) => ({ ...(await orig<typeof import('@tanstack/react-query')>()), useQuery: vi.fn() }));
vi.mock('../../../hooks/useSincronizacaoEmpenhosContrato', () => ({ useSincronizacaoEmpenhosContrato: vi.fn() }));
import { useQuery } from '@tanstack/react-query';
import { useSincronizacaoEmpenhosContrato } from '../../../hooks/useSincronizacaoEmpenhosContrato';
import { ContractFaturasSection } from '../ContractFaturasSection';

const f = (over: any = {}) => ({
  idFatura: 1, numero: '131503', referencia: '12/2019', emissao: '2019-12-30', valor: 663.38, glosa: 0,
  dataLiquidacao: '2025-10-10', situacao: 'Siafi Apropriado', cancelada: false, np: '2025NP000545',
  ordensBancarias: '2025OB088173', obEmissao: '2025-10-14', paga: true, npContratos: 1,
  empenhos: '2022NE000245', empenhosSemVinculo: 0, empenhosSemVinculoNumeros: null, ...over
});
const resumo = { faturas: 2, valorFaturado: 1663.38, valorLiquidado: 1663.38, valorPago: 663.38, liquidadasSemPagamento: 1, faturasComNeSemVinculo: 0, ultimaLiquidacao: '2025-10-10', ultimoPagamento: '2025-10-14' };
const render = () => renderToStaticMarkup(<ContractFaturasSection contractKey="200331-00021-2017" />);
const dados = (data: any) => vi.mocked(useQuery).mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() } as any);

const empenhos = (sync: any, isLoading = false) =>
  vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({ data: sync, isLoading } as any);
const consultados = { situacao: 'OK', ultimoSucessoEm: '2026-10-06T19:50:00Z', tentativaEm: '2026-10-06T19:50:00Z' };

describe('ContractFaturasSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    empenhos(consultados);
  });

  it('nunca consultadas: diz que ainda não foram consultadas', () => {
    dados({ faturas: [], resumo: null, sincronizadoEm: null });
    expect(render()).toContain('ainda não foram consultadas');
  });

  it('consultadas e sem fatura: diz que a fonte não tem', () => {
    dados({ faturas: [], resumo: null, sincronizadoEm: '2026-10-06T20:22:00Z' });
    expect(render()).toContain('O Contratos.gov.br não tem fatura para este contrato');
  });

  it('mostra resumo, etapa, NP e OB; fatura liquidada sem OB aparece aguardando', () => {
    dados({ faturas: [f(), f({ idFatura: 2, numero: '131600', valor: 1000, paga: false, ordensBancarias: null, obEmissao: null, np: '2025NP000600' })], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    const html = render();
    expect(html).toContain('contract-faturas-resumo');
    expect(html).toContain('Liquidadas aguardando OB');
    expect(html).toContain('Paga');
    expect(html).toContain('Liquidada');
    expect(html).toContain('2025OB088173');
    expect(html).toContain('aguardando');
    expect(html).toContain('não o valor da OB');
  });

  it('NP que paga outros contratos e NE citada sem vínculo são avisadas', () => {
    dados({ faturas: [f({ npContratos: 3, empenhosSemVinculo: 1, empenhosSemVinculoNumeros: '2023NE000280' })], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    const html = render();
    expect(html).toContain('paga também outros 2 contrato(s)');
    expect(html).toContain('contract-faturas-ne-sem-vinculo');
    expect(html).toContain('2023NE000280');
    expect(html).toContain('1 fatura(s) deste contrato estão nesse caso');
  });

  const comNeSemVinculo = () => dados({ faturas: [f({ empenhosSemVinculo: 1, empenhosSemVinculoNumeros: '2023NE000280' })], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });

  it('empenhos do contrato nunca consultados: não acusa NE sem vínculo, diz que a conferência espera a consulta', () => {
    comNeSemVinculo();
    empenhos(null);
    const html = render();
    expect(html).not.toContain('contract-faturas-ne-sem-vinculo');
    expect(html).toContain('contract-faturas-empenhos-nao-consultados');
    expect(html).toContain('ainda não foram consultados');
  });

  it('só tentativas com falha, nenhum sucesso: também não acusa', () => {
    comNeSemVinculo();
    empenhos({ situacao: 'ERRO', ultimoSucessoEm: null, tentativaEm: '2026-10-06T19:50:00Z' });
    const html = render();
    expect(html).not.toContain('contract-faturas-ne-sem-vinculo');
    expect(html).toContain('contract-faturas-empenhos-nao-consultados');
  });

  it('enquanto a situação dos empenhos carrega, não mostra nenhum dos dois avisos', () => {
    comNeSemVinculo();
    empenhos(undefined, true);
    const html = render();
    expect(html).not.toContain('contract-faturas-ne-sem-vinculo');
    expect(html).not.toContain('contract-faturas-empenhos-nao-consultados');
  });

  it('sem NE sem vínculo, não mostra o aviso de empenhos não consultados', () => {
    dados({ faturas: [f()], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    empenhos(null);
    expect(render()).not.toContain('contract-faturas-empenhos-nao-consultados');
  });
});

