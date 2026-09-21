import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as departmentRpcAdapter from '../../adapters/departmentRpcAdapter';

vi.mock('../../adapters/departmentRpcAdapter', () => ({
  mergeDepartmentAllocationsRpc: vi.fn()
}));

describe('useMergeDepartment Hook / Mutation', () => {
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

  it('deve chamar mergeDepartmentAllocationsRpc com parâmetros corretos', async () => {
    const mockResult = {
      success: true,
      old_name: 'DFNSPdddd',
      target_sigla: 'DFNSP',
      rows_updated: 3,
      timestamp: '2026-09-18T12:00:00Z'
    };

    vi.mocked(departmentRpcAdapter.mergeDepartmentAllocationsRpc).mockResolvedValueOnce(mockResult);

    const result = await departmentRpcAdapter.mergeDepartmentAllocationsRpc('DFNSPdddd', 'DFNSP');

    expect(departmentRpcAdapter.mergeDepartmentAllocationsRpc).toHaveBeenCalledWith('DFNSPdddd', 'DFNSP');
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar as queries afetadas em caso de sucesso', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.invalidateQueries({ queryKey: ['internal-departments'] });
    queryClient.invalidateQueries({ queryKey: ['item-allocations'] });
    queryClient.invalidateQueries({ queryKey: ['item-empenho-links'] });
    queryClient.invalidateQueries({ queryKey: ['item-unidades'] });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['internal-departments'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['item-allocations'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['item-empenho-links'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['item-unidades'] });
  });

  it('deve propagar erro TARGET_DEPARTMENT_INACTIVE sem retry', async () => {
    const inactiveError = {
      code: 'TARGET_DEPARTMENT_INACTIVE',
      message: 'A unidade de destino para mesclagem está inativa no sistema.',
      sqlState: '22023'
    };

    vi.mocked(departmentRpcAdapter.mergeDepartmentAllocationsRpc).mockRejectedValueOnce(inactiveError);

    await expect(
      departmentRpcAdapter.mergeDepartmentAllocationsRpc('Old', 'INACTIVE')
    ).rejects.toEqual(inactiveError);

    expect(departmentRpcAdapter.mergeDepartmentAllocationsRpc).toHaveBeenCalledTimes(1);
  });
});
