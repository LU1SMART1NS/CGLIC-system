import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const leituras = vi.hoisted(() => ({ saldo: [] as Array<{ uasg?: string; colunas?: readonly string[] }>, avisos: 0, alocacoes: 0 }));

vi.mock('../../services/dashboardService', async (orig) => ({
  ...(await orig<typeof import('../../services/dashboardService')>()),
  fetchArpItemSaldosFromDb: vi.fn(async (uasg?: string, colunas?: readonly string[]) => {
    leituras.saldo.push({ uasg, colunas });
    return [{ item_key: 'k1', numero_ata: '00010/2024', descricao_item: 'Colete', quantidade_homologada: 10 }];
  })
}));
vi.mock('../../services/avisosResolvidosService', async (orig) => ({
  ...(await orig<typeof import('../../services/avisosResolvidosService')>()),
  fetchAvisosResolvidos: vi.fn(async () => (leituras.avisos++, [{ chave: 'aviso-1' }]))
}));
vi.mock('../../services/allocationService', async (orig) => ({
  ...(await orig<typeof import('../../services/allocationService')>()),
  fetchAllAllocationsGlobal: vi.fn(async () => (leituras.alocacoes++, [{ id: 1, itemKey: 'k1', unitName: 'CAEP', allocatedQty: 1, empenhadaQty: 0 }]))
}));

import { fontesDoPainelNoCache } from '../useManagementDashboard';
import { getCarteiraSaldosQueryOptions, getSaldosCompletosQueryOptions } from '../useAta';
import { getAvisosResolvidosQueryOptions } from '../useAvisosResolvidos';
import { getAlocacoesQueryOptions } from '../useCarteiraItens';

describe('painel e telas leem pela mesma chave (18/11/2026)', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    leituras.saldo = [];
    leituras.avisos = 0;
    leituras.alocacoes = 0;
  });

  it('o painel aproveita avisos resolvidos, alocações e saldo completo que a tela já leu', async () => {
    await client.fetchQuery(getAvisosResolvidosQueryOptions());
    await client.fetchQuery(getAlocacoesQueryOptions());
    await client.fetchQuery(getSaldosCompletosQueryOptions('200331'));
    const fontes = fontesDoPainelNoCache(client);
    expect(await fontes.avisosResolvidos()).toEqual([{ chave: 'aviso-1' }]);
    expect((await fontes.alocacoes()).map((a) => a.itemKey)).toEqual(['k1']);
    expect(await fontes.saldoItens('200331')).toHaveLength(1);
    expect([leituras.avisos, leituras.alocacoes, leituras.saldo.length]).toEqual([1, 1, 1]);
  });

  it('o saldo só com as colunas da carteira sai do saldo completo já lido, sem nova consulta', async () => {
    await client.fetchQuery(getSaldosCompletosQueryOptions('200331'));
    const carteira = await client.fetchQuery(getCarteiraSaldosQueryOptions('200331'));
    expect(leituras.saldo).toHaveLength(1);
    expect(carteira[0]).toMatchObject({ numero_ata: '00010/2024', quantidade_homologada: 10 });
    expect(carteira[0]).not.toHaveProperty('descricao_item');
  });

  it('sem o completo no cache, ou com ele invalidado, a carteira lê as colunas dela', async () => {
    await client.fetchQuery(getCarteiraSaldosQueryOptions('200331'));
    expect(leituras.saldo.at(-1)?.colunas?.length).toBeGreaterThan(0);

    await client.fetchQuery(getSaldosCompletosQueryOptions('200330'));
    await client.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    leituras.saldo = [];
    await client.fetchQuery(getCarteiraSaldosQueryOptions('200330'));
    expect(leituras.saldo.map((l) => Boolean(l.colunas?.length))).toEqual([true]);
  });
});
