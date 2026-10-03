import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPncpAtaVigencia } from '../api';

const respostaPncp = {
  numeroAtaRegistroPreco: '00059',
  anoAta: 2025,
  dataVigenciaFim: '2026-10-10',
  cancelado: false,
  dataCancelamento: null,
  dataAtualizacao: '2026-09-23T09:22:58',
  dataPublicacaoPncp: '2025-10-09T10:45:06',
  possibilidadeAdesao: true,
  unidadeOrgao: { codigoUnidade: '200331', nomeUnidade: 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA' }
};

describe('fetchPncpAtaVigencia: dados da ata no PNCP', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lê divulgação, número, unidade e adesão da ata, além da vigência', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => respostaPncp });
    vi.stubGlobal('fetch', fetchMock);

    const info = await fetchPncpAtaVigencia('00394494000136-1-000916/2025-000001');

    expect(fetchMock.mock.calls[0][0]).toBe('/api-pncp/api/pncp/v1/orgaos/00394494000136/compras/2025/916/atas/1');
    expect(info).toMatchObject({
      dataVigenciaFim: '2026-10-10',
      cancelado: false,
      dataPublicacaoPncp: '2025-10-09T10:45:06',
      numeroAtaRegistroPreco: '00059',
      anoAta: 2025,
      codigoUnidade: '200331',
      possibilidadeAdesao: true
    });
  });

  it('possibilidadeAdesao ausente ou fora de booleano não vira "não aceita"', async () => {
    const { possibilidadeAdesao: _omitido, ...semAdesao } = respostaPncp;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => semAdesao }));
    expect((await fetchPncpAtaVigencia('00394494000136-1-000917/2025-000001'))?.possibilidadeAdesao).toBeUndefined();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...respostaPncp, possibilidadeAdesao: 'N/A' }) }));
    expect((await fetchPncpAtaVigencia('00394494000136-1-000918/2025-000001'))?.possibilidadeAdesao).toBeUndefined();
  });

  it('adesão falsa é "não aceita" de verdade', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...respostaPncp, possibilidadeAdesao: false }) }));
    expect((await fetchPncpAtaVigencia('00394494000136-1-000919/2025-000001'))?.possibilidadeAdesao).toBe(false);
  });

  it('Id inválido ou PNCP recusando devolve null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPncpAtaVigencia('id-invalido')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fetchPncpAtaVigencia('00394494000136-1-000920/2025-000001')).toBeNull();
  });
});
