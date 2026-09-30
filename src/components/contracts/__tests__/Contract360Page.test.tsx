import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Contract360Page } from '../Contract360Page';
import * as useContractModule from '../../../hooks/useContract';
import * as useContractTaskPlanModule from '../../../hooks/useContractTaskPlan';
import * as useAssignedManagementScopeModule from '../../../hooks/useAssignedManagementScope';
import * as authContextModule from '../../../context/AuthContext';
import type { ContractDashboardRecord } from '../../../types';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ contractKey: '200331-00002-2024' }),
  useNavigate: () => vi.fn(),
  useOutletContext: () => null,
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

const mockContract: ContractDashboardRecord = {
  id: '200331-00002-2024',
  uasg: '200331',
  numero: '00002',
  ano: 2024,
  numeroFormatado: '02/2024',
  tipoInstrumento: 'TERMO_CONTRATO',
  fornecedorNome: 'Beta Tecnologia e Inovação S/A',
  objeto: 'Aquisição e manutenção preventiva de equipamentos.',
  dataVigenciaInicio: '2024-05-01',
  dataVigenciaFim: '2026-10-15',
  valorInicial: 800000,
  valorGlobal: 950000,
  statusVigencia: 'Vigente',
  fonteDados: 'Compras.gov.br'
} as any;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Contract360Page />
    </QueryClientProvider>
  );
}

describe('Contract360Page — Guarda de escopo ASSIGNED (perfil "gestor")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useContractModule, 'useContract').mockReturnValue({
      contract: mockContract,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    } as any);
    vi.spyOn(useContractTaskPlanModule, 'useContractTaskPlan').mockReturnValue({
      data: null,
      isLoading: false
    } as any);
  });

  it('bloqueia o acesso quando o gestor logado não é o gestor titular do contrato', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'gestor-joao' } as any,
      session: null,
      loading: false,
      role: 'gestor',
      roleStatus: 'ready',
      signOut: vi.fn()
    });
    vi.spyOn(useAssignedManagementScopeModule, 'useAssignedManagementScope').mockReturnValue({
      contractKeys: ['200331-00099-2024'], // contrato de outro gestor (Maria)
      ataKeys: [],
      isLoading: false
    });

    const html = renderPage();

    expect(html).toContain('Acesso não autorizado');
    expect(html).not.toContain('Beta Tecnologia e Inovação S/A');
  });

  it('bloqueia o acesso quando o contrato não tem nenhum gestor atribuído', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'gestor-joao' } as any,
      session: null,
      loading: false,
      role: 'gestor',
      roleStatus: 'ready',
      signOut: vi.fn()
    });
    vi.spyOn(useAssignedManagementScopeModule, 'useAssignedManagementScope').mockReturnValue({
      contractKeys: [],
      ataKeys: [],
      isLoading: false
    });

    const html = renderPage();

    expect(html).toContain('Acesso não autorizado');
  });

  it('libera o acesso quando o gestor logado é o gestor titular do contrato', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'gestor-joao' } as any,
      session: null,
      loading: false,
      role: 'gestor',
      roleStatus: 'ready',
      signOut: vi.fn()
    });
    vi.spyOn(useAssignedManagementScopeModule, 'useAssignedManagementScope').mockReturnValue({
      contractKeys: ['200331-00002-2024'],
      ataKeys: [],
      isLoading: false
    });

    const html = renderPage();

    expect(html).not.toContain('Acesso não autorizado');
    expect(html).toContain('Beta Tecnologia e Inovação S/A');
  });

  it('perfil "admin" (escopo GLOBAL) acessa qualquer contrato, mesmo sem gestor atribuído', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-user' } as any,
      session: null,
      loading: false,
      role: 'admin',
      roleStatus: 'ready',
      signOut: vi.fn()
    });
    vi.spyOn(useAssignedManagementScopeModule, 'useAssignedManagementScope').mockReturnValue({
      contractKeys: undefined,
      ataKeys: undefined,
      isLoading: false
    });

    const html = renderPage();

    expect(html).not.toContain('Acesso não autorizado');
    expect(html).toContain('Beta Tecnologia e Inovação S/A');
  });
});

describe('Contract360Page — organização em abas', () => {
  beforeEach(() => {
    vi.spyOn(useContractModule, 'useContract').mockReturnValue({
      contract: mockContract,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    } as any);
    vi.spyOn(useContractTaskPlanModule, 'useContractTaskPlan').mockReturnValue({ data: null, isLoading: false } as any);
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-user' } as any,
      session: null,
      loading: false,
      role: 'admin',
      roleStatus: 'ready',
      signOut: vi.fn()
    });
    vi.spyOn(useAssignedManagementScopeModule, 'useAssignedManagementScope').mockReturnValue({
      contractKeys: undefined,
      ataKeys: undefined,
      isLoading: false
    });
  });

  it('abre na aba Ações, com a faixa de resumo e sem Workflows nem o placeholder antigo', () => {
    const html = renderPage();

    expect(html).toContain('data-testid="contract-health-strip"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Plano de gestão');
    expect(html).toContain('>Histórico<');
    expect(html).toContain('Ações do contrato');
    expect(html).not.toContain('Workflows do Contrato');
    expect(html).not.toContain('Informações Complementares');
    expect(html).not.toContain('Linha do tempo contratual');
  });
});
