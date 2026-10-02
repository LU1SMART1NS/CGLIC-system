import { describe, expect, it } from 'vitest';
import { formatItemKeyLabel, parseItemKey } from '../itemKeyParts';

describe('itemKeyParts', () => {
  it('separa ata, UASG e item da chave canônica', () => {
    expect(parseItemKey('00059/2025-200331-00001')).toEqual({ numeroAta: '00059/2025', uasg: '200331', numeroItem: '00001' });
  });

  it('devolve nulo para chave fora do formato', () => {
    expect(parseItemKey('abc')).toBeNull();
    expect(parseItemKey('')).toBeNull();
  });

  it('monta o texto curto do item e mantém a chave quando não dá para ler', () => {
    expect(formatItemKeyLabel('00059/2025-200331-00012')).toBe('Ata 00059/2025 · Item 12');
    expect(formatItemKeyLabel('xyz')).toBe('xyz');
  });
});
