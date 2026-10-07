import { describe, it, expect, vi } from 'vitest';

let linhas: unknown[] = [];
const filtros: string[] = [];
vi.mock('../supabaseClient', () => {
  const q: any = {
    select: () => q,
    in: () => q,
    not: (c: string, op: string, v: unknown) => { filtros.push(`${c} not ${op} ${v}`); return q; },
    order: () => q,
    range: () => q,
    then: (resolve: (r: unknown) => void) => resolve({ data: linhas, error: null })
  };
  return { supabase: { from: () => q }, isSupabaseConfigured: true };
});

import { fetchItemNosContratos } from '../itensContratoService';

describe('fetchItemNosContratos', () => {
  it('lê só itens com número; marca o contrato como lido e soma a quantidade do item', async () => {
    linhas = [
      { contract_key: '200331-00010-2026', numero_item: 4, quantidade: '20', posicao: 1 },
      { contract_key: '200331-00010-2026', numero_item: 4, quantidade: 7, posicao: 2 },
      { contract_key: '200331-00011-2026', numero_item: 9, quantidade: 5, posicao: 1 }
    ];
    const r = await fetchItemNosContratos(['200331-00010-2026', '200331-00011-2026', '200331-00090-2025'], 4);
    expect(filtros).toContain('numero_item not is null');
    expect([...r.comItensLidos].sort()).toEqual(['200331-00010-2026', '200331-00011-2026']);
    expect([...r.quantidadePorContrato]).toEqual([['200331-00010-2026', 27]]);
  });

  it('sem chaves ou com item inválido não consulta', async () => {
    expect((await fetchItemNosContratos([], 4)).comItensLidos.size).toBe(0);
    expect((await fetchItemNosContratos(['x'], NaN)).comItensLidos.size).toBe(0);
  });
});
