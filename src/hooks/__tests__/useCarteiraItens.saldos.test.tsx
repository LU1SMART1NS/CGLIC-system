/**
 * Falha ao ler o saldo dos itens na Carteira: o hook informa o erro (saldosComErro) e "Tentar de novo" relê as
 * duas UASGs; a consulta da carteira pede só as colunas dela, sob o prefixo que as telas invalidam.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { saldos, fetchSaldos } = vi.hoisted(() => ({
  saldos: { porUasg: {} as Record<string, any> },
  fetchSaldos: vi.fn()
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: vi.fn(() => ({ data: [], isPending: false, isError: false, isFetching: false, refetch: vi.fn() }))
}));
vi.mock('../../services/dashboardService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/dashboardService')>()),
  fetchArpItemSaldosFromDb: fetchSaldos
}));
vi.mock('../useAta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useAta')>()),
  useAllAtaItemSaldos: (uasg: string) => saldos.porUasg[uasg]
}));

import { useCarteiraItens } from '../useCarteiraItens';
import { getCarteiraSaldosQueryOptions } from '../useAta';
import { COLUNAS_SALDO_CARTEIRA } from '../../services/dashboardService';
import { SaldoItensFalhaNotice } from '../../components/carteira/SaldoItensFalhaNotice';

function consulta(over: Record<string, unknown> = {}) {
  return { data: [], isPending: false, isError: false, isFetching: false, refetch: vi.fn(), ...over };
}

function rodarHook(): ReturnType<typeof useCarteiraItens> {
  let resultado: ReturnType<typeof useCarteiraItens> | undefined;
  const Sonda = () => {
    resultado = useCarteiraItens({ arps: [], itemsByAta: {}, gestorByAta: {} });
    return null;
  };
  renderToStaticMarkup(<Sonda />);
  return resultado!;
}

describe('useCarteiraItens — saldo dos itens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saldos.porUasg = { '200330': consulta(), '200331': consulta() };
  });

  it('sem erro, saldosComErro é falso', () => {
    expect(rodarHook().saldosComErro).toBe(false);
  });

  it('erro em uma das UASGs liga o aviso e "Tentar de novo" relê as duas', () => {
    saldos.porUasg['200331'] = consulta({ isError: true, data: undefined });
    const r = rodarHook();
    expect(r.saldosComErro).toBe(true);
    r.recarregarSaldos();
    expect(saldos.porUasg['200330'].refetch).toHaveBeenCalledTimes(1);
    expect(saldos.porUasg['200331'].refetch).toHaveBeenCalledTimes(1);
  });

  it('enquanto relê, recarregandoSaldos fica ligado', () => {
    saldos.porUasg['200331'] = consulta({ isError: true, isFetching: true });
    expect(rodarHook().recarregandoSaldos).toBe(true);
  });
});

describe('getCarteiraSaldosQueryOptions', () => {
  it('chave sob o prefixo ata-item-saldos e só as colunas da carteira', async () => {
    const opcoes = getCarteiraSaldosQueryOptions(' 200331 ');
    expect(opcoes.queryKey).toEqual(['ata-item-saldos', '200331', 'carteira']);
    fetchSaldos.mockResolvedValueOnce([]);
    await opcoes.queryFn();
    expect(fetchSaldos).toHaveBeenCalledWith('200331', COLUNAS_SALDO_CARTEIRA);
  });

  it('a falha da leitura chega ao React Query como erro', async () => {
    fetchSaldos.mockRejectedValueOnce(new Error('Não foi possível ler o saldo dos itens: timeout'));
    await expect(getCarteiraSaldosQueryOptions('200331').queryFn()).rejects.toThrow('timeout');
  });
});

describe('SaldoItensFalhaNotice', () => {
  it('explica o problema e oferece "Tentar de novo"', () => {
    const html = renderToStaticMarkup(<SaldoItensFalhaNotice onRetry={() => {}} />);
    expect(html).toContain('Não foi possível carregar a situação dos itens');
    expect(html).toContain('Tentar de novo');
  });

  it('enquanto relê, o botão fica desativado', () => {
    const html = renderToStaticMarkup(<SaldoItensFalhaNotice onRetry={() => {}} isRetrying />);
    expect(html).toContain('Carregando…');
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
