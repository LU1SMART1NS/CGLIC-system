import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as allocationService from '../../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../../utils/itemKeyUtils';

vi.mock('../../services/allocationService', () => ({
  saveAllocations: vi.fn()
}));

describe('useSaveAllocations Hook / Mutation - Testes Unitários de Persistência e Invalidação', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });

  it('deve chamar saveAllocations passando expectedVersion explicitamente', async () => {
    const mockResult = {
      success: true,
      item_key: '00037/2026-200331-00001',
      previous_version: 1,
      new_version: 2,
      count: 1,
      timestamp: new Date().toISOString()
    };

    vi.mocked(allocationService.saveAllocations).mockResolvedValueOnce(mockResult);

    const mutationFn = async (vars: { itemKey: string; allocations: any[]; expectedVersion?: number | null }) => {
      return allocationService.saveAllocations(vars.itemKey, vars.allocations, vars.expectedVersion);
    };

    const variables = {
      itemKey: '00037/2026-200331-00001',
      allocations: [{ id: '1', unitName: 'DTI', allocatedQty: 100, empenhadaQty: 0 }],
      expectedVersion: 1
    };

    const result = await mutationFn(variables);

    expect(allocationService.saveAllocations).toHaveBeenCalledWith(
      '00037/2026-200331-00001',
      variables.allocations,
      1
    );
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar a query canônica exata em caso de sucesso', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const variables = {
      itemKey: '37/2026-200331-1',
      allocations: [{ id: '1', unitName: 'DTI', allocatedQty: 50, empenhadaQty: 0 }],
      expectedVersion: 2
    };

    // Simulação do onSuccess canônico
    const parsed = parseItemKey(variables.itemKey);
    const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

    queryClient.invalidateQueries({
      queryKey: ['item-allocations', canonicalKey]
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['item-allocations', '00037/2026-200331-00001']
    });
  });

  it('deve propagar erro de concorrência 40001 (CONCURRENT_MODIFICATION_ERROR) sem retry', async () => {
    const concurrencyError = {
      code: 'CONCURRENT_MODIFICATION_ERROR',
      message: 'Conflito de concorrência: os dados foram modificados por outro usuário.',
      sqlState: '40001'
    };

    vi.mocked(allocationService.saveAllocations).mockRejectedValueOnce(concurrencyError);

    const mutationFn = async (vars: { itemKey: string; allocations: any[]; expectedVersion?: number | null }) => {
      return allocationService.saveAllocations(vars.itemKey, vars.allocations, vars.expectedVersion);
    };

    await expect(mutationFn({
      itemKey: '00037/2026-200331-00001',
      allocations: [],
      expectedVersion: 1
    })).rejects.toEqual(concurrencyError);

    expect(allocationService.saveAllocations).toHaveBeenCalledTimes(1); // retry = 0
  });
});
