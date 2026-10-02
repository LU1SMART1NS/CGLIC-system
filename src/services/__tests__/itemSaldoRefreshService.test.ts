import { describe, it, expect } from 'vitest';
import { pickStaleLinksByContract } from '../itemSaldoRefreshService';

describe('pickStaleLinksByContract', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const links = [
    { item_key: '00059/2026-200331-00001', contract_key: '200331-00010-2026', quantidade_lida_em: null },
    { item_key: '00059/2026-200331-00002', contract_key: '200331-00010-2026', quantidade_lida_em: '2026-10-02T11:00:00Z' },
    { item_key: '00060/2026-200331-00001', contract_key: '200331-00011-2026', quantidade_lida_em: '2026-10-02T01:00:00Z' },
    { item_key: '00061/2026-200331-00001', contract_key: '200331-00012-2026', quantidade_lida_em: '2026-10-02T11:30:00Z' }
  ];

  it('pega só o que nunca foi lido ou tem mais de 6 horas, agrupado por contrato', () => {
    const r = pickStaleLinksByContract(links, now);
    expect([...r.keys()].sort()).toEqual(['200331-00010-2026', '200331-00011-2026']);
    expect(r.get('200331-00010-2026')).toHaveLength(1);
  });

  it('com force relê tudo', () => {
    expect(pickStaleLinksByContract(links, now, true).size).toBe(3);
  });
});
