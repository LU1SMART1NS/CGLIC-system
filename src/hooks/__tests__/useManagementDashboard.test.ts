import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MANAGEMENT_DASHBOARD_QUERY_KEY,
  getManagementDashboardQueryOptions
} from '../useManagementDashboard';
import * as dashboardService from '../../services/dashboardService';
import type { ManagementDashboardReadModel } from '../../types/managementDashboard';

vi.mock('../../services/dashboardService', () => ({
  fetchManagementDashboardData: vi.fn()
}));

describe('useManagementDashboard Hook / Query Options (CGLIC 3.0 — Fase 8-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve gerar queryKey canônica e staleTime padrão de 10 minutos (fontes no banco)', () => {
    const options = getManagementDashboardQueryOptions('200331');
    expect(options.queryKey).toEqual(['management-dashboard', '200331', 'ALL', 'ALL', 'ALL', 'GLOBAL', 'GLOBAL']);
    expect(options.staleTime).toBe(600000);
    expect(options.gcTime).toBe(1800000);
    expect(options.refetchOnWindowFocus).toBe(false);
  });

  it('deve usar UASG 200331 como default quando uasg for vazia ou omitida', () => {
    expect(MANAGEMENT_DASHBOARD_QUERY_KEY('')).toEqual(['management-dashboard', '200331', 'ALL', 'ALL', 'ALL', 'GLOBAL', 'GLOBAL']);
    const options = getManagementDashboardQueryOptions('');
    expect(options.queryKey).toEqual(['management-dashboard', '200331', 'ALL', 'ALL', 'ALL', 'GLOBAL', 'GLOBAL']);
  });

  it('deve chamar fetchManagementDashboardData ao executar queryFn', async () => {
    const mockModel: Partial<ManagementDashboardReadModel> = {
      uasg: '200331',
      dataCalculo: '2026-09-24T12:00:00Z',
      executive: {
        totalContratos: 10,
        contratosAtivos: 8,
        contratosEncerrados: 2,
        contratosEmProrrogacao: 1,
        valorOriginalTotal: 1000000,
        valorVigenteTotal: 1100000,
        deltaAcumuladoTotal: 100000,
        percentualVariacaoAcumulada: 10
      }
    };

    vi.mocked(dashboardService.fetchManagementDashboardData).mockResolvedValueOnce(mockModel as ManagementDashboardReadModel);

    const options = getManagementDashboardQueryOptions('200331');
    const result = await options.queryFn();

    expect(dashboardService.fetchManagementDashboardData).toHaveBeenCalledWith(
      { uasg: '200331', contractKey: undefined, numeroAta: undefined, statusContrato: undefined, assignedContractKeys: undefined, assignedAtaKeys: undefined },
      undefined
    );
    expect(result).toEqual(mockModel);
  });

  it('deve diferenciar queryKeys por UASG e filtros', () => {
    const optionsA = getManagementDashboardQueryOptions('200331');
    const optionsB = getManagementDashboardQueryOptions('200330');
    const optionsC = getManagementDashboardQueryOptions({ uasg: '200331', contractKey: '1/2026' });

    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey).toEqual(['management-dashboard', '200331', 'ALL', 'ALL', 'ALL', 'GLOBAL', 'GLOBAL']);
    expect(optionsB.queryKey).toEqual(['management-dashboard', '200330', 'ALL', 'ALL', 'ALL', 'GLOBAL', 'GLOBAL']);
    expect(optionsC.queryKey).toEqual(['management-dashboard', '200331', '1/2026', 'ALL', 'ALL', 'GLOBAL', 'GLOBAL']);
  });
});
