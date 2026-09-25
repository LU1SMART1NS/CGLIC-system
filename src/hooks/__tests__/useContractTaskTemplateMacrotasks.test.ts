import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as rpcAdapter from '../../adapters/contractManagementRpcAdapter';
import type { ContractTaskTemplateMacrotaskInput } from '../../adapters/contractManagementRpcAdapter';

vi.mock('../../adapters/contractManagementRpcAdapter', () => ({
  saveContractTaskTemplateMacrotaskRpc: vi.fn(),
  deleteContractTaskTemplateMacrotaskRpc: vi.fn(),
  saveContractTaskTemplateTaskRpc: vi.fn(),
  deleteContractTaskTemplateTaskRpc: vi.fn()
}));

describe('useSaveContractTaskTemplateMacrotask Hook - Testes Unitários de Persistência e Invalidação', () => {
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

  it('deve chamar saveContractTaskTemplateMacrotaskRpc com os parâmetros corretos', async () => {
    const mockResult = {
      success: true,
      macrotask: {
        id: 'tplmt-12345',
        template_id: 'tpl-teste',
        nome: 'Fase Inicial de Fiscalização',
        ordem: 0
      }
    };

    vi.mocked(rpcAdapter.saveContractTaskTemplateMacrotaskRpc).mockResolvedValueOnce(mockResult);

    const input: ContractTaskTemplateMacrotaskInput = {
      templateId: 'tpl-teste',
      nome: 'Fase Inicial de Fiscalização',
      ordem: 0
    };

    const result = await rpcAdapter.saveContractTaskTemplateMacrotaskRpc(input);

    expect(rpcAdapter.saveContractTaskTemplateMacrotaskRpc).toHaveBeenCalledWith(input);
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar query contract-task-templates no onSuccess', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.invalidateQueries({
      queryKey: ['contract-task-templates']
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['contract-task-templates']
    });
  });

  it('deve propagar erro de RPC sem silenciar exceção', async () => {
    const error = new Error('INVALID_PAYLOAD: O nome da macrotarefa é obrigatório.');
    vi.mocked(rpcAdapter.saveContractTaskTemplateMacrotaskRpc).mockRejectedValueOnce(error);

    await expect(
      rpcAdapter.saveContractTaskTemplateMacrotaskRpc({ templateId: 'tpl-teste', nome: '' })
    ).rejects.toThrow('INVALID_PAYLOAD');
  });
});
