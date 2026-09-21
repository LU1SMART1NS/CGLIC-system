import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getContractsDashboardQueryOptions } from '../useContractsDashboard';
import * as contractService from '../../services/contractService';

vi.mock('../../services/contractService', () => ({
  fetchContractsForDashboard: vi.fn()
}));

describe('useContractsDashboard Hook / Query Options - Testes Unitários do Dashboard de Contratos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve gerar queryKey canônica e staleTime padrão de 5 minutos', () => {
    const options = getContractsDashboardQueryOptions('200331');
    expect(options.queryKey).toEqual(['contracts-dashboard', '200331']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000);
  });

  it('deve usar UASG 200331 como default quando uasg for vazia ou omitida', () => {
    const options = getContractsDashboardQueryOptions('');
    expect(options.queryKey).toEqual(['contracts-dashboard', '200331']);
    expect(options.enabled).toBe(true);
  });

  it('deve chamar fetchContractsForDashboard com a uasg especificada', async () => {
    const mockContracts = [
      {
        id: '200331-1-2025',
        numero: '1',
        ano: '2025',
        numeroFormatado: '1/2025',
        uasg: '200331',
        objeto: 'Serviços de TI',
        statusVigencia: 'Vigente'
      }
    ];

    vi.mocked(contractService.fetchContractsForDashboard).mockResolvedValueOnce(mockContracts as any);

    const options = getContractsDashboardQueryOptions('200331');
    const result = await options.queryFn();

    expect(contractService.fetchContractsForDashboard).toHaveBeenCalledWith('200331', false);
    expect(result).toEqual(mockContracts);
  });

  it('deve diferenciar queryKeys por UASG', () => {
    const optionsA = getContractsDashboardQueryOptions('200331');
    const optionsB = getContractsDashboardQueryOptions('200330');

    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey).toEqual(['contracts-dashboard', '200331']);
    expect(optionsB.queryKey).toEqual(['contracts-dashboard', '200330']);
  });
});
