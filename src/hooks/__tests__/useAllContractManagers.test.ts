import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllContractManagersQueryOptions } from '../useAllContractManagers';
import * as contractManagementService from '../../services/contractManagementService';

vi.mock('../../services/contractManagementService', () => ({
  fetchAllContractManagers: vi.fn()
}));

describe('useAllContractManagers Hook / Query Options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve gerar queryKey canônica e staleTime de 5 minutos', () => {
    const options = getAllContractManagersQueryOptions('200331');
    expect(options.queryKey).toEqual(['all-contract-managers', '200331']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000);
  });

  it('deve chamar fetchAllContractManagers com a UASG correta', async () => {
    const mockMap = {
      '200331-1-2024': {
        contractKey: '200331-1-2024',
        uasg: '200331',
        numero: '1',
        ano: 2024,
        gestorNome: 'Carlos Silva'
      }
    };

    vi.mocked(contractManagementService.fetchAllContractManagers).mockResolvedValueOnce(mockMap as any);

    const options = getAllContractManagersQueryOptions('200331');
    const result = await options.queryFn();

    expect(contractManagementService.fetchAllContractManagers).toHaveBeenCalledWith('200331');
    expect(result).toEqual(mockMap);
  });
});
