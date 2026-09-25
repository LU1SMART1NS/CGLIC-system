import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Contract360Header } from '../Contract360Header';
import * as syncHookModule from '../../../hooks/useSyncContractEmpenhos';
import type { ContractDashboardRecord } from '../../../types';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../../hooks/useSyncContractEmpenhos', () => ({
  useSyncContractEmpenhos: vi.fn()
}));

vi.mock('../../../hooks/useContractManager', () => ({
  useContractManager: () => ({ data: { gestorNome: 'Maria Fiscal' }, isLoading: false })
}));

vi.mock('../../../hooks/useSaveContractManager', () => ({
  useSaveContractManager: () => ({ mutate: vi.fn(), isPending: false })
}));

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: () => ({ data: [], isLoading: false })
}));

const mockContract: ContractDashboardRecord = {
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
};

describe('Contract360Header Component — Integração UI de Sincronização de Empenhos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultMockMutation = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: null,
    reset: vi.fn()
  };

  it('1. deve renderizar o botão "Sincronizar Empenhos" habilitado para perfil gestor', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Sincronizar Empenhos');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('Sincronizando...');
  });

  it('2. deve renderizar o botão desabilitado com tooltip para perfil consulta (RBAC)', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="consulta" />
    );

    expect(html).toContain('Sincronizar Empenhos');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Você não possui permissão para sincronizar empenhos.');
  });

  it('3. deve exibir spinner e estado "Sincronizando..." quando a mutação estiver pendente', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      isPending: true
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Sincronizando...');
    expect(html).toContain('disabled=""');
  });

  it('4. deve exibir banner de feedback SUCESSO quando a orquestração concluir com êxito', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'SUCESSO',
        empenhos_encontrados: 3,
        empenhos_persistidos: 3,
        empenhos_atualizados: 0,
        divergencias: [],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Sincronização concluída. 3 empenho(s) processado(s) e atualizado(s) com sucesso.');
    expect(html).toContain('role="alert"');
  });

  it('5. deve exibir banner de feedback SEM_DADOS quando nenhum empenho for localizado', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'SEM_DADOS',
        empenhos_encontrados: 0,
        empenhos_persistidos: 0,
        empenhos_atualizados: 0,
        divergencias: [],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Nenhum empenho encontrado nas bases oficiais para este contrato.');
  });

  it('6. deve exibir banner de feedback COM_DIVERGENCIAS informando conflitos detectados', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'COM_DIVERGENCIAS',
        empenhos_encontrados: 1,
        empenhos_persistidos: 1,
        empenhos_atualizados: 0,
        divergencias: [
          {
            campo: 'valor_empenhado',
            fonte_a: 'Compras.gov.br',
            valor_a: 50000,
            fonte_b: 'Contratos.gov.br',
            valor_b: 48000
          }
        ],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Dados sincronizados com 1 divergência(s) entre fontes oficiais.');
  });

  it('7. deve exibir banner de feedback ERRO quando a mutação falhar', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      isError: true,
      error: new Error('Falha de comunicação com a API do PNCP')
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Falha de comunicação com a API do PNCP');
  });
});
