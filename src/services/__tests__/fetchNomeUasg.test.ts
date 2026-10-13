import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNomeUasg } from '../api';

const resposta = (resultado: unknown[], ok = true) => ({ ok, json: async () => ({ resultado }) }) as Response;

describe('fetchNomeUasg', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('traz o nome da UASG ativa (resposta real de 13/10/2026, UASG 462492)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta([{ codigoUasg: '462492', nomeUasg: 'CORPO DE BOMBEIROS MILITAR DE RORAIMA/RR', siglaUf: 'RR' }]));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchNomeUasg('462492')).toEqual({ situacao: 'achou', nome: 'CORPO DE BOMBEIROS MILITAR DE RORAIMA/RR', uf: 'RR' });
    expect(fetchMock).toHaveBeenCalledWith('/api-arp/modulo-uasg/1_consultarUasg?codigoUasg=462492&statusUasg=true');
  });

  it('procura entre as inativas quando não está entre as ativas', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(resposta([]))
      .mockResolvedValueOnce(resposta([{ nomeUasg: 'ÓRGÃO EXTINTO', siglaUf: null }]));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchNomeUasg('123456')).toEqual({ situacao: 'achou', nome: 'ÓRGÃO EXTINTO', uf: null });
    expect(fetchMock).toHaveBeenLastCalledWith('/api-arp/modulo-uasg/1_consultarUasg?codigoUasg=123456&statusUasg=false');
  });

  it('separa "não encontrada" de "a fonte falhou"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta([])));
    expect(await fetchNomeUasg('999999')).toEqual({ situacao: 'nao-encontrada' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta([], false)));
    expect(await fetchNomeUasg('999999')).toEqual({ situacao: 'falhou' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await fetchNomeUasg('999999')).toEqual({ situacao: 'falhou' });
  });
});
