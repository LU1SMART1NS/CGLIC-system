import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Ata360Page } from '../Ata360Page';
import * as useAtaModule from '../../../hooks/useAta';
import * as useAssignedManagementScopeModule from '../../../hooks/useAssignedManagementScope';
import * as authContextModule from '../../../context/AuthContext';
import type { ArpRecord, ArpItemRecord } from '../../../types';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ ataKey: '00011%2F2026-200331' }),
  useNavigate: () => vi.fn()
}));

const mockArp: ArpRecord = {
  numeroAtaRegistroPreco: '00011/2026',
  codigoUnidadeGerenciadora: '200331',
  nomeUnidadeGerenciadora: 'SENASP',
  codigoOrgao: 30108,
  nomeOrgao: 'Ministério da Justiça e Segurança Pública',
  numeroCompra: '10',
  anoCompra: '2026',
  codigoModalidadeCompra: '05',
  nomeModalidadeCompra: 'Pregão Eletrônico',
  dataAssinatura: '2026-01-10',
  dataVigenciaInicial: '2026-01-10',
  dataVigenciaFinal: '2027-01-10',
  valorTotal: 1500000,
  statusAta: 'Vigente',
  objeto: 'Aquisição de equipamentos de proteção balística',
  quantidadeItens: 1,
  dataHoraAtualizacao: '2026-09-01T00:00:00Z',
  dataHoraInclusao: '2026-01-10T00:00:00Z',
  dataHoraExclusao: null,
  ataExcluido: false,
  numeroControlePncpAta: 'PNCP-123',
  numeroControlePncpCompra: 'PNCP-COMPRA-123',
  idCompra: '20033110002026'
} as any;

const mockItens: ArpItemRecord[] = [
  {
    numeroAtaRegistroPreco: '00011/2026',
    codigoUnidadeGerenciadora: '200331',
    numeroCompra: '10',
    anoCompra: '2026',
    codigoModalidadeCompra: '05',
    dataAssinatura: '2026-01-10',
    dataVigenciaInicial: '2026-01-10',
    dataVigenciaFinal: '2027-01-10',
    numeroItem: '1',
    codigoItem: 1,
    descricaoItem: 'Colete Balístico Nível III-A',
    tipoItem: 'Material',
    quantidadeHomologadaItem: 100,
    classificacaoFornecedor: '001',
    niFornecedor: '11.222.333/0001-44',
    nomeRazaoSocialFornecedor: 'Equipamentos de Proteção Ltda',
    quantidadeHomologadaVencedor: 100,
    valorUnitario: 1500,
    valorTotal: 150000,
    maximoAdesao: 50,
    nomeUnidadeGerenciadora: 'SENASP',
    nomeModalidadeCompra: 'Pregão Eletrônico',
    idCompra: '20033110002026',
    numeroControlePncpCompra: 'PNCP-COMPRA-123',
    dataHoraInclusao: '2026-01-10T00:00:00Z',
    dataHoraAtualizacao: '2026-01-10T00:00:00Z'
  } as any
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Ata360Page />
    </QueryClientProvider>
  );
}

describe('Ata360Page — Visão 360° da Ata de Registro de Preços', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAtaModule, 'useAta').mockReturnValue({
      arp: mockArp,
      itens: mockItens,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    } as any);
    vi.spyOn(useAtaModule, 'useAtaItemSaldos').mockReturnValue({
      saldos: [
        {
          numero_item: '1',
          descricao_item: 'Colete Balístico Nível III-A',
          quantidade_homologada: 100,
          quantidade_consumida: 40,
          saldo_disponivel: 60,
          percentual_consumido: 40
        }
      ],
      isLoading: false
    } as any);
    vi.spyOn(useAtaModule, 'useAtaLinkedContracts').mockReturnValue({
      linkedContracts: [],
      isLoading: false
    } as any);
  });

  it('1. renderiza header, saldo do item e dados cadastrais para perfil "admin" (escopo global)', () => {
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

    expect(html).toContain('Ata 00011/2026');
    expect(html).toContain('Colete Balístico Nível III-A');
    expect(html).toContain('Saldo físico sob controle');
    expect(html).not.toContain('Acesso não autorizado');
  });

  it('2. bloqueia o acesso quando o gestor logado não é o gestor titular da Ata', () => {
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
      ataKeys: ['00099/2026'], // Ata de outro gestor
      isLoading: false
    });

    const html = renderPage();

    expect(html).toContain('Acesso não autorizado');
    expect(html).not.toContain('Colete Balístico Nível III-A');
  });

  it('3. libera o acesso quando o gestor logado é o gestor titular da Ata', () => {
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
      ataKeys: ['00011/2026'],
      isLoading: false
    });

    const html = renderPage();

    expect(html).not.toContain('Acesso não autorizado');
    expect(html).toContain('Ata 00011/2026');
  });

  it('4. exibe item com saldo crítico (≥70%) na Central de Atenção', () => {
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
    vi.spyOn(useAtaModule, 'useAtaItemSaldos').mockReturnValue({
      saldos: [
        {
          numero_item: '1',
          descricao_item: 'Colete Balístico Nível III-A',
          quantidade_homologada: 100,
          quantidade_consumida: 92,
          saldo_disponivel: 8,
          percentual_consumido: 92
        }
      ],
      isLoading: false
    } as any);

    const html = renderPage();

    expect(html).not.toContain('Saldo físico sob controle');
    expect(html).toContain('92.0% consumido');
  });

  it('5. exibe estado "Ata não encontrada" quando a busca não retorna resultado', () => {
    vi.spyOn(useAtaModule, 'useAta').mockReturnValue({
      arp: null,
      itens: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    } as any);
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

    expect(html).toContain('Ata não encontrada');
  });
});
