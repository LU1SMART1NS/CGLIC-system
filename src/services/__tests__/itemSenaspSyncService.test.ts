import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({ fetchUnidadesItem: vi.fn() }));
vi.mock('../../adapters/arpContractLinkRpcAdapter', () => ({ syncItemSenaspQuantityRpc: vi.fn() }));

import * as api from '../api';
import * as rpc from '../../adapters/arpContractLinkRpcAdapter';
import { syncItemSenaspQuantity } from '../itemSenaspSyncService';

const params = { numeroAta: '00037/2026', uasg: '200331', numeroItem: '1' };
const resp = (resultado: any[]) => ({ resultado, totalRegistros: resultado.length, totalPaginas: 1, paginasRestantes: 0 });

describe('syncItemSenaspQuantity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grava a soma das unidades 200330 e 200331, sem os demais órgãos', async () => {
    vi.mocked(api.fetchUnidadesItem).mockResolvedValueOnce(resp([
      { codigoUnidade: '200331', tipoUnidade: 'GERENCIADORA', quantidadeRegistrada: 801 },
      { codigoUnidade: '200330', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 100 },
      { codigoUnidade: '200109', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 70 }
    ]) as any);
    vi.mocked(rpc.syncItemSenaspQuantityRpc).mockResolvedValueOnce({} as any);

    const r = await syncItemSenaspQuantity(params);

    expect(r.quantidade).toBe(901);
    expect(rpc.syncItemSenaspQuantityRpc).toHaveBeenCalledWith({ itemKey: '00037/2026-200331-00001', quantidade: 901 });
  });

  it('não grava quando a API não traz unidades SENASP', async () => {
    vi.mocked(api.fetchUnidadesItem).mockResolvedValueOnce(resp([]) as any);
    expect((await syncItemSenaspQuantity(params)).quantidade).toBeNull();
    expect(rpc.syncItemSenaspQuantityRpc).not.toHaveBeenCalled();
  });
});
