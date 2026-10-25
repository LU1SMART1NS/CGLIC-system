/**
 * Telas 360 lendo um instrumento só (passo 3 da auditoria das telas, 6c). Para a Ata 360, os contratos vinculados e
 * as fatias de GTI: com a lista da carteira no navegador, o instrumento sai dela (sem pedido) e é o mesmo que a tela
 * achava na lista; sem ela, a consulta pede só o instrumento.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { leituras } = vi.hoisted(() => ({
  leituras: { ata: vi.fn(), contratos: vi.fn(), fatias: vi.fn() }
}));
vi.mock('../../services/dbCacheService', async (orig) => ({
  ...(await orig<typeof import('../../services/dbCacheService')>()),
  fetchAtaWithItemsFromDb: leituras.ata
}));
vi.mock('../../services/contratosOficiaisService', async (orig) => ({
  ...(await orig<typeof import('../../services/contratosOficiaisService')>()),
  fetchContratosParaTelaPorChaves: leituras.contratos
}));
vi.mock('../../services/gruposGtiService', async (orig) => ({
  ...(await orig<typeof import('../../services/gruposGtiService')>()),
  fetchFatiasGti: leituras.fatias
}));

import { getAtaUnicaQueryOptions, numeroDaAtaKey, useAta } from '../useAta';
import { useContratosPorChave } from '../useContratosPorChave';
import { useFatiasGtiDaAtaLeitura } from '../useGruposGti';
import { enrichContractLinks } from '../../services/arpContractLinkService';
import type { ArpItemRecord, ArpRecord, ContractDashboardRecord } from '../../types';

function rodar<T>(client: QueryClient, hook: () => T): T {
  let r: T | undefined;
  const Sonda = () => {
    r = hook();
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Sonda />
    </QueryClientProvider>
  );
  return r!;
}

const ata = (numero: string, uasg = '200331') =>
  ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: uasg, objeto: `Ata ${numero}` }) as unknown as ArpRecord;
const itens = (numero: string) => [{ numeroItem: '1', numeroAtaRegistroPreco: numero } as unknown as ArpItemRecord];
const listaDeAtas = {
  arps: [ata('00010/2024'), ata('00043/2026'), ata('00043/2026', '200109')],
  itemsByAta: { '00010/2024-200331': itens('00010/2024'), '00043/2026-200331': itens('00043/2026') },
  syncInfo: { isCachedInDb: true }
};

describe('Ata 360 e Item 360: uma ata só', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com as atas da UASG no navegador: a ata e os itens saem da lista, sem ler o banco', () => {
    const client = new QueryClient();
    client.setQueryData(['ata-detail-source', '200331'], listaDeAtas);
    const r = rodar(client, () => useAta('00043/2026-200331', '200331'));
    expect(r.arp).toBe(listaDeAtas.arps[1]);
    expect(r.itens).toBe(listaDeAtas.itemsByAta['00043/2026-200331']);
    expect(r.isLoading).toBe(false);
    expect(leituras.ata).not.toHaveBeenCalled();
  });

  it('a mesma ata de outro órgão (mesmo número) não se confunde com a da CGLIC', () => {
    const client = new QueryClient();
    client.setQueryData(['ata-detail-source', '200331'], listaDeAtas);
    expect(rodar(client, () => useAta('00043/2026-200109', '200109')).arp).toBeNull();
  });

  it('sem a lista: lê só a ata pelo número e pela UASG, sob o prefixo das atas da UASG', async () => {
    leituras.ata.mockResolvedValue({ arps: [], itemsByAta: {}, syncInfo: { isCachedInDb: false } });
    expect(numeroDaAtaKey('00059/2025-200331')).toBe('00059/2025');
    const opcoes = getAtaUnicaQueryOptions('00059/2025-200331', '200331');
    expect(opcoes.queryKey).toEqual(['ata-detail-source', '200331', 'ata', '00059/2025']);
    await opcoes.queryFn();
    expect(leituras.ata).toHaveBeenCalledWith('00059/2025', '200331');
  });
});

const contrato = (numero: string, ano = 2025) =>
  ({ id: `200331-${numero}-${ano}`, uasg: '200331', numero, ano, fornecedorNome: `F ${numero}` }) as unknown as ContractDashboardRecord;
const carteira = [contrato('00001'), contrato('00002'), contrato('00003')];
const vinculos = [
  { id: 'l1', itemKey: '00043/2026-200331-1', contractKey: '200331-00002-2025' },
  { id: 'l2', itemKey: '00043/2026-200331-2', contractKey: '200331-00009-2025' }
] as any[];

describe('contratos vinculados por chave', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com a carteira no navegador: só os vinculados, sem ler o banco, e o enriquecimento é o mesmo da lista inteira', () => {
    const client = new QueryClient();
    client.setQueryData(['contracts-dashboard', '200331'], carteira);
    const r = rodar(client, () => useContratosPorChave('200331', vinculos.map((v) => v.contractKey)));
    expect(r.data).toEqual([carteira[1]]);
    expect(leituras.contratos).not.toHaveBeenCalled();
    expect(enrichContractLinks(vinculos, r.data ?? [])).toEqual(enrichContractLinks(vinculos, carteira));
  });

  it('sem vínculos (ou enquanto eles carregam), não pede nada', () => {
    const r = rodar(new QueryClient(), () => useContratosPorChave('200331', undefined));
    expect(r.fetchStatus).toBe('idle');
    expect(r.data).toBeUndefined();
  });

  it('sem a carteira: pede só as chaves vinculadas', async () => {
    leituras.contratos.mockResolvedValue([carteira[1]]);
    const client = new QueryClient();
    rodar(client, () => useContratosPorChave('200331', vinculos.map((v) => v.contractKey)));
    const consulta = client.getQueryCache().find({ queryKey: ['contracts-dashboard', '200331', 'chaves', '200331-00002-2025,200331-00009-2025'] });
    expect(consulta).toBeDefined();
    await consulta!.fetch();
    expect(leituras.contratos).toHaveBeenCalledWith('200331', ['200331-00002-2025', '200331-00009-2025']);
  });
});

describe('fatias de GTI de uma ata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com as fatias de todas as atas no navegador: só a da ata, sem ler o banco', () => {
    const daAta = { total: 10 } as any;
    const client = new QueryClient();
    client.setQueryData(['gti-fatias'], new Map([['00043/2026-200331', daAta], ['00010/2024-200331', { total: 3 }]]));
    const r = rodar(client, () => useFatiasGtiDaAtaLeitura('00043/2026', '200331'));
    expect([...r.fatias]).toEqual([['00043/2026-200331', daAta]]);
    expect(leituras.fatias).not.toHaveBeenCalled();
  });

  it('ata sem fatia na lista: vazio (a lista tem todas), sem ler o banco', () => {
    const client = new QueryClient();
    client.setQueryData(['gti-fatias'], new Map());
    expect(rodar(client, () => useFatiasGtiDaAtaLeitura('00043/2026', '200331')).fatias.size).toBe(0);
    expect(leituras.fatias).not.toHaveBeenCalled();
  });

  it('ata de outro órgão: a consulta fica desligada', () => {
    const r = rodar(new QueryClient(), () => useFatiasGtiDaAtaLeitura('00043/2026', '200109', { enabled: false }));
    expect(r.consulta.fetchStatus).toBe('idle');
  });
});
