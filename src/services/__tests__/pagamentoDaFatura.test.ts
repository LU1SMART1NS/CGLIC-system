import { describe, it, expect, vi, beforeEach } from 'vitest';

const tabelas: Record<string, { data: any; error?: any }> = {};

vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (tabela: string) => {
      const q: any = {};
      for (const m of ['select', 'eq', 'in']) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({ data: tabelas[tabela].data, error: tabelas[tabela].error ?? null });
      q.then = (ok: any, no: any) => Promise.resolve({ data: tabelas[tabela].data, error: tabelas[tabela].error ?? null }).then(ok, no);
      return q;
    }
  }
}));

import { fetchPagamentoDaFatura } from '../pagamentoDaFaturaService';

describe('pagamento da fatura pela OB', () => {
  beforeEach(() => {
    tabelas.fatura_pagamento = { data: { ordens_bancarias: '2024OB073730' } };
    tabelas.contrato_faturas = { data: { np: '2024NP000478' } };
    tabelas.ordens_bancarias = { data: [{ numero: '2024OB073730', emissao: '2024-08-21', valor: '2333.27', empenhos: ['2024NE000566', '2024NE000565', '20033100001-9'] }] };
    tabelas.contrato_empenhos = { data: [{ empenho_id: 'a' }, { empenho_id: 'b' }] };
    tabelas.empenhos = { data: [{ numero_oficial: '2024NE000565' }, { numero_oficial: '2024NE000566' }] };
  });

  it('junta as OBs que confirmam a fatura, as notas que citam e as notas do contrato', async () => {
    const r = await fetchPagamentoDaFatura(375239, '200331-00088-2013');
    expect(r).toEqual({
      obs: [{ numero: '2024OB073730', emissao: '2024-08-21', valor: 2333.27, notas: ['2024NE000566', '2024NE000565'] }],
      notasDoContrato: ['2024NE000565', '2024NE000566']
    });
  });

  it('sem OB confirmada ou sem NP: null, sem erro', async () => {
    tabelas.fatura_pagamento = { data: null };
    expect(await fetchPagamentoDaFatura(1, 'K')).toBeNull();
    tabelas.fatura_pagamento = { data: { ordens_bancarias: '2024OB073730' } };
    tabelas.contrato_faturas = { data: { np: null } };
    expect(await fetchPagamentoDaFatura(1, 'K')).toBeNull();
  });

  it('erro do banco sobe para a tela tratar', async () => {
    tabelas.ordens_bancarias = { data: null, error: new Error('falhou') };
    await expect(fetchPagamentoDaFatura(1, 'K')).rejects.toThrow('falhou');
  });
});
