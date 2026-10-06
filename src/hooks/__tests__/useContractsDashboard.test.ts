import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getContractsDashboardQueryOptions,
  CONTRACTS_STALE_TIME_MS,
  CONTRACTS_GC_TIME_MS
} from '../useContractsDashboard';
import * as contratosOficiais from '../../services/contratosOficiaisService';

vi.mock('../../services/contratosOficiaisService', () => ({
  fetchContratosParaTela: vi.fn()
}));

describe('useContractsDashboard Hook / Query Options - Testes Unitários do Dashboard de Contratos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gera a queryKey canônica, com validade longa (a sincronização invalida a query ao terminar)', () => {
    const options = getContractsDashboardQueryOptions('200331');
    expect(options.queryKey).toEqual(['contracts-dashboard', '200331']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(CONTRACTS_STALE_TIME_MS);
    expect(CONTRACTS_STALE_TIME_MS).toBe(30 * 60 * 1000);
    expect(options.gcTime).toBe(CONTRACTS_GC_TIME_MS);
  });

  it('não assume UASG quando ela for vazia ou omitida: consulta desabilitada', () => {
    for (const uasg of ['', '  ', undefined]) {
      const options = getContractsDashboardQueryOptions(uasg);
      expect(options.queryKey).toEqual(['contracts-dashboard', '']);
      expect(options.enabled).toBe(false);
    }
  });

  it('lê a lista pela leitura do banco (fetchContratosParaTela) com a UASG especificada', async () => {
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

    vi.mocked(contratosOficiais.fetchContratosParaTela).mockResolvedValueOnce(mockContracts as any);

    const options = getContractsDashboardQueryOptions(' 200331 ');
    const result = await options.queryFn();

    expect(contratosOficiais.fetchContratosParaTela).toHaveBeenCalledWith('200331');
    expect(result).toEqual(mockContracts);
  });

  it('não recarrega sozinho: sem intervalo e sem recarga ao voltar para a aba', () => {
    const options = getContractsDashboardQueryOptions('200331') as Record<string, unknown>;
    expect(options.refetchInterval).toBeUndefined();
    expect(options.refetchOnWindowFocus).toBe(false);
  });

  it('deve diferenciar queryKeys por UASG', () => {
    const optionsA = getContractsDashboardQueryOptions('200331');
    const optionsB = getContractsDashboardQueryOptions('200330');

    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey).toEqual(['contracts-dashboard', '200331']);
    expect(optionsB.queryKey).toEqual(['contracts-dashboard', '200330']);
  });
});
