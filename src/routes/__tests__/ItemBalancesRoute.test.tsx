import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as useAtaModule from '../../hooks/useAta';
import * as scopeModule from '../../hooks/useAssignedManagementScope';
import * as authModule from '../../context/AuthContext';

let mockParams: Record<string, string> = {};
vi.mock('react-router-dom', () => ({
  useParams: () => mockParams,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '', state: null })
}));
vi.mock('../../context/SelectionContext', () => ({ useSelection: () => ({ setSelectedArp: vi.fn() }) }));
vi.mock('../../components/ItemBalances', () => ({
  ItemBalances: ({ arp, item }: any) => <div data-testid="item-balances">{`${arp.numeroAtaRegistroPreco}|${item.numeroItem}`}</div>
}));

import { ItemBalancesRoute } from '../ItemBalancesRoute';
import { buildAtaItemPath, uasgFromAtaKey } from '../../hooks/useAta';

const arp = { numeroAtaRegistroPreco: '00059/2025', codigoUnidadeGerenciadora: '200331' } as any;
const itens = [{ numeroItem: '00001' }, { numeroItem: '00003' }] as any;

function setRole(role: string, ataKeys?: string[]) {
  vi.spyOn(authModule, 'useAuth').mockReturnValue({ user: { id: 'u' }, role } as any);
  vi.spyOn(scopeModule, 'useAssignedManagementScope').mockReturnValue({ contractKeys: undefined, ataKeys, isLoading: false });
}

describe('ItemBalancesRoute — endereço próprio do item', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockParams = { ataKey: encodeURIComponent('00059/2025-200331'), numeroItem: '3' };
    vi.spyOn(useAtaModule, 'useAta').mockReturnValue({ arp, itens, isLoading: false } as any);
  });

  it('monta o endereço e extrai a UASG da chave', () => {
    expect(buildAtaItemPath('00059/2025', '200331', '00003')).toBe('/atas/detalhe/00059%2F2025-200331/itens/00003');
    expect(uasgFromAtaKey('00059/2025-200330')).toBe('200330');
  });

  it('carrega Ata e item a partir do endereço (número do item com ou sem zeros)', () => {
    setRole('admin');
    const html = renderToStaticMarkup(<ItemBalancesRoute />);
    expect(html).toContain('00059/2025|00003');
  });

  it('mostra "Item não encontrado" quando o item não existe na Ata', () => {
    setRole('admin');
    mockParams = { ...mockParams, numeroItem: '99' };
    const html = renderToStaticMarkup(<ItemBalancesRoute />);
    expect(html).toContain('Item não encontrado');
  });

  it('perfil gestor não abre item de Ata que não é dele', () => {
    setRole('gestor', ['00001/2026']);
    const html = renderToStaticMarkup(<ItemBalancesRoute />);
    expect(html).toContain('Acesso não autorizado');
    expect(html).not.toContain('item-balances');
  });

  it('gestor de saldos abre o item (para alocar) sem passar pelo escopo de Atas do gestor', () => {
    setRole('gestor_saldos');
    const html = renderToStaticMarkup(<ItemBalancesRoute />);
    expect(html).toContain('00059/2025|00003');
  });
});

describe('ItemBalancesRoute — uma leitura falha: a tela diz o quê', () => {
  const falhou = () => ({ data: undefined, isError: true, error: new Error('canceling statement due to statement timeout'), refetch: vi.fn() });

  beforeEach(() => {
    vi.restoreAllMocks();
    mockParams = { ataKey: encodeURIComponent('00043/2026-200331'), numeroItem: '3' };
  });

  it('as atas não carregaram (3a): erro com "Tentar novamente", e não "Ata não encontrada"', () => {
    setRole('admin');
    vi.spyOn(useAtaModule, 'useAta').mockReturnValue({ arp: null, itens: [], isLoading: false, isError: true, error: new Error('canceling statement due to statement timeout'), refetch: vi.fn() } as any);
    const html = renderToStaticMarkup(<ItemBalancesRoute />);
    expect(html).toContain('Falha ao carregar a ata do item');
    expect(html).toContain('canceling statement due to statement timeout');
    expect(html).toContain('Tentar novamente');
    expect(html).not.toContain('Ata não encontrada');
  });

  it('perfil gestor: as atribuições não carregaram → a faixa, e não "Acesso não autorizado"', () => {
    vi.spyOn(useAtaModule, 'useAta').mockReturnValue({ arp: { numeroAtaRegistroPreco: '00043/2026', codigoUnidadeGerenciadora: '200331' }, itens: [{ numeroItem: '00003' }], isLoading: false } as any);
    vi.spyOn(authModule, 'useAuth').mockReturnValue({ user: { id: 'u' }, role: 'gestor' } as any);
    vi.spyOn(scopeModule, 'useAssignedManagementScope').mockReturnValue({
      contractKeys: [],
      ataKeys: [],
      isLoading: false,
      leituras: [{ rotulo: 'vínculos entre itens de ata e contratos', query: falhou() }]
    });
    const html = renderToStaticMarkup(<ItemBalancesRoute />);
    expect(html).toContain('data-testid="instrument-state-escopo-nao-conferido"');
    expect(html).toContain('<strong>Vínculos entre itens de ata e contratos</strong>');
    expect(html).not.toContain('Acesso não autorizado');
    expect(html).not.toContain('item-balances');
  });
});
