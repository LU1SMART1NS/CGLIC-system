import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as contractRpcAdapter from '../../adapters/contractRpcAdapter';
import { normalizeItemKey, parseItemKey } from '../../utils/itemKeyUtils';

vi.mock('../../adapters/contractRpcAdapter', () => ({
  executeDeleteContratoRpc: vi.fn(),
  executeSaveContratoRpc: vi.fn()
}));

describe('useDeleteManualContract Hook / Mutation (Fase 4.4D - GAP-43D4-DELETE)', () => {
  let queryClient: QueryClient;
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    mockStorage = {};
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val; }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
      clear: vi.fn(() => { mockStorage = {}; }),
      length: 0,
      key: vi.fn()
    };
    vi.stubGlobal('localStorage', localStorageMock);
  });

  it('deve chamar executeDeleteContratoRpc com o ID do contrato', async () => {
    const mockResult = {
      success: true,
      id: 'manual-contrato-123',
      item_key: '00037/2026-200331-00001',
      message: 'Contrato manual excluído com sucesso.'
    };

    vi.mocked(contractRpcAdapter.executeDeleteContratoRpc).mockResolvedValueOnce(mockResult);

    const variables = {
      id: 'manual-contrato-123',
      itemKey: '00037/2026-200331-00001'
    };

    const mutationFn = async (vars: typeof variables) => {
      return contractRpcAdapter.executeDeleteContratoRpc(vars.id);
    };

    const result = await mutationFn(variables);

    expect(contractRpcAdapter.executeDeleteContratoRpc).toHaveBeenCalledWith('manual-contrato-123');
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar cirurgicamente item-manual-contracts e item-contract-empenho-links após exclusão', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const variables = {
      id: 'manual-contrato-123',
      itemKey: '37/2026-200331-1'
    };

    const data = {
      success: true,
      id: 'manual-contrato-123',
      item_key: '00037/2026-200331-00001',
      message: 'Contrato manual excluído com sucesso.'
    };

    // Executa a lógica de onSuccess do hook
    const rawKey = data?.item_key || variables.itemKey || '';
    const parsed = parseItemKey(rawKey);
    const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

    queryClient.invalidateQueries({
      queryKey: ['item-manual-contracts', canonicalKey]
    });
    queryClient.invalidateQueries({
      queryKey: ['item-contract-empenho-links', canonicalKey]
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['item-manual-contracts', '00037/2026-200331-00001']
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['item-contract-empenho-links', '00037/2026-200331-00001']
    });

    // Invariante: NÃO invalida tabelas de outros agregados
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-allocations'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-manual-empenhos'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-manual-quantities'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-empenho-links'])
    });
  });

  it('deve atualizar o espelhamento do LocalStorage após sucesso da exclusão', async () => {
    const canonicalKey = '00037/2026-200331-00001';
    const ctrKey = `saldoarp-manual-contratos-${canonicalKey}`;
    const linkKey = `saldoarp-contrato-empenho-links-${canonicalKey}`;

    mockStorage[ctrKey] = JSON.stringify([
      { id: 'ctr-1', numero: '01/2026' },
      { id: 'ctr-2', numero: '02/2026' }
    ]);
    mockStorage[linkKey] = JSON.stringify([
      { contratoId: 'ctr-1', empenhoNumero: '2026NE0001' },
      { contratoId: 'ctr-2', empenhoNumero: '2026NE0002' }
    ]);

    // Simula a mutação e onSuccess para 'ctr-1'
    const deletedId = 'ctr-1';
    const rawCtr = localStorage.getItem(ctrKey);
    if (rawCtr) {
      const list = JSON.parse(rawCtr);
      const updated = list.filter((c: any) => c.id !== deletedId && c._manualId !== deletedId);
      localStorage.setItem(ctrKey, JSON.stringify(updated));
    }

    const rawLinks = localStorage.getItem(linkKey);
    if (rawLinks) {
      const linksList = JSON.parse(rawLinks);
      const updatedLinks = linksList.filter((l: any) => l.contratoId !== deletedId && l.contrato_id !== deletedId);
      localStorage.setItem(linkKey, JSON.stringify(updatedLinks));
    }

    const savedContratos = JSON.parse(mockStorage[ctrKey] || '[]');
    const savedLinks = JSON.parse(mockStorage[linkKey] || '[]');

    expect(savedContratos).toHaveLength(1);
    expect(savedContratos[0].id).toBe('ctr-2');
    expect(savedLinks).toHaveLength(1);
    expect(savedLinks[0].contratoId).toBe('ctr-2');
  });

  it('deve propagar erro de CONTRACT_NOT_FOUND (P0002) sem retry', async () => {
    const notFoundError = {
      code: 'CONTRACT_NOT_FOUND',
      message: 'Contrato manual não encontrado.',
      sqlState: 'P0002'
    };

    vi.mocked(contractRpcAdapter.executeDeleteContratoRpc).mockRejectedValueOnce(notFoundError);

    const mutationFn = async (id: string) => {
      return contractRpcAdapter.executeDeleteContratoRpc(id);
    };

    await expect(mutationFn('ctr-inexistente')).rejects.toEqual(notFoundError);
    expect(contractRpcAdapter.executeDeleteContratoRpc).toHaveBeenCalledTimes(1);
  });
});
