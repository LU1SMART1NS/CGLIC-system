/**
 * Passo 3 da auditoria das telas (6b): o "Vincular contrato" fechado não lê nada. Antes ele disparava 5 consultas
 * (contratos da UASG, vínculos, "não pertence a ata", gestores das atas e dos contratos, descartes) na Ata 360 e no
 * Item 360, mesmo sem ser aberto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const leituras = vi.hoisted(() => ({
  contratos: vi.fn(() => ({ data: [], isLoading: false })),
  vinculos: vi.fn(() => ({ data: [] })),
  ataManagers: vi.fn(() => ({ data: {} })),
  contractManagers: vi.fn(() => ({ data: {} })),
  semAta: vi.fn(() => ({ data: {} })),
  descartes: vi.fn(() => ({ data: {} }))
}));
const { mutacao } = vi.hoisted(() => ({ mutacao: () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }) }));

vi.mock('../../../hooks/useContractsDashboard', () => ({ useContractsDashboard: leituras.contratos }));
vi.mock('../../../hooks/useAtaManagers', () => ({ useArpItemContractLinks: leituras.vinculos, useAllAtaManagers: leituras.ataManagers }));
vi.mock('../../../hooks/useAllContractManagers', () => ({ useAllContractManagers: leituras.contractManagers }));
vi.mock('../../../hooks/useContratosSemAta', () => ({ useContratosSemAta: leituras.semAta }));
vi.mock('../../../hooks/useDescartesAtaContrato', () => ({ useDescartesAtaContrato: leituras.descartes }));
vi.mock('../../../hooks/useLinkContractToItem', () => ({ useLinkContractToItem: mutacao }));
vi.mock('../../../hooks/useLinkContractToItems', () => ({ useLinkContractToItems: mutacao }));
vi.mock('../../../hooks/useSyncContractItemQuantity', () => ({ useSyncContractItemQuantity: mutacao }));
vi.mock('../../../hooks/useSaveContractManager', () => ({ useSaveContractManager: mutacao }));
vi.mock('../../../hooks/useContractItemQuantities', () => ({ useContractItemQuantities: () => ({ data: undefined, isLoading: false }) }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }));
vi.mock('../../../design-system', async (orig) => ({
  ...(await orig<typeof import('../../../design-system')>()),
  useToast: () => ({ showToast: vi.fn(), success: vi.fn(), error: vi.fn() }),
  // Fora do navegador o portal do modal não renderiza: basta saber se o corpo foi montado.
  Modal: ({ children, testId }: { children: React.ReactNode; testId?: string }) => <div data-testid={testId ?? 'modal'}>{children}</div>
}));

import { LinkContractModal } from '../LinkContractModal';

const render = (isOpen: boolean) =>
  renderToStaticMarkup(<LinkContractModal isOpen={isOpen} onClose={vi.fn()} itemKey="00010/2024-200331-1" numeroAta="00010/2024" numeroItem={1} uasg="200331" />);

describe('LinkContractModal fechado', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fechado: não renderiza nada e não chama nenhuma leitura', () => {
    expect(render(false)).toBe('');
    for (const leitura of Object.values(leituras)) expect(leitura).not.toHaveBeenCalled();
  });

  it('aberto: lê os contratos da UASG, os vínculos, os gestores, as marcas e os descartes', () => {
    expect(render(true)).not.toBe('');
    for (const leitura of Object.values(leituras)) expect(leitura).toHaveBeenCalled();
    expect(leituras.contratos).toHaveBeenCalledWith('200331');
  });
});
