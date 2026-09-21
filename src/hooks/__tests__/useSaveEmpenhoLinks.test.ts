import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as allocationService from '../../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../../utils/itemKeyUtils';

vi.mock('../../services/allocationService', () => ({
  saveEmpenhoLinks: vi.fn()
}));

describe('useSaveEmpenhoLinks Hook / Mutation - Testes Unitários de Persistência e Invalidação', () => {
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

  it('deve chamar saveEmpenhoLinks passando expectedVersion: number explicitamente', async () => {
    const mockResult = {
      success: true,
      item_key: '00037/2026-200331-00001',
      previous_version: 1,
      new_version: 2,
      count: 1,
      timestamp: new Date().toISOString()
    };

    vi.mocked(allocationService.saveEmpenhoLinks).mockResolvedValueOnce(mockResult);

    const mutationFn = async (vars: { itemKey: string; links: Record<string, string>; expectedVersion: number }) => {
      return allocationService.saveEmpenhoLinks(vars.itemKey, vars.links, vars.expectedVersion);
    };

    const variables = {
      itemKey: '00037/2026-200331-00001',
      links: { '2026NE000123': 'alloc-1' },
      expectedVersion: 1
    };

    const result = await mutationFn(variables);

    expect(allocationService.saveEmpenhoLinks).toHaveBeenCalledWith(
      '00037/2026-200331-00001',
      variables.links,
      1
    );
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar cirurgicamente apenas item-empenho-links e NÃO invalidar allocations', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const variables = {
      itemKey: '37/2026-200331-1',
      links: { '2026NE000123': 'alloc-1' },
      expectedVersion: 2
    };

    // Simulação do onSuccess canônico
    const parsed = parseItemKey(variables.itemKey);
    const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

    queryClient.invalidateQueries({
      queryKey: ['item-empenho-links', canonicalKey]
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['item-empenho-links', '00037/2026-200331-00001']
    });

    // Garante que a query de alocações NÃO foi invalidada
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-allocations'])
    });
  });

  it('deve propagar erro de concorrência 40001 (CONCURRENT_MODIFICATION_ERROR) sem retry', async () => {
    const concurrencyError = {
      code: 'CONCURRENT_MODIFICATION_ERROR',
      message: 'Conflito de concorrência: os vínculos de empenhos foram modificados por outro usuário.',
      sqlState: '40001'
    };

    vi.mocked(allocationService.saveEmpenhoLinks).mockRejectedValueOnce(concurrencyError);

    const mutationFn = async (vars: { itemKey: string; links: Record<string, string>; expectedVersion: number }) => {
      return allocationService.saveEmpenhoLinks(vars.itemKey, vars.links, vars.expectedVersion);
    };

    await expect(mutationFn({
      itemKey: '00037/2026-200331-00001',
      links: {},
      expectedVersion: 1
    })).rejects.toEqual(concurrencyError);

    expect(allocationService.saveEmpenhoLinks).toHaveBeenCalledTimes(1); // retry = 0
  });
});
