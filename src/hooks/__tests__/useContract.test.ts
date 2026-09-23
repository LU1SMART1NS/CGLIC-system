import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useContract } from '../useContract';
import * as useContractsDashboardModule from '../useContractsDashboard';
import type { ContractDashboardRecord } from '../../types';

vi.mock('../useContractsDashboard', () => ({
  useContractsDashboard: vi.fn()
}));

const mockContracts: ContractDashboardRecord[] = [
  {
    id: '200331-00015-2026',
    numero: '15/2026',
    ano: 2026,
    numeroFormatado: '15/2026',
    uasg: '200331',
    objeto: 'Prestação de serviços contínuos de TI',
    fornecedorNome: 'EMPRESA TECH BRASIL LTDA',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    valorGlobal: 1200000,
    valorInicial: 1000000,
    dataVigenciaInicio: '2026-01-01',
    dataVigenciaFim: '2026-12-31',
    statusVigencia: 'Vigente',
    numeroControlePncp: '200331-2-000015/2026',
    fonteDados: 'PNCP',
    processo: '23000.001234/2026-11'
  },
  {
    id: '200331-00020-2025',
    numero: '20/2025',
    ano: 2025,
    numeroFormatado: '20/2025',
    uasg: '200331',
    objeto: 'Serviços de limpeza e conservação predial',
    fornecedorNome: 'SERVICOS GERAIS S/A',
    fornecedorCnpjCpf: '98.765.432/0001-10',
    valorGlobal: 450000,
    statusVigencia: 'A Vencer (60d)',
    fonteDados: 'Compras.gov.br'
  }
];

describe('useContract Hook — Localização Canônica de Contrato na Visão 360°', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve localizar contrato existente por ID canônico', () => {
    vi.mocked(useContractsDashboardModule.useContractsDashboard).mockReturnValue({
      data: mockContracts,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);

    const result = useContract('200331-00015-2026', '200331');

    expect(result.contract).toBeDefined();
    expect(result.contract?.id).toBe('200331-00015-2026');
    expect(result.contract?.numero).toBe('15/2026');
    expect(result.contract?.fornecedorNome).toBe('EMPRESA TECH BRASIL LTDA');
    expect(result.isLoading).toBe(false);
  });

  it('deve localizar contrato por número de controle PNCP', () => {
    vi.mocked(useContractsDashboardModule.useContractsDashboard).mockReturnValue({
      data: mockContracts,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);

    const result = useContract('200331-2-000015/2026', '200331');

    expect(result.contract).toBeDefined();
    expect(result.contract?.id).toBe('200331-00015-2026');
  });

  it('deve retornar null quando contractKey não for encontrado', () => {
    vi.mocked(useContractsDashboardModule.useContractsDashboard).mockReturnValue({
      data: mockContracts,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);

    const result = useContract('CHAVE-INEXISTENTE-999', '200331');

    expect(result.contract).toBeNull();
    expect(result.isLoading).toBe(false);
  });

  it('deve repassar estados de carregamento (isLoading) e erro (isError)', () => {
    const mockError = new Error('Falha de rede na API oficial');
    vi.mocked(useContractsDashboardModule.useContractsDashboard).mockReturnValue({
      data: [],
      isLoading: true,
      isError: true,
      error: mockError,
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);

    const result = useContract('200331-00015-2026', '200331');

    expect(result.contract).toBeNull();
    expect(result.isLoading).toBe(true);
    expect(result.isError).toBe(true);
    expect(result.error).toBe(mockError);
  });
});
