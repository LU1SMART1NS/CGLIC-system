import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: (t: string) => fromMock(t) } }));
vi.mock('../contractItemQuantitySyncService', () => ({ syncContractItemQuantity: vi.fn() }));

import { refreshLinkedItemsOfContract } from '../contractItemsRefreshService';
import { syncContractItemQuantity } from '../contractItemQuantitySyncService';

const contract = { id: '200331-00230-2026', uasg: '200331', numero: '00230', ano: 2026, numeroControlePncp: 'x', contratoId: 944866 } as any;
const KEY = '200331-00230-2026';

function mockTables(linkedKeys: string[]) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'arp_item_contract_links') {
      return { select: () => ({ eq: () => Promise.resolve({ data: linkedKeys.map((item_key) => ({ item_key })), error: null }) }) };
    }
    return { select: () => ({ in: () => Promise.resolve({ data: linkedKeys.map((item_key) => ({ item_key, valor_unitario: 1500 })), error: null }) }) };
  });
}

describe('refreshLinkedItemsOfContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncContractItemQuantity).mockResolvedValue({ quantidade: 2, valorUnitario: 1394, listado: true });
  });

  it('relê a quantidade de cada item ligado (o empenho do item vem do vínculo das notas aos itens)', async () => {
    mockTables(['00059/2025-200331-00001', '00059/2025-200331-00002']);
    const r = await refreshLinkedItemsOfContract(contract, KEY);
    expect(r).toEqual({ itens: 2, falhas: [] });
    expect(syncContractItemQuantity).toHaveBeenCalledTimes(2);
  });

  it('um item que falha não interrompe os outros', async () => {
    mockTables(['00059/2025-200331-00001', '00059/2025-200331-00002']);
    vi.mocked(syncContractItemQuantity).mockRejectedValueOnce(new Error('API fora do ar'));
    const r = await refreshLinkedItemsOfContract(contract, KEY);
    expect(r.itens).toBe(2);
    expect(r.falhas).toEqual([{ itemKey: '00059/2025-200331-00001', motivo: 'API fora do ar' }]);
  });

  it('contrato sem item ligado não chama a API', async () => {
    mockTables([]);
    const r = await refreshLinkedItemsOfContract(contract, KEY);
    expect(r).toEqual({ itens: 0, falhas: [] });
    expect(syncContractItemQuantity).not.toHaveBeenCalled();
  });
});
