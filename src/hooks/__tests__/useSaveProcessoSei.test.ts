import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as seiRpcAdapter from '../../adapters/seiRpcAdapter';

vi.mock('../../adapters/seiRpcAdapter', () => ({
  saveProcessoSeiRpc: vi.fn()
}));

describe('useSaveProcessoSei Hook / Mutation', () => {
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

  it('deve chamar saveProcessoSeiRpc com os parâmetros corretos', async () => {
    const mockResult = {
      success: true,
      processo: {
        id: 'sei-123',
        numero_processo_sei: '10154.000123/2024-11',
        descricao_objeto: 'Teste',
        unidade_requisitante: 'SENASP',
        responsavel_nome: 'Cap. Oliveira',
        status_processo: 'Em Instrução',
        created_at: '2026-09-18T12:00:00Z',
        updated_at: '2026-09-18T12:00:00Z'
      }
    };

    vi.mocked(seiRpcAdapter.saveProcessoSeiRpc).mockResolvedValueOnce(mockResult);

    const input = {
      numeroProcessoSei: '10154.000123/2024-11',
      descricaoObjeto: 'Teste'
    };

    const result = await seiRpcAdapter.saveProcessoSeiRpc(input);

    expect(seiRpcAdapter.saveProcessoSeiRpc).toHaveBeenCalledWith(input);
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

  it('deve propagar erro de DUPLICATE_PROCESS_SEI sem retry', async () => {
    const duplicateError = {
      code: 'DUPLICATE_PROCESS_SEI',
      message: 'Já existe um processo SEI cadastrado com este número.',
      sqlState: '23505'
    };

    vi.mocked(seiRpcAdapter.saveProcessoSeiRpc).mockRejectedValueOnce(duplicateError);

    await expect(
      seiRpcAdapter.saveProcessoSeiRpc({ numeroProcessoSei: '10154.000123/2024-11' })
    ).rejects.toEqual(duplicateError);

    expect(seiRpcAdapter.saveProcessoSeiRpc).toHaveBeenCalledTimes(1);
  });
});
