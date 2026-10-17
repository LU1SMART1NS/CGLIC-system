/**
 * Sem banco configurado (só nos testes): não há mais cópia no navegador. Leituras devolvem vazio na versão 1 e
 * gravações recusam com erro, em vez de gravar numa cópia que nenhuma tela lê.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import {
  fetchAllAllocationsGlobal,
  fetchAllocationsWithState,
  fetchEmpenhoLinksWithState,
  saveAllocations,
  saveEmpenhoLinks
} from '../allocationService';

describe('allocationService sem banco configurado', () => {
  const itemKey = '00024/2026-200331-00002';

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('gravar alocações ou vínculos recusa com erro e não deixa cópia no navegador', async () => {
    await expect(saveAllocations(itemKey, [{ id: 'a1', unitName: 'DPRF', allocatedQty: 10, empenhadaQty: 0 }], 1)).rejects.toBeTruthy();
    await expect(saveEmpenhoLinks(itemKey, { '2026NE000123': 'a1' }, 1)).rejects.toBeTruthy();
    expect(localStorage.length).toBe(0);
  });

  it('ler devolve vazio na versão 1, mesmo com uma cópia antiga no navegador', async () => {
    localStorage.setItem(`saldoarp-allocations-${itemKey}`, JSON.stringify([{ id: 'velha', unitName: 'DPF', allocatedQty: 99, empenhadaQty: 0 }]));
    localStorage.setItem(`saldoarp-empenho-links-${itemKey}`, JSON.stringify({ '2026NE000001': 'velha' }));

    expect(await fetchAllocationsWithState(itemKey)).toEqual({ allocations: [], version: 1 });
    expect(await fetchEmpenhoLinksWithState(itemKey)).toEqual({ links: {}, version: 1 });
    expect(await fetchAllAllocationsGlobal()).toEqual([]);
  });
});
