import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as rpcAdapter from '../../adapters/ataManagementRpcAdapter';
import type { AtaTaskTemplateMacrotaskInput } from '../../adapters/ataManagementRpcAdapter';

vi.mock('../../adapters/ataManagementRpcAdapter', () => ({
  saveAtaTaskTemplateMacrotaskRpc: vi.fn(),
  deleteAtaTaskTemplateMacrotaskRpc: vi.fn(),
  saveAtaTaskTemplateTaskRpc: vi.fn(),
  deleteAtaTaskTemplateTaskRpc: vi.fn()
}));

describe('useSaveAtaTaskTemplateMacrotask Hook - Testes Unitários de Persistência e Invalidação', () => {
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

  it('deve chamar saveAtaTaskTemplateMacrotaskRpc com os parâmetros corretos', async () => {
    const mockResult = {
      success: true,
      macrotask: {
        id: 'atatplmt-12345',
        template_id: 'atatpl-teste',
        nome: 'Planejamento de Prorrogação',
        ordem: 0
      }
    };

    vi.mocked(rpcAdapter.saveAtaTaskTemplateMacrotaskRpc).mockResolvedValueOnce(mockResult);

    const input: AtaTaskTemplateMacrotaskInput = {
      templateId: 'atatpl-teste',
      nome: 'Planejamento de Prorrogação',
      ordem: 0
    };

    const result = await rpcAdapter.saveAtaTaskTemplateMacrotaskRpc(input);

    expect(rpcAdapter.saveAtaTaskTemplateMacrotaskRpc).toHaveBeenCalledWith(input);
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar query ata-task-templates no onSuccess', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.invalidateQueries({
      queryKey: ['ata-task-templates']
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['ata-task-templates']
    });
  });

  it('deve propagar erro de RPC sem silenciar exceção', async () => {
    const error = new Error('INVALID_PAYLOAD: O nome da macrotarefa é obrigatório.');
    vi.mocked(rpcAdapter.saveAtaTaskTemplateMacrotaskRpc).mockRejectedValueOnce(error);

    await expect(
      rpcAdapter.saveAtaTaskTemplateMacrotaskRpc({ templateId: 'atatpl-teste', nome: '' })
    ).rejects.toThrow('INVALID_PAYLOAD');
  });
});
