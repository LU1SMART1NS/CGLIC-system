import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractManagerSelector } from '../ContractManagerSelector';
import * as managerHook from '../../../hooks/useContractManager';
import * as saveHook from '../../../hooks/useSaveContractManager';
import * as usersHook from '../../../hooks/useUsers';
import * as rolesHook from '../../../hooks/useRoles';
import type { ContractDashboardRecord } from '../../../types';

vi.mock('../../../hooks/useContractManager', () => ({
  useContractManager: vi.fn()
}));

vi.mock('../../../hooks/useSaveContractManager', () => ({
  useSaveContractManager: vi.fn()
}));

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: vi.fn()
}));

vi.mock('../../../hooks/useRoles', () => ({
  useRoles: vi.fn()
}));

const mockContract: ContractDashboardRecord = {
  id: '200331-00015-2026',
  numero: '15/2026',
  ano: 2026,
  numeroFormatado: '15/2026',
  uasg: '200331',
  objeto: 'Serviços de TI',
  fornecedorNome: 'TECH LTDA',
  fornecedorCnpjCpf: '12.345.678/0001-90',
  valorGlobal: 100000,
  dataVigenciaInicio: '2026-01-01',
  dataVigenciaFim: '2026-12-31',
  statusVigencia: 'Vigente',
  fonteDados: 'Compras.gov.br'
};

describe('ContractManagerSelector Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveHook.useSaveContractManager).mockReturnValue({
      mutate: vi.fn(),
      isPending: false
    } as any);
    vi.mocked(usersHook.useUsers).mockReturnValue({
      data: [
        { id: '1', nome: 'Carlos Gestor', perfil: 'gestor', ativo: true }
      ],
      isLoading: false
    } as any);
    vi.mocked(rolesHook.useRoles).mockReturnValue({
      data: [{ id: 'gestor', nome: 'Gestor / Fiscal de Contrato', badgeColor: '#0284c7', descricao: '', isCustom: false, permissoes: {} as any }],
      isLoading: false
    } as any);
  });

  it('1. deve renderizar "Não atribuído" com botão "Atribuir" quando o contrato não tem gestor', () => {
    vi.mocked(managerHook.useContractManager).mockReturnValue({
      data: null,
      isLoading: false
    } as any);

    const html = renderToStaticMarkup(<ContractManagerSelector contract={mockContract} />);

    expect(html).toContain('Gestor Titular');
    expect(html).toContain('Não atribuído');
    expect(html).toContain('Atribuir');
  });

  it('2. deve renderizar o nome do gestor com botão "Alterar" quando houver gestor atribuído', () => {
    vi.mocked(managerHook.useContractManager).mockReturnValue({
      data: {
        id: 'mgr-1',
        contractKey: '200331-00015-2026',
        uasg: '200331',
        numero: '15/2026',
        ano: 2026,
        gestorNome: 'Ana Gestora Silva',
        updatedAt: '2026-03-01T00:00:00Z'
      },
      isLoading: false
    } as any);

    const html = renderToStaticMarkup(<ContractManagerSelector contract={mockContract} />);

    expect(html).toContain('Gestor Titular');
    expect(html).toContain('Ana Gestora Silva');
    expect(html).toContain('Alterar');
  });

  it('3. deve exibir estado de carregamento quando os dados estiverem sendo buscados', () => {
    vi.mocked(managerHook.useContractManager).mockReturnValue({
      data: null,
      isLoading: true
    } as any);

    const html = renderToStaticMarkup(<ContractManagerSelector contract={mockContract} />);

    expect(html).toContain('Carregando...');
  });
});
