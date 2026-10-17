/**
 * Passo 3 da auditoria das telas (6e): a Carteira de Atas não chama o Compras.gov.br nem o PNCP pelo navegador. Os
 * itens vêm só do banco (quem grava é a sincronização do servidor). Ata ainda sem itens no banco: a faixa diz quais.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { fontes } = vi.hoisted(() => ({ fontes: { itensDaAta: vi.fn() } }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<typeof import('../../services/api')>()), fetchArpItems: fontes.itensDaAta }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ role: 'admin', user: { id: 'u1' } }) }));

import { useAtasPortfolio, ROTULO_ITENS_NAS_FONTES } from '../useAtasPortfolio';
import type { ArpItemRecord, ArpRecord } from '../../types';

const ata = (numero: string) =>
  ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: '200331', uasgCarteira: '200331', dataVigenciaFinal: '2030-01-01' }) as unknown as ArpRecord;
const item = { numeroItem: '1' } as unknown as ArpItemRecord;

function rodar(client: QueryClient) {
  return renderizar(client, () => useAtasPortfolio());
}

function renderizar<T>(client: QueryClient, hook: () => T): T {
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

function comAtas(arps: ArpRecord[], itemsByAta: Record<string, ArpItemRecord[]>) {
  const client = new QueryClient();
  client.setQueryData(['ata-detail-source', '200330'], { arps: [], itemsByAta: {}, syncInfo: { isCachedInDb: false } });
  client.setQueryData(['ata-detail-source', '200331'], { arps, itemsByAta, syncInfo: { isCachedInDb: true } });
  return client;
}

describe('Carteira de Atas: itens só do banco', () => {
  beforeEach(() => fontes.itensDaAta.mockReset());

  it('todas as atas com itens: sem faixa, os itens são os do banco e nenhuma fonte oficial é chamada', () => {
    const itemsByAta = { '00010/2024-200331': [item], '00043/2026-200331': [item] };
    const r = rodar(comAtas([ata('00010/2024'), ata('00043/2026')], itemsByAta));
    expect(r.itemsByAta).toEqual(itemsByAta);
    expect(r.leituraDosItensNasFontes).toBeNull();
    expect(fontes.itensDaAta).not.toHaveBeenCalled();
    expect('loadItemsForArps' in r).toBe(false);
  });

  it('ata ainda sem itens no banco: a faixa diz qual, sem chamar o Compras.gov.br ou o PNCP', () => {
    const r = rodar(comAtas([ata('00010/2024'), ata('00043/2026')], { '00010/2024-200331': [item] }));
    expect(r.leituraDosItensNasFontes?.rotulo).toBe(ROTULO_ITENS_NAS_FONTES);
    const consulta = r.leituraDosItensNasFontes?.query as { error: Error } | undefined;
    expect(consulta?.error.message).toContain('a ata 00043/2026 ainda sem itens no banco');
    expect(r.itemsByAta['00043/2026-200331']).toBeUndefined();
    expect(fontes.itensDaAta).not.toHaveBeenCalled();
  });

  it('enquanto as atas carregam, nenhuma ata conta como sem itens', () => {
    expect(rodar(new QueryClient()).leituraDosItensNasFontes).toBeNull();
  });
});
