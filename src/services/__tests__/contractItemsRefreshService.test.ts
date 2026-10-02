import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: (t: string) => fromMock(t) } }));
vi.mock('../contractItemQuantitySyncService', () => ({ syncContractItemQuantity: vi.fn() }));
vi.mock('../itemContractEmpenhoService', () => ({ syncItemContractEmpenhos: vi.fn() }));

import { refreshLinkedItemsOfContract } from '../contractItemsRefreshService';
import { syncContractItemQuantity } from '../contractItemQuantitySyncService';
import { syncItemContractEmpenhos } from '../itemContractEmpenhoService';

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
    vi.mocked(syncItemContractEmpenhos).mockResolvedValue({ lidos: 1, sincronizados: 1, removidos: 0, pendentes: 1, ignorados: 0 });
  });

  it('atualiza quantidade e empenhos de cada item ligado e soma as pendências', async () => {
    mockTables(['00059/2025-200331-00001', '00059/2025-200331-00002']);
    const r = await refreshLinkedItemsOfContract(contract, KEY);
    expect(r).toEqual({ itens: 2, falhas: [], pendentes: 2 });
    expect(syncItemContractEmpenhos).toHaveBeenCalledWith(
      expect.objectContaining({ numeroAta: '00059/2025', uasg: '200331', numeroItem: '00001', unitPrice: 1394 })
    );
  });

  it('um item que falha não interrompe os outros', async () => {
    mockTables(['00059/2025-200331-00001', '00059/2025-200331-00002']);
    vi.mocked(syncContractItemQuantity).mockRejectedValueOnce(new Error('API fora do ar'));
    const r = await refreshLinkedItemsOfContract(contract, KEY);
    expect(r.itens).toBe(2);
    expect(r.falhas).toEqual([{ itemKey: '00059/2025-200331-00001', motivo: 'API fora do ar' }]);
    expect(r.pendentes).toBe(1);
  });

  it('contrato sem item ligado não chama a API', async () => {
    mockTables([]);
    const r = await refreshLinkedItemsOfContract(contract, KEY);
    expect(r).toEqual({ itens: 0, falhas: [], pendentes: 0 });
    expect(syncContractItemQuantity).not.toHaveBeenCalled();
  });
});
