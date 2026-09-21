import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as departmentRpcAdapter from '../../adapters/departmentRpcAdapter';

vi.mock('../../adapters/departmentRpcAdapter', () => ({
  deleteDepartmentRpc: vi.fn()
}));

describe('useDeleteDepartment Hook / Mutation', () => {
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

  it('deve chamar deleteDepartmentRpc com os parâmetros corretos', async () => {
    const mockResult = {
      success: true,
      deleted: true,
      deactivated: false,
      id: 'dep-123',
      sigla: 'TEST',
      allocations_count: 0,
      message: 'Departamento excluído com sucesso.'
    };

    vi.mocked(departmentRpcAdapter.deleteDepartmentRpc).mockResolvedValueOnce(mockResult);

    const result = await departmentRpcAdapter.deleteDepartmentRpc('dep-123', false);

    expect(departmentRpcAdapter.deleteDepartmentRpc).toHaveBeenCalledWith('dep-123', false);
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar a query canônica internal-departments em caso de sucesso', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.invalidateQueries({
      queryKey: ['internal-departments']
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['internal-departments']
    });
  });

  it('deve propagar erro de violação de FK (CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS) sem retry', async () => {
    const fkError = {
      code: 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS',
      message: 'Esta unidade possui alocações vinculadas e não pode ser excluída.',
      sqlState: '23503'
    };

    vi.mocked(departmentRpcAdapter.deleteDepartmentRpc).mockRejectedValueOnce(fkError);

    await expect(
      departmentRpcAdapter.deleteDepartmentRpc('dep-dfnsp', false)
    ).rejects.toEqual(fkError);

    expect(departmentRpcAdapter.deleteDepartmentRpc).toHaveBeenCalledTimes(1);
  });
});
