import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Item 360 (passo 3 da auditoria das telas, 6c): a carteira inteira de contratos, os vínculos de todas as atas e as
 * marcas "não pertence" só servem às sugestões, que ficam na aba Contratos. Nas outras abas elas não são lidas; os
 * contratos dos vínculos do item vêm por chave.
 */
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin', user: { id: 'u' } })) }));
vi.mock('../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
vi.mock('../../hooks/useContractsDashboard', async (orig) => {
  const real = await orig<typeof import('../../hooks/useContractsDashboard')>();
  return { ...real, useContractsDashboard: vi.fn(real.useContractsDashboard) };
});
vi.mock('../../hooks/useAtaManagers', async (orig) => {
  const real = await orig<typeof import('../../hooks/useAtaManagers')>();
  return { ...real, useArpItemContractLinks: vi.fn(real.useArpItemContractLinks) };
});
vi.mock('../../hooks/useContratosSemAta', async (orig) => {
  const real = await orig<typeof import('../../hooks/useContratosSemAta')>();
  return { ...real, useContratosSemAta: vi.fn(real.useContratosSemAta) };
});
vi.mock('../../hooks/useContratosPorChave', async (orig) => {
  const real = await orig<typeof import('../../hooks/useContratosPorChave')>();
  return { ...real, useContratosPorChave: vi.fn(real.useContratosPorChave) };
});

import { useContractsDashboard } from '../../hooks/useContractsDashboard';
import { useArpItemContractLinks } from '../../hooks/useAtaManagers';
import { useContratosSemAta } from '../../hooks/useContratosSemAta';
import { useContratosPorChave } from '../../hooks/useContratosPorChave';
import { ItemBalances } from '../ItemBalances';

const arp = {
  numeroAtaRegistroPreco: '00043/2026',
  codigoUnidadeGerenciadora: '200331',
  dataVigenciaInicial: '2026-01-10',
  dataVigenciaFinal: '2027-01-10',
  numeroControlePncpAta: '',
  uasgCarteira: '200331',
  papelSenasp: 'GERENCIADORA'
} as any;
const item = { numeroItem: '00003', descricaoItem: 'Capacete balístico', quantidadeHomologadaItem: 1440, valorUnitario: 100 } as any;

const render = (url: string) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <ItemBalances arp={arp} item={item} onBack={vi.fn()} backLabel="Voltar" />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('Item 360: leituras da aba Contratos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('na aba inicial: sem a carteira de contratos, sem os vínculos de todas as atas e sem as marcas "não pertence"', () => {
    render('/');
    expect(useContractsDashboard).toHaveBeenCalledWith('200331', { enabled: false });
    expect(useArpItemContractLinks).toHaveBeenCalledWith(false);
    expect(useContratosSemAta).toHaveBeenCalledWith({ enabled: false });
    // Os contratos dos vínculos deste item vêm por chave, da carteira da CGLIC.
    expect(useContratosPorChave).toHaveBeenCalledWith('200331', undefined);
  });

  it('com a aba Contratos aberta: lê o que as sugestões usam', () => {
    render('/?aba=contratos');
    expect(useContractsDashboard).toHaveBeenCalledWith('200331', { enabled: true });
    expect(useArpItemContractLinks).toHaveBeenCalledWith(true);
    expect(useContratosSemAta).toHaveBeenCalledWith({ enabled: true });
  });
});
