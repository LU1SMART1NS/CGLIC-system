import { describe, it, expect, vi } from 'vitest';

const respostas: Record<string, any> = {
  v_contrato_faturas: { data: [], error: null },
  v_contrato_faturas_resumo: {
    data: {
      contract_key: '200331-00094-2022', faturas: 40, valor_faturado: '1000.50', valor_liquidado: '900', valor_pago: '700',
      liquidadas_sem_pagamento: 14, faturas_com_ne_sem_vinculo: 0, ultima_liquidacao: '2026-10-07', ultimo_pagamento: '2026-10-06',
      liquidadas_sem_np: 9
    },
    error: null
  },
  contrato_faturas_sincronizacao: { data: { sincronizado_em: '2026-10-14T10:11:00Z' }, error: null }
};
function consulta(tabela: string) {
  const fim = Promise.resolve(respostas[tabela]);
  const q: any = { select: () => q, eq: () => q, order: () => fim, maybeSingle: () => fim };
  return q;
}
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: (t: string) => consulta(t) } }));

import { fetchFaturasDoContrato } from '../faturasService';

describe('fetchFaturasDoContrato: resumo do contrato', () => {
  it('separa as liquidadas aguardando OB (com NP) das liquidadas sem NP (migration 122)', async () => {
    const r = await fetchFaturasDoContrato('200331-00094-2022');
    expect(r.resumo).toMatchObject({ liquidadasSemPagamento: 14, liquidadasSemNp: 9, valorFaturado: 1000.5, valorPago: 700 });
    expect(r.sincronizadoEm).toBe('2026-10-14T10:11:00Z');
  });

  it('view antiga, sem a coluna nova, dá zero sem quebrar', async () => {
    const { liquidadas_sem_np: _fora, ...antigo } = respostas.v_contrato_faturas_resumo.data;
    respostas.v_contrato_faturas_resumo = { data: antigo, error: null };
    const r = await fetchFaturasDoContrato('200331-00094-2022');
    expect(r.resumo?.liquidadasSemNp).toBe(0);
  });
});
