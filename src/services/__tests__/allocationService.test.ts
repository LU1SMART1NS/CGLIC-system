import { describe, it, expect, beforeEach, vi } from 'vitest';

// Polyfill de localStorage para ambiente Node no vitest
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; }
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = createLocalStorageMock();
}

import {
  fetchEmpenhoLinksWithState,
  fetchEmpenhoLinks,
  saveEmpenhoLinks
} from '../allocationService';

describe('allocationService - Persistência Híbrida (Supabase + LocalStorage)', () => {
  const itemKey = '00024/2026-200331-00002';

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Vínculos de Empenhos (empenho_links)', () => {
    it('deve salvar e ler vínculos de empenhos do localStorage em modo fallback', async () => {
      const mockLinks = {
        '2026NE000123': 'alloc-1',
        '2026NE000124': 'alloc-2'
      };

      await saveEmpenhoLinks(itemKey, mockLinks, 1);
      const state = await fetchEmpenhoLinksWithState(itemKey);

      expect(state.links).toEqual(mockLinks);
      expect(state.version).toBe(1);

      const rawLinks = await fetchEmpenhoLinks(itemKey);
      expect(rawLinks).toEqual(mockLinks);
    });
  });
});
