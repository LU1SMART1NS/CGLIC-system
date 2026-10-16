import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUnidadesItem, UnidadesItemIncompletasError } from '../api';

const orgao = (codigoUnidade: string, quantidadeRegistrada: number, codigoPdm = '13722') => ({
  numeroAta: '00071/2024', unidadeGerenciadora: '200331', numeroItem: '00027', codigoUnidade, fornecedor: 'F',
  quantidadeRegistrada, codigoPdm, dataHoraExclusao: null
});
const pagina = (resultado: unknown[], totalRegistros: number, paginasRestantes = 0) =>
  ({ ok: true, status: 200, json: async () => ({ resultado, totalRegistros, totalPaginas: 1, paginasRestantes }) });

function mockFetch(...respostas: unknown[]) {
  const fn = vi.fn();
  for (const r of respostas) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fetchUnidadesItem', () => {
  it('lê todas as páginas com 500 por página e tira as cópias repetidas', async () => {
    const f = mockFetch(
      pagina([orgao('200331', 30), orgao('450955', 2)], 4, 1),
      pagina([orgao('200331', 30, '485337'), orgao('450955', 2, '485337')], 4, 0)
    );
    const r = await fetchUnidadesItem('00071/2024', '200331', '27');
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0][0])).toContain('tamanhoPagina=500');
    expect(String(f.mock.calls[1][0])).toContain('pagina=2');
    expect(String(f.mock.calls[0][0])).toContain('numeroItem=00027');
    expect(r.resultado.map((u) => u.codigoUnidade)).toEqual(['200331', '450955']);
    expect(r.totalRegistros).toBe(2);
  });

  it('menos linhas que totalRegistros: vazio na tela, erro na sincronização', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch(pagina([orgao('200331', 30)], 80));
    expect((await fetchUnidadesItem('00071/2024', '200331', '27')).resultado).toEqual([]);
    mockFetch(pagina([orgao('200331', 30)], 80));
    await expect(fetchUnidadesItem('00071/2024', '200331', '27', { falharSeErro: true })).rejects.toBeInstanceOf(UnidadesItemIncompletasError);
  });

  it('cópias do mesmo órgão com quantidades diferentes: não devolve a lista', async () => {
    mockFetch(pagina([orgao('200331', 30), orgao('200331', 31)], 2));
    await expect(fetchUnidadesItem('00071/2024', '200331', '27', { falharSeErro: true })).rejects.toThrow(/valores diferentes \(200331\)/);
  });

  it('falha na segunda página: não devolve a primeira sozinha', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch(pagina([orgao('200331', 30)], 2, 1), { ok: false, status: 500, json: async () => ({}) });
    expect((await fetchUnidadesItem('00071/2024', '200331', '27')).resultado).toEqual([]);
    mockFetch(pagina([orgao('200331', 30)], 2, 1), { ok: false, status: 500, json: async () => ({}) });
    await expect(fetchUnidadesItem('00071/2024', '200331', '27', { falharSeErro: true })).rejects.toThrow('500');
  });

  it('API vazia continua devolvendo vazio sem erro', async () => {
    mockFetch(pagina([], 0));
    expect((await fetchUnidadesItem('00071/2024', '200331', '27', { falharSeErro: true })).resultado).toEqual([]);
  });
});
