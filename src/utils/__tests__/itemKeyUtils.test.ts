import { describe, it, expect } from 'vitest';
import {
  normalizeItemNumber,
  normalizeUasg,
  normalizeAtaNumber,
  normalizeItemKey,
  parseItemKey
} from '../itemKeyUtils';

describe('itemKeyUtils - Normalização Canônica e Business Key (SaldoARP 3.0)', () => {
  describe('normalizeItemNumber', () => {
    it('deve padronizar inteiros e strings para 5 dígitos com zeros à esquerda', () => {
      expect(normalizeItemNumber(1)).toBe('00001');
      expect(normalizeItemNumber('1')).toBe('00001');
      expect(normalizeItemNumber('01')).toBe('00001');
      expect(normalizeItemNumber('001')).toBe('00001');
      expect(normalizeItemNumber('00001')).toBe('00001');
      expect(normalizeItemNumber(42)).toBe('00042');
      expect(normalizeItemNumber('150')).toBe('00150');
      expect(normalizeItemNumber(9999)).toBe('09999');
    });

    it('deve extrair dígitos de strings com rótulo (ex: "Item 02" -> "00002")', () => {
      expect(normalizeItemNumber('Item 2')).toBe('00002');
      expect(normalizeItemNumber('Item 00005')).toBe('00005');
    });

    it('deve retornar "00001" como fallback seguro para valores nulos ou inválidos', () => {
      expect(normalizeItemNumber(null)).toBe('00001');
      expect(normalizeItemNumber(undefined)).toBe('00001');
      expect(normalizeItemNumber('')).toBe('00001');
      expect(normalizeItemNumber('abc')).toBe('00001');
      expect(normalizeItemNumber(0)).toBe('00001');
    });
  });

  describe('normalizeUasg', () => {
    it('deve limpar caracteres não numéricos e preservar o código da UASG', () => {
      expect(normalizeUasg('200331')).toBe('200331');
      expect(normalizeUasg(200331)).toBe('200331');
      expect(normalizeUasg('UASG 200331')).toBe('200331');
      expect(normalizeUasg(' 200330 ')).toBe('200330');
    });

    it('deve usar 200331 como fallback padrão se não informado', () => {
      expect(normalizeUasg(null)).toBe('200331');
      expect(normalizeUasg(undefined)).toBe('200331');
      expect(normalizeUasg('')).toBe('200331');
    });
  });

  describe('normalizeAtaNumber', () => {
    it('deve padronizar o número da ata com 5 dígitos no número e 4 dígitos no ano', () => {
      expect(normalizeAtaNumber('37/2026')).toBe('00037/2026');
      expect(normalizeAtaNumber('00037/2026')).toBe('00037/2026');
      expect(normalizeAtaNumber('1/2025')).toBe('00001/2025');
      expect(normalizeAtaNumber('00001/25')).toBe('00001/2025');
    });

    it('deve manter o valor limpo se não contiver barra', () => {
      expect(normalizeAtaNumber('Ata01')).toBe('Ata01');
      expect(normalizeAtaNumber('')).toBe('');
      expect(normalizeAtaNumber(null)).toBe('');
    });
  });

  describe('normalizeItemKey', () => {
    it('deve gerar chave canônica idêntica e determinística para representações equivalentes', () => {
      const key1 = normalizeItemKey('00037/2026', '200331', '00001');
      const key2 = normalizeItemKey('37/2026', '200331', 1);
      const key3 = normalizeItemKey('00037/2026', 200331, '1');
      const key4 = normalizeItemKey('37/2026', 'UASG 200331', 'Item 01');

      expect(key1).toBe('00037/2026-200331-00001');
      expect(key2).toBe('00037/2026-200331-00001');
      expect(key3).toBe('00037/2026-200331-00001');
      expect(key4).toBe('00037/2026-200331-00001');

      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
      expect(key3).toBe(key4);
    });

    it('não deve colidir chaves para itens diferentes ou atas diferentes', () => {
      const keyItem1 = normalizeItemKey('00037/2026', '200331', 1);
      const keyItem2 = normalizeItemKey('00037/2026', '200331', 2);
      const keyAta2 = normalizeItemKey('00038/2026', '200331', 1);
      const keyUasg2 = normalizeItemKey('00037/2026', '200330', 1);

      expect(keyItem1).not.toBe(keyItem2);
      expect(keyItem1).not.toBe(keyAta2);
      expect(keyItem1).not.toBe(keyUasg2);
    });
  });

  describe('parseItemKey', () => {
    it('deve decompor chaves canônicas com precisão e tolerância de formato', () => {
      const parsed1 = parseItemKey('00037/2026-200331-00001');
      expect(parsed1.numeroAta).toBe('00037/2026');
      expect(parsed1.uasg).toBe('200331');
      expect(parsed1.itemNum).toBe('00001');
      expect(parsed1.itemNumInteger).toBe(1);

      const parsed2 = parseItemKey('37/2026-200331-1');
      expect(parsed2.numeroAta).toBe('00037/2026');
      expect(parsed2.uasg).toBe('200331');
      expect(parsed2.itemNum).toBe('00001');
      expect(parsed2.itemNumInteger).toBe(1);
    });

    it('deve manter invariante de ida e volta (round-trip)', () => {
      const originalKey = '00042/2025-200331-00003';
      const parsed = parseItemKey(originalKey);
      const reconstructedKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

      expect(reconstructedKey).toBe(originalKey);
    });
  });
});
