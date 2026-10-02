import { describe, it, expect } from 'vitest';
import { toPendingItems } from '../itemSenaspBatchService';

describe('toPendingItems', () => {
  it('descarta linhas incompletas e duplicadas', () => {
    const r = toPendingItems([
      { numero_ata: '00059/2025', codigo_uasg: '200331', numero_item: 1 },
      { numero_ata: '00059/2025', codigo_uasg: '200331', numero_item: '1' },
      { numero_ata: '00059/2025', codigo_uasg: null, numero_item: 2 },
      { numero_ata: '00036/2024', codigo_uasg: '200331', numero_item: '00002' }
    ]);
    expect(r).toEqual([
      { numeroAta: '00059/2025', uasg: '200331', numeroItem: '1' },
      { numeroAta: '00036/2024', uasg: '200331', numeroItem: '00002' }
    ]);
  });
});
