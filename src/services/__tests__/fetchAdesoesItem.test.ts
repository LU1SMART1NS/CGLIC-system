import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAdesoesItem } from '../api';

const ok = (resultado: unknown[]) => ({ ok: true, status: 200, json: async () => ({ resultado, totalRegistros: resultado.length, paginasRestantes: 0 }) });
const falha = (status = 500) => ({ ok: false, status, json: async () => ({}) });

describe('fetchAdesoesItem', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sem opção: falha da API vira lista vazia (comportamento da tela)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => falha()));
    await expect(fetchAdesoesItem('00036/2024', '200331', '00002')).resolves.toMatchObject({ resultado: [] });
  });

  it('falharSeErro: erro HTTP e falha de rede lançam, para a sincronização não gravar "sem adesões"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => falha(503)));
    await expect(fetchAdesoesItem('00036/2024', '200331', '00002', { falharSeErro: true })).rejects.toThrow('503');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchAdesoesItem('00036/2024', '200331', '00002', { falharSeErro: true })).rejects.toThrow('Failed to fetch');
  });

  it('falharSeErro: resposta vazia com sucesso é "sem adesões" de verdade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok([])));
    await expect(fetchAdesoesItem('00036/2024', '200331', '00002', { falharSeErro: true })).resolves.toMatchObject({ resultado: [] });
  });

  it('item sem zeros: se o formato com zeros falhar e o sem zeros responder, vale a segunda resposta', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(falha(404))
      .mockResolvedValueOnce(ok([{ unidadeNaoParticipante: '929777 - X' }]));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchAdesoesItem('00036/2024', '200331', '2', { falharSeErro: true });
    expect(r.resultado).toHaveLength(1);
  });
});
