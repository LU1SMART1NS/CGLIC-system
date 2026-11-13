import { describe, it, expect } from 'vitest';
import { buildCarteiraItemRows } from '../carteiraItens';

describe('linhas da carteira × divisão na ata', () => {
  const arp = (numero: string) => ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: '200331' }) as any;
  const item = { numeroItem: '00001', quantidadeHomologadaItem: 10 } as any;
  const base = {
    arps: [arp('00001/2025'), arp('00002/2025')],
    itemsByAta: { '00001/2025-200331': [item], '00002/2025-200331': [item] },
    gestorByAta: {}, saldos: [], allocations: [], links: [], empenhos: [],
    prazoOf: () => ({ dias: 100, faixa: 'REGULAR' as const })
  };
  it('marca semDivisaoNaAta só nos itens das atas que não dividem', () => {
    const rows = buildCarteiraItemRows({ ...base, atasSemDivisao: new Set(['00002/2025-200331']) });
    expect(rows.map((r) => [r.ataKey, r.semDivisaoNaAta])).toEqual([['00001/2025-200331', false], ['00002/2025-200331', true]]);
  });
  it('sem a marcação carregada, nenhuma ata fica sem divisão (cobra como antes)', () => {
    expect(buildCarteiraItemRows(base).every((r) => r.semDivisaoNaAta === false)).toBe(true);
  });
});
