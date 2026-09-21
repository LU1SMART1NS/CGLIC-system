import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as seiRpcAdapter from '../../adapters/seiRpcAdapter';

vi.mock('../../adapters/seiRpcAdapter', () => ({
  deleteProcessoSeiRpc: vi.fn()
}));

describe('useDeleteProcessoSei Hook / Mutation', () => {
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

  it('deve chamar deleteProcessoSeiRpc com os parâmetros corretos', async () => {
    const mockResult = {
      success: true,
      id: 'sei-123',
      numero_processo_sei: '10154.000123/2024-11',
      message: 'Processo SEI excluído com sucesso.'
    };

    vi.mocked(seiRpcAdapter.deleteProcessoSeiRpc).mockResolvedValueOnce(mockResult);

    const result = await seiRpcAdapter.deleteProcessoSeiRpc('sei-123');

    expect(seiRpcAdapter.deleteProcessoSeiRpc).toHaveBeenCalledWith('sei-123');
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar a query canônica processos-sei em caso de sucesso', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.invalidateQueries({
      queryKey: ['processos-sei']
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['processos-sei']
    });
  });

  it('deve propagar erro de PROCESS_SEI_NOT_FOUND sem retry', async () => {
    const notFoundError = {
      code: 'PROCESS_SEI_NOT_FOUND',
      message: 'Processo SEI não encontrado no sistema.',
      sqlState: 'P0002'
    };

    vi.mocked(seiRpcAdapter.deleteProcessoSeiRpc).mockRejectedValueOnce(notFoundError);

    await expect(
      seiRpcAdapter.deleteProcessoSeiRpc('sei-inexistente')
    ).rejects.toEqual(notFoundError);

    expect(seiRpcAdapter.deleteProcessoSeiRpc).toHaveBeenCalledTimes(1);
  });
});
