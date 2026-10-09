import { afterEach, describe, it, expect, vi } from 'vitest';

// A leitura da vigência das atas de outros órgãos não pode gravar nada: em 09/10/2026 ela usava
// enrichArpsBatchWithPncpVigencia, que grava a lista em atas_registro_preco quando a vigência muda.
const { cacheArpsInDb } = vi.hoisted(() => ({ cacheArpsInDb: vi.fn(async () => true) }));
vi.mock('../dbCacheService', async (original) => ({ ...(await original<typeof import('../dbCacheService')>()), cacheArpsInDb }));

import { FONTES_PADRAO } from '../atasParticipacaoSyncService';
import type { ArpRecord } from '../../types';

const ata = (numero: string, controle: string, fim: string) =>
  ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: '200342', numeroControlePncpAta: controle, dataVigenciaFinal: fim } as ArpRecord);

afterEach(() => {
  vi.unstubAllGlobals();
  cacheArpsInDb.mockClear();
});

describe('vigência das atas de outros órgãos no PNCP', () => {
  it('aplica a prorrogação e o cancelamento do PNCP sem gravar nenhuma ata', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/atas/1')
        ? new Response(JSON.stringify({ dataVigenciaFim: '2027-10-06T00:00:00', cancelado: false }), { status: 200 })
        : new Response(JSON.stringify({ dataVigenciaFim: '2026-10-06T00:00:00', cancelado: true }), { status: 200 })));
    const r = await FONTES_PADRAO.vigenciasPncp([
      ata('00005/2025', '00394494000136-1-000918/2025-000001', '2026-10-06'),
      ata('00006/2025', '00394494000136-1-000918/2025-000002', '2026-10-06')
    ]);
    expect(r[0]).toMatchObject({ dataVigenciaFinal: '2027-10-06', prorrogadaPncp: true, isCanceladaPncp: false });
    expect(r[1]).toMatchObject({ dataVigenciaFinal: '2026-10-06', isCanceladaPncp: true });
    expect(cacheArpsInDb).not.toHaveBeenCalled();
  });

  it('PNCP fora do ar: a ata fica como veio do Compras.gov.br', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const original = ata('00010/2025', '00394494000136-1-000918/2025-000006', '2026-10-22');
    expect(await FONTES_PADRAO.vigenciasPncp([original])).toEqual([original]);
    expect(cacheArpsInDb).not.toHaveBeenCalled();
  });
});
