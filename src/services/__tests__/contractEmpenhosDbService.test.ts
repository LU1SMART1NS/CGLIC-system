import { describe, it, expect, vi, beforeEach } from 'vitest';

const respostas: Record<string, any> = {};
const chamadas: Array<{ tabela: string; colunas: string; filtros: any[] }> = [];
function builder(tabela: string) {
  const filtros: any[] = [];
  let colunas = '';
  const chave = () => `${tabela}:${filtros.map((f) => f[0]).join(',')}`;
  const b: any = {
    select: (c: string) => ((colunas = c), b),
    eq: (...a: any[]) => (filtros.push(['eq', ...a]), b),
    in: (...a: any[]) => (filtros.push(['in', ...a]), b),
    neq: (...a: any[]) => (filtros.push(['neq', ...a]), b),
    then: (ok: any, err: any) => {
      chamadas.push({ tabela, colunas, filtros });
      const r = respostas[chave()];
      return Promise.resolve((typeof r === 'function' ? r(colunas) : r) ?? { data: [], error: null }).then(ok, err);
    }
  };
  return b;
}
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: (t: string) => builder(t) } }));

import { fetchContractEmpenhosFromDb } from '../contractEmpenhosDbService';

describe('fetchContractEmpenhosFromDb', () => {
  beforeEach(() => {
    for (const k of Object.keys(respostas)) delete respostas[k];
    chamadas.length = 0;
    respostas['v_empenhos_resumo:in'] = { data: [{ empenho_id: 'a', numero_oficial: '2024NE000028' }, { empenho_id: 'b', numero_oficial: '2023NE000066' }], error: null };
  });

  it('traz, para cada NE, os outros contratos e a origem do vínculo', async () => {
    respostas['contrato_empenhos:eq'] = {
      data: [
        { empenho_id: 'a', origem: 'FONTE' },
        { empenho_id: 'b', origem: 'MANUAL', vinculado_por_nome: 'Maria', motivo_manual: 'Conferido no SIAFI', created_at: '2026-10-06T20:00:00Z' }
      ],
      error: null
    };
    respostas['contrato_empenhos:in,neq'] = { data: [{ empenho_id: 'a', contract_key: '200331-00005-2017' }], error: null };

    const rows = await fetchContractEmpenhosFromDb('200331-00004-2017');

    expect(rows).toEqual([
      { empenho_id: 'a', numero_oficial: '2024NE000028', outros_contratos: ['200331-00005-2017'], origem_vinculo: 'FONTE', vinculado_por_nome: undefined, motivo_manual: undefined, vinculado_em: undefined },
      { empenho_id: 'b', numero_oficial: '2023NE000066', outros_contratos: [], origem_vinculo: 'MANUAL', vinculado_por_nome: 'Maria', motivo_manual: 'Conferido no SIAFI', vinculado_em: '2026-10-06T20:00:00Z' }
    ]);
    const outros = chamadas.find((c) => c.tabela === 'contrato_empenhos' && c.filtros.some((f) => f[0] === 'neq'));
    expect(outros?.filtros).toContainEqual(['neq', 'contract_key', '200331-00004-2017']);
  });

  it('sem as colunas da migration 85, lê só o empenho e trata tudo como FONTE', async () => {
    respostas['contrato_empenhos:eq'] = (colunas: string) =>
      colunas.includes('origem')
        ? { data: null, error: { code: '42703', message: 'column contrato_empenhos.origem does not exist' } }
        : { data: [{ empenho_id: 'a' }, { empenho_id: 'b' }], error: null };
    const rows = await fetchContractEmpenhosFromDb('200331-00004-2017');
    expect(rows.map((r: any) => r.origem_vinculo)).toEqual(['FONTE', 'FONTE']);
  });

  it('outro erro na leitura dos vínculos é propagado', async () => {
    respostas['contrato_empenhos:eq'] = { data: null, error: { code: '57014', message: 'timeout' } };
    await expect(fetchContractEmpenhosFromDb('200331-00004-2017')).rejects.toMatchObject({ code: '57014' });
  });

  it('falha ao ler os outros contratos não derruba a tabela', async () => {
    respostas['contrato_empenhos:eq'] = { data: [{ empenho_id: 'a' }, { empenho_id: 'b' }], error: null };
    respostas['contrato_empenhos:in,neq'] = { data: null, error: { message: 'x' } };
    const rows = await fetchContractEmpenhosFromDb('200331-00004-2017');
    expect(rows.map((r: any) => r.outros_contratos)).toEqual([[], []]);
  });
});
