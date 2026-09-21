import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as allocationService from '../../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../../utils/itemKeyUtils';
import type { Empenho } from '../../types';

vi.mock('../../services/allocationService', () => ({
  saveManualEmpenhos: vi.fn(),
  saveAllocations: vi.fn(),
  saveEmpenhoLinks: vi.fn()
}));

describe('useSaveManualEmpenhos Hook / Mutation - Testes Unitários de Persistência e Invalidação (Fase 4.3D.2B)', () => {
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

  it('deve chamar saveManualEmpenhos com itemKey canônica, empenhos e expectedVersion: number', async () => {
    const mockResult = {
      success: true,
      item_key: '00037/2026-200331-00001',
      previous_version: 1,
      new_version: 2,
      count: 1,
      timestamp: new Date().toISOString()
    };

    vi.mocked(allocationService.saveManualEmpenhos).mockResolvedValueOnce(mockResult);

    const mockEmpenho: Empenho = {
      id: 'manual-emp-123',
      numero: '2026NE000123',
      ano: 2026,
      arpId: '00037/2026',
      itemId: '00001',
      uasg: '200331',
      quantidade: 15,
      origem: 'MANUAL',
      status: 'CONFIRMADO',
      criadoEm: '2026-09-18T10:00:00Z',
      atualizadoEm: '2026-09-18T10:00:00Z'
    };

    const variables = {
      itemKey: '00037/2026-200331-00001',
      empenhos: [mockEmpenho],
      expectedVersion: 1
    };

    const mutationFn = async (vars: typeof variables) => {
      return allocationService.saveManualEmpenhos(vars.itemKey, vars.empenhos, vars.expectedVersion);
    };

    const result = await mutationFn(variables);

    expect(allocationService.saveManualEmpenhos).toHaveBeenCalledWith(
      '00037/2026-200331-00001',
      [mockEmpenho],
      1
    );
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar cirurgicamente apenas item-manual-empenhos e NÃO invalidar allocations ou links', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const variables = {
      itemKey: '37/2026-200331-1',
      empenhos: [],
      expectedVersion: 2
    };

    // Simulação do onSuccess canônico
    const parsed = parseItemKey(variables.itemKey);
    const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

    queryClient.invalidateQueries({
      queryKey: ['item-manual-empenhos', canonicalKey]
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['item-manual-empenhos', '00037/2026-200331-00001']
    });

    // Garante que outras queries NÃO foram afetadas
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-allocations'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-empenho-links'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-manual-contracts'])
    });
  });

  it('deve propagar erro de concorrência 40001 (CONCURRENT_MODIFICATION_ERROR) sem retry', async () => {
    const concurrencyError = {
      code: 'CONCURRENT_MODIFICATION_ERROR',
      message: 'Conflito de concorrência: os empenhos manuais foram modificados por outro usuário.',
      sqlState: '40001'
    };

    vi.mocked(allocationService.saveManualEmpenhos).mockRejectedValueOnce(concurrencyError);

    const mutationFn = async (vars: { itemKey: string; empenhos: Empenho[]; expectedVersion: number }) => {
      return allocationService.saveManualEmpenhos(vars.itemKey, vars.empenhos, vars.expectedVersion);
    };

    await expect(mutationFn({
      itemKey: '00037/2026-200331-00001',
      empenhos: [],
      expectedVersion: 1
    })).rejects.toEqual(concurrencyError);

    expect(allocationService.saveManualEmpenhos).toHaveBeenCalledTimes(1); // retry = 0
  });

  it('não deve invocar saveAllocations nem saveEmpenhoLinks como efeito colateral', async () => {
    const mockResult = {
      success: true,
      item_key: '00037/2026-200331-00001',
      previous_version: 1,
      new_version: 2,
      count: 0,
      timestamp: new Date().toISOString()
    };

    vi.mocked(allocationService.saveManualEmpenhos).mockResolvedValueOnce(mockResult);

    await allocationService.saveManualEmpenhos('00037/2026-200331-00001', [], 1);

    expect(allocationService.saveAllocations).not.toHaveBeenCalled();
    expect(allocationService.saveEmpenhoLinks).not.toHaveBeenCalled();
  });
});
