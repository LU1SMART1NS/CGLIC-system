/**
 * Item 360, Alocação e Carteira de Itens com o banco configurado: as alocações e os vínculos nota → unidade vêm só do
 * banco. Antes, se a leitura falhasse, a tela recebia a cópia guardada no navegador com versão 1 como se fosse sucesso,
 * e a limpeza automática do Item 360 podia gravar por cima do que outra pessoa salvou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { banco, from } = vi.hoisted(() => {
  const banco = {
    tabelas: {} as Record<string, any[]>,
    erros: {} as Record<string, { message: string } | undefined>
  };
  const from = (tabela: string) => {
    const filtros: Array<(r: any) => boolean> = [];
    const resposta = () => {
      const erro = banco.erros[tabela];
      return erro ? { data: null, error: erro } : { data: (banco.tabelas[tabela] ?? []).filter((r) => filtros.every((f) => f(r))), error: null };
    };
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtros.push((r) => r[c] === v), q),
      order: () => q,
      range: async (de: number, ate: number) => {
        const r = resposta();
        return r.error ? r : { data: r.data!.slice(de, ate + 1), error: null };
      },
      maybeSingle: async () => {
        const r = resposta();
        return r.error ? r : { data: r.data![0] ?? null, error: null };
      },
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, falha)
    };
    return q;
  };
  return { banco, from };
});

vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from } }));

const memoria: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => memoria[k] ?? null,
  setItem: (k: string, v: string) => {
    memoria[k] = String(v);
  },
  removeItem: (k: string) => {
    delete memoria[k];
  },
  clear: () => Object.keys(memoria).forEach((k) => delete memoria[k]),
  key: (i: number) => Object.keys(memoria)[i] ?? null,
  get length() {
    return Object.keys(memoria).length;
  }
};

import { fetchAllAllocationsGlobal, fetchAllocationsWithState, fetchEmpenhoLinksWithState } from '../allocationService';

const itemKey = '00024/2026-200331-00002';
const copiaVelhaAlocacoes = [{ id: 'velha', unitName: 'DPF', allocatedQty: 99, empenhadaQty: 0 }];
const copiaVelhaVinculos = { '2026NE000001': 'velha' };

describe('allocationService com o banco configurado: sem a cópia do navegador', () => {
  beforeEach(() => {
    localStorage.clear();
    banco.tabelas = {
      item_allocation_state: [{ item_key: itemKey, version: 7 }],
      arp_allocations: [{ id: 'a1', item_key: itemKey, unit_name: 'DPRF', allocated_qty: 10, empenhada_qty: 0 }],
      item_empenho_link_state: [{ item_key: itemKey, version: 4 }],
      empenho_links: [{ item_key: itemKey, empenho_numero: '2026NE000002', allocation_id: 'a1' }]
    };
    banco.erros = {};
    localStorage.setItem(`saldoarp-allocations-${itemKey}`, JSON.stringify(copiaVelhaAlocacoes));
    localStorage.setItem(`saldoarp-empenho-links-${itemKey}`, JSON.stringify(copiaVelhaVinculos));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('leitura certa: devolve o banco com a versão do banco, e não a cópia', async () => {
    expect(await fetchAllocationsWithState(itemKey)).toEqual({
      allocations: [{ id: 'a1', unitName: 'DPRF', allocatedQty: 10, empenhadaQty: 0 }],
      version: 7
    });
    expect(await fetchEmpenhoLinksWithState(itemKey)).toEqual({ links: { '2026NE000002': 'a1' }, version: 4 });
  });

  it('falha ao ler as alocações vira erro, mesmo com a cópia no navegador', async () => {
    banco.erros.arp_allocations = { message: 'tempo esgotado' };
    await expect(fetchAllocationsWithState(itemKey)).rejects.toThrow(/Não foi possível ler as alocações do item: tempo esgotado/);
  });

  it('falha ao ler a versão das alocações vira erro', async () => {
    banco.erros.item_allocation_state = { message: 'sem conexão' };
    await expect(fetchAllocationsWithState(itemKey)).rejects.toThrow(/sem conexão/);
  });

  it('falha ao ler os vínculos (ou a versão deles) vira erro, mesmo com a cópia no navegador', async () => {
    banco.erros.empenho_links = { message: 'tempo esgotado' };
    await expect(fetchEmpenhoLinksWithState(itemKey)).rejects.toThrow(/vínculos das notas às unidades: tempo esgotado/);
    banco.erros = { item_empenho_link_state: { message: 'sem conexão' } };
    await expect(fetchEmpenhoLinksWithState(itemKey)).rejects.toThrow(/sem conexão/);
  });

  it('todas as alocações: falha vira erro, e banco sem alocações devolve vazio (não a cópia)', async () => {
    banco.erros.arp_allocations = { message: 'tempo esgotado' };
    await expect(fetchAllAllocationsGlobal()).rejects.toMatchObject({ message: 'tempo esgotado' });
    banco.erros = {};
    banco.tabelas.arp_allocations = [];
    expect(await fetchAllAllocationsGlobal()).toEqual([]);
  });
});
