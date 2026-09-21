import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as departmentRpcAdapter from '../../adapters/departmentRpcAdapter';

vi.mock('../../adapters/departmentRpcAdapter', () => ({
  saveDepartmentRpc: vi.fn()
}));

describe('useSaveDepartment Hook / Mutation', () => {
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

  it('deve chamar saveDepartmentRpc com os parâmetros corretos', async () => {
    const mockResult = {
      success: true,
      department: {
        id: 'dep-dfnsp',
        sigla: 'DFNSP',
        nome_completo: 'Diretoria da Força Nacional',
        descricao: null,
        ativo: true,
        created_at: '2026-09-18T12:00:00Z',
        updated_at: '2026-09-18T12:00:00Z'
      }
    };

    vi.mocked(departmentRpcAdapter.saveDepartmentRpc).mockResolvedValueOnce(mockResult);

    const input = {
      sigla: 'DFNSP',
      nomeCompleto: 'Diretoria da Força Nacional'
    };

    const result = await departmentRpcAdapter.saveDepartmentRpc(input);

    expect(departmentRpcAdapter.saveDepartmentRpc).toHaveBeenCalledWith(input);
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

  it('deve propagar erro de DUPLICATE_DEPARTMENT sem retry', async () => {
    const duplicateError = {
      code: 'DUPLICATE_DEPARTMENT',
      message: 'Já existe uma unidade cadastrada com esta sigla.',
      sqlState: '23505'
    };

    vi.mocked(departmentRpcAdapter.saveDepartmentRpc).mockRejectedValueOnce(duplicateError);

    await expect(
      departmentRpcAdapter.saveDepartmentRpc({ sigla: 'DFNSP', nomeCompleto: 'Força' })
    ).rejects.toEqual(duplicateError);

    expect(departmentRpcAdapter.saveDepartmentRpc).toHaveBeenCalledTimes(1);
  });
});
