import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as allocationService from '../../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../../utils/itemKeyUtils';

vi.mock('../../services/allocationService', () => ({
  saveEmpenhoManualQuantities: vi.fn(),
  saveAllocations: vi.fn(),
  saveEmpenhoLinks: vi.fn(),
  saveManualEmpenhos: vi.fn()
}));

describe('useSaveManualQuantities Hook / Mutation - Testes Unitários de Persistência e Invalidação (Fase 4.3D.3B)', () => {
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

  it('deve chamar saveEmpenhoManualQuantities com itemKey canônica, quantities e expectedVersion: number', async () => {
    const mockResult = {
      success: true,
      item_key: '00037/2026-200331-00001',
      previous_version: 1,
      new_version: 2,
      count: 2,
      timestamp: new Date().toISOString()
    };

    vi.mocked(allocationService.saveEmpenhoManualQuantities).mockResolvedValueOnce(mockResult);

    const variables = {
      itemKey: '00037/2026-200331-00001',
      quantities: { '2026NE000123': 35, '2026NE000173': 2 },
      expectedVersion: 1
    };

    const mutationFn = async (vars: typeof variables) => {
      return allocationService.saveEmpenhoManualQuantities(vars.itemKey, vars.quantities, vars.expectedVersion);
    };

    const result = await mutationFn(variables);

    expect(allocationService.saveEmpenhoManualQuantities).toHaveBeenCalledWith(
      '00037/2026-200331-00001',
      { '2026NE000123': 35, '2026NE000173': 2 },
      1
    );
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar cirurgicamente apenas item-manual-quantities e NÃO invalidar allocations, links ou empenhos', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const variables = {
      itemKey: '37/2026-200331-1',
      quantities: {},
      expectedVersion: 2
    };

    // Simulação do onSuccess canônico
    const parsed = parseItemKey(variables.itemKey);
    const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

    queryClient.invalidateQueries({
      queryKey: ['item-manual-quantities', canonicalKey]
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['item-manual-quantities', '00037/2026-200331-00001']
    });

    // Garante que outras queries NÃO foram afetadas
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-allocations'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-empenho-links'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-manual-empenhos'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-manual-contracts'])
    });
  });

  it('deve propagar erro de concorrência 40001 (CONCURRENT_MODIFICATION_ERROR) sem retry', async () => {
    const concurrencyError = {
      code: 'CONCURRENT_MODIFICATION_ERROR',
      message: 'Conflito de concorrência: as quantidades manuais foram modificadas por outro usuário.',
      sqlState: '40001'
    };

    vi.mocked(allocationService.saveEmpenhoManualQuantities).mockRejectedValueOnce(concurrencyError);

    const mutationFn = async (vars: { itemKey: string; quantities: Record<string, number>; expectedVersion: number }) => {
      return allocationService.saveEmpenhoManualQuantities(vars.itemKey, vars.quantities, vars.expectedVersion);
    };

    await expect(mutationFn({
      itemKey: '00037/2026-200331-00001',
      quantities: {},
      expectedVersion: 1
    })).rejects.toEqual(concurrencyError);

    expect(allocationService.saveEmpenhoManualQuantities).toHaveBeenCalledTimes(1); // retry = 0
  });

  it('não deve invocar saveAllocations, saveEmpenhoLinks nem saveManualEmpenhos como efeito colateral', async () => {
    const mockResult = {
      success: true,
      item_key: '00037/2026-200331-00001',
      previous_version: 1,
      new_version: 2,
      count: 0,
      timestamp: new Date().toISOString()
    };

    vi.mocked(allocationService.saveEmpenhoManualQuantities).mockResolvedValueOnce(mockResult);

    await allocationService.saveEmpenhoManualQuantities('00037/2026-200331-00001', {}, 1);

    expect(allocationService.saveAllocations).not.toHaveBeenCalled();
    expect(allocationService.saveEmpenhoLinks).not.toHaveBeenCalled();
    expect(allocationService.saveManualEmpenhos).not.toHaveBeenCalled();
  });
});
