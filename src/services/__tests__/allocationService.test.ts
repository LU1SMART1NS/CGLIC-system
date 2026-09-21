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
  fetchManualEmpenhos,
  saveManualEmpenhos,
  fetchManualContratos,
  saveManualContratos,
  fetchContratoEmpenhoLinks,
  saveContratoEmpenhoLinks,
  fetchEmpenhoManualQuantities,
  saveEmpenhoManualQuantities,
  removeEmpenhoManualQuantity,
  fetchEmpenhoLinksWithState,
  fetchEmpenhoLinks,
  saveEmpenhoLinks
} from '../allocationService';

import type { Empenho, Contrato, ContratoEmpenho } from '../../types';

describe('allocationService - Persistência Híbrida (Supabase + LocalStorage)', () => {
  const itemKey = '00024/2026-200331-00002';

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Empenhos Manuais', () => {
    const mockEmpenhos: Empenho[] = [
      {
        id: 'manual-emp-1',
        numero: '2026NE000459',
        ano: 2026,
        arpId: '00024/2026',
        itemId: '00002',
        uasg: '200331',
        quantidade: 40,
        valorUnitario: 136900,
        valorTotal: 5476000,
        fornecedor: 'SAFETY WALL DEFESA E SEGURANCA LTDA.',
        origem: 'MANUAL',
        status: 'CONFIRMADO',
        criadoEm: '2026-09-04T00:00:00.000Z',
        atualizadoEm: '2026-09-04T00:00:00.000Z'
      }
    ];

    it('deve salvar no localStorage e persistir dados', async () => {
      await saveManualEmpenhos(itemKey, mockEmpenhos, 1);
      const stored = localStorage.getItem(`saldoarp-manual-empenhos-${itemKey}`);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toHaveLength(1);
    });

    it('deve ler empenhos manuais do localStorage em caso de fallback/offline', async () => {
      localStorage.setItem(`saldoarp-manual-empenhos-${itemKey}`, JSON.stringify(mockEmpenhos));
      const result = await fetchManualEmpenhos(itemKey);
      expect(result).toHaveLength(1);
      expect(result[0].numero).toBe('2026NE000459');
      expect(result[0].quantidade).toBe(40);
    });
  });

  describe('Contratos Manuais', () => {
    const mockContratos: Contrato[] = [
      {
        id: 'manual-contrato-1',
        numero: '01/2026',
        ano: 2026,
        arpId: '00024/2026',
        itemId: '00002',
        uasg: '200331',
        fornecedor: 'SAFETY WALL DEFESA E SEGURANCA LTDA.',
        quantidadeContratada: 40,
        valorTotal: 5476000,
        origem: 'MANUAL',
        criadoEm: '2026-09-04T00:00:00.000Z',
        atualizadoEm: '2026-09-04T00:00:00.000Z'
      }
    ];

    it('deve salvar e ler contratos manuais com integridade', async () => {
      await saveManualContratos(itemKey, mockContratos);
      const result = await fetchManualContratos(itemKey);
      expect(result).toHaveLength(1);
      expect(result[0].numero).toBe('01/2026');
      expect(result[0].valorTotal).toBe(5476000);
    });
  });

  describe('Links Contrato-Empenho', () => {
    const mockLinks: ContratoEmpenho[] = [
      {
        id: 'link-1',
        contratoId: 'manual-contrato-1',
        empenhoId: 'manual-emp-1',
        quantidadeVinculada: 40,
        dataVinculo: '2026-09-04T00:00:00.000Z',
        origem: 'MANUAL'
      }
    ];

    it('deve salvar e ler links contrato-empenho', async () => {
      await saveContratoEmpenhoLinks(itemKey, mockLinks);
      const result = await fetchContratoEmpenhoLinks(itemKey);
      expect(result).toHaveLength(1);
      expect(result[0].contratoId).toBe('manual-contrato-1');
      expect(result[0].empenhoId).toBe('manual-emp-1');
    });
  });

  describe('Quantidades Manuais de Empenho', () => {
    it('deve salvar, ler e remover quantidades ajustadas manualmente', async () => {
      const quantities = { '2026NE000459': 35, '2026NE000173': 2 };
      await saveEmpenhoManualQuantities(itemKey, quantities, 1);

      let fetched = await fetchEmpenhoManualQuantities(itemKey);
      expect(fetched['2026NE000459']).toBe(35);
      expect(fetched['2026NE000173']).toBe(2);

      await removeEmpenhoManualQuantity(itemKey, '2026NE000459', 1);
      const afterRemoval = await fetchEmpenhoManualQuantities(itemKey);
      expect(afterRemoval['2026NE000459']).toBeUndefined();
      expect(afterRemoval['2026NE000173']).toBe(2);
    });
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
