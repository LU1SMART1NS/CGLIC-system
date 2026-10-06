import { describe, it, expect, vi } from 'vitest';

const respostas: Record<string, any> = {};
const chamadas: Array<{ tabela: string; filtros: any[] }> = [];
function builder(tabela: string) {
  const filtros: any[] = [];
  const chave = () => `${tabela}:${filtros.map((f) => f[0]).join(',')}`;
  const b: any = {
    select: () => b,
    eq: (...a: any[]) => (filtros.push(['eq', ...a]), b),
    in: (...a: any[]) => (filtros.push(['in', ...a]), b),
    neq: (...a: any[]) => (filtros.push(['neq', ...a]), b),
    then: (ok: any, err: any) => {
      chamadas.push({ tabela, filtros });
      return Promise.resolve(respostas[chave()] ?? { data: [], error: null }).then(ok, err);
    }
  };
  return b;
}
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: (t: string) => builder(t) } }));

import { fetchContractEmpenhosFromDb } from '../contractEmpenhosDbService';

describe('fetchContractEmpenhosFromDb', () => {
  it('traz, para cada NE, os outros contratos a que ela está vinculada', async () => {
    respostas['contrato_empenhos:eq'] = { data: [{ empenho_id: 'a' }, { empenho_id: 'b' }], error: null };
    respostas['v_empenhos_resumo:in'] = { data: [{ empenho_id: 'a', numero_oficial: '2024NE000028' }, { empenho_id: 'b', numero_oficial: '2023NE000066' }], error: null };
    respostas['contrato_empenhos:in,neq'] = { data: [{ empenho_id: 'a', contract_key: '200331-00005-2017' }], error: null };

    const rows = await fetchContractEmpenhosFromDb('200331-00004-2017');

    expect(rows).toEqual([
      { empenho_id: 'a', numero_oficial: '2024NE000028', outros_contratos: ['200331-00005-2017'] },
      { empenho_id: 'b', numero_oficial: '2023NE000066', outros_contratos: [] }
    ]);
    const outros = chamadas.find((c) => c.tabela === 'contrato_empenhos' && c.filtros.some((f) => f[0] === 'neq'));
    expect(outros?.filtros).toContainEqual(['neq', 'contract_key', '200331-00004-2017']);
  });

  it('falha ao ler os outros contratos não derruba a tabela', async () => {
    respostas['contrato_empenhos:in,neq'] = { data: null, error: { message: 'x' } };
    const rows = await fetchContractEmpenhosFromDb('200331-00004-2017');
    expect(rows.map((r: any) => r.outros_contratos)).toEqual([[], []]);
  });
});
