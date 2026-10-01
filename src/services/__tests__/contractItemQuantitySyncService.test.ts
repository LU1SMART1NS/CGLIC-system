import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  fetchContratosGovData: vi.fn(),
  fetchContratoItensComprasGov: vi.fn()
}));
vi.mock('../../adapters/arpContractLinkRpcAdapter', () => ({ syncContractItemQuantityRpc: vi.fn() }));

import * as api from '../api';
import * as rpcAdapter from '../../adapters/arpContractLinkRpcAdapter';
import { fetchContractItemDetails } from '../contractItemsService';
import { syncContractItemQuantity } from '../contractItemQuantitySyncService';

const contract = { uasg: '200331', numero: '001602026', ano: 2026, numeroControlePncp: undefined };

describe('fetchContractItemDetails', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lê quantidade e preço unitário dos itens do contrato (formato BR)', async () => {
    vi.mocked(api.fetchContratosGovData).mockResolvedValueOnce({
      contratoId: 928023,
      items: [{ numero_item_compra: '00001', quantidade: '400', valorunitario: '1.394,00' }]
    });
    const details = await fetchContractItemDetails(contract);
    expect(details.get(1)).toEqual({ quantidade: 400, valorUnitario: 1394 });
  });

  it('cai no Compras.gov quando o Contratos.gov não devolve itens', async () => {
    vi.mocked(api.fetchContratosGovData).mockResolvedValueOnce({ items: [] });
    vi.mocked(api.fetchContratoItensComprasGov).mockResolvedValueOnce([
      { numeroItem: '3', quantidadeItem: 60, valorUnitarioItem: 1394 } as any
    ]);
    const details = await fetchContractItemDetails({ ...contract, numeroControlePncp: '00394494000136-2-000126/2026' });
    expect(details.get(3)).toEqual({ quantidade: 60, valorUnitario: 1394 });
  });
});

describe('syncContractItemQuantity', () => {
  beforeEach(() => vi.clearAllMocks());

  const params = {
    numeroAta: '00059/2025',
    uasg: '200331',
    numeroItem: '1',
    contractKey: '200331-00160-2026',
    contract
  };

  it('grava a quantidade contratada do item lida da API no vínculo', async () => {
    vi.mocked(api.fetchContratosGovData).mockResolvedValueOnce({
      contratoId: 928023,
      items: [
        { numero_item_compra: '00001', quantidade: '400', valorunitario: '1.394,00' },
        { numero_item_compra: '00002', quantidade: '9', valorunitario: '10,00' }
      ]
    });
    vi.mocked(rpcAdapter.syncContractItemQuantityRpc).mockResolvedValueOnce({} as any);

    const result = await syncContractItemQuantity(params);

    expect(rpcAdapter.syncContractItemQuantityRpc).toHaveBeenCalledWith({
      itemKey: '00059/2025-200331-00001',
      contractKey: '200331-00160-2026',
      quantidade: 400,
      valorUnitario: 1394
    });
    expect(result).toEqual({ quantidade: 400, valorUnitario: 1394, listado: true });
  });

  it('registra nulo quando a API lista o contrato mas não lista o item', async () => {
    vi.mocked(api.fetchContratosGovData).mockResolvedValueOnce({
      contratoId: 1,
      items: [{ numero_item_compra: '00005', quantidade: '2', valorunitario: '1,00' }]
    });
    vi.mocked(rpcAdapter.syncContractItemQuantityRpc).mockResolvedValueOnce({} as any);

    const result = await syncContractItemQuantity(params);

    expect(rpcAdapter.syncContractItemQuantityRpc).toHaveBeenCalledWith(expect.objectContaining({ quantidade: null, valorUnitario: null }));
    expect(result.listado).toBe(false);
  });

  it('não marca como lido quando a API não devolve nenhum item', async () => {
    vi.mocked(api.fetchContratosGovData).mockResolvedValueOnce({ items: [] });
    vi.mocked(api.fetchContratoItensComprasGov).mockResolvedValueOnce([]);

    await expect(syncContractItemQuantity(params)).rejects.toThrow(/não retornou os itens/);
    expect(rpcAdapter.syncContractItemQuantityRpc).not.toHaveBeenCalled();
  });
});
