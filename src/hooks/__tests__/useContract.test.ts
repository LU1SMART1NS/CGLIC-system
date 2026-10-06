import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useContract } from '../useContract';
import * as useContractsDashboardModule from '../useContractsDashboard';
import * as contratoGovModule from '../useContractContratosGov';
import type { ContractDashboardRecord } from '../../types';

vi.mock('../useContractsDashboard', () => ({
  useContractsDashboard: vi.fn()
}));
vi.mock('../useContractContratosGov', () => ({
  useContratoGov: vi.fn()
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ role: 'leitor' })
}));
// Os testes chamam o hook direto, fora de um componente: useMemo vira a própria conta, e o efeito
// (gravar no banco o contrato completado) não roda.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useMemo: (fn: () => unknown) => fn(),
  useEffect: () => undefined
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
    statusVigencia: 'A Vencer',
    fonteDados: 'Compras.gov.br'
  }
];

describe('useContract Hook — Localização Canônica de Contrato na Visão 360°', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contratoGovModule.useContratoGov).mockReturnValue({ data: undefined, isLoading: false } as any);
  });

  it('completa o registro do Compras.gov.br com o contrato do Contratos.gov.br, sem mudar o id da tela', () => {
    vi.mocked(useContractsDashboardModule.useContractsDashboard).mockReturnValue({
      data: mockContracts, isLoading: false, isError: false, error: null, refetch: vi.fn(), refresh: vi.fn()
    } as any);
    vi.mocked(contratoGovModule.useContratoGov).mockReturnValue({
      data: { ...mockContracts[1], id: 'OUTRO-ID', contratoId: 670960, dataAssinatura: '2025-10-06', valorInicial: 3800, fonteDados: 'Contratos.gov.br', raw: { categoria: 'Compras' } },
      isLoading: false
    } as any);

    const result = useContract('200331-00020-2025', '200331');

    expect(result.contract?.id).toBe('200331-00020-2025');
    expect(result.contract?.contratoId).toBe(670960);
    expect(result.contract?.dataAssinatura).toBe('2025-10-06');
    expect(result.contract?.fonteDados).toBe('Contratos.gov.br');
    expect(result.contract?.raw?.categoria).toBe('Compras');
    expect(result.enriching).toBe(false);
  });

  it('enquanto completa, repassa o registro de base e avisa que está completando', () => {
    vi.mocked(useContractsDashboardModule.useContractsDashboard).mockReturnValue({
      data: mockContracts, isLoading: false, isError: false, error: null, refetch: vi.fn(), refresh: vi.fn()
    } as any);
    vi.mocked(contratoGovModule.useContratoGov).mockReturnValue({ data: undefined, isLoading: true } as any);

    const result = useContract('200331-00020-2025', '200331');

    expect(result.contract?.fonteDados).toBe('Compras.gov.br');
    expect(result.enriching).toBe(true);
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
