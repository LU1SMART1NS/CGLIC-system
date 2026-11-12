import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUasgsDaUf } from '../api';

const pagina = (resultado: unknown[], totalPaginas: number) => ({ ok: true, status: 200, json: async () => ({ resultado, totalPaginas }) });
const semEspera = async () => {};

describe('fetchUasgsDaUf', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lê todas as páginas da UF, só as ativas, e ignora linha sem nome', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pagina([{ codigoUasg: '380148', nomeUasg: 'ESP-PENITENCIARIA ADRIANO MARREY DE GUARULHOS ', nomeMunicipioIbge: 'GUARULHOS', siglaUf: 'SP' }], 2))
      .mockResolvedValueOnce(pagina([{ codigoUasg: '180123', nomeUasg: 'ESP-ACADEMIA DE POLICIA', nomeMunicipioIbge: 'SÃO PAULO', siglaUf: 'SP' }, { codigoUasg: '999999', nomeUasg: ' ' }], 2));
    vi.stubGlobal('fetch', fetch);
    const lista = await fetchUasgsDaUf('SP', semEspera);
    expect(lista).toEqual([
      { uasg: '380148', nome: 'ESP-PENITENCIARIA ADRIANO MARREY DE GUARULHOS', municipio: 'GUARULHOS', uf: 'SP' },
      { uasg: '180123', nome: 'ESP-ACADEMIA DE POLICIA', municipio: 'SÃO PAULO', uf: 'SP' }
    ]);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      '/api-arp/modulo-uasg/1_consultarUasg?pagina=1&tamanhoPagina=500&siglaUf=SP&statusUasg=true',
      '/api-arp/modulo-uasg/1_consultarUasg?pagina=2&tamanhoPagina=500&siglaUf=SP&statusUasg=true'
    ]);
  });

  it('429 tenta de novo; se continuar falhando, lança em vez de devolver a lista pela metade', async () => {
    const limite = { ok: false, status: 429, json: async () => ({}) };
    const fetch = vi.fn().mockResolvedValueOnce(limite).mockResolvedValueOnce(pagina([{ codigoUasg: '180123', nomeUasg: 'A' }], 2)).mockResolvedValue(limite);
    vi.stubGlobal('fetch', fetch);
    await expect(fetchUasgsDaUf('SP', semEspera)).rejects.toThrow('O Compras.gov.br não respondeu agora');
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});
