import { describe, it, expect, vi } from 'vitest';

// Banco simulado: a view do Tesouro sem as colunas de restos a pagar (migration 135 ainda não aplicada) na 1ª leitura.
const selects: string[] = [];
let semColunasNovas = true;
const vazio = async () => ({ data: [], error: null });
function consulta(tabela: string) {
  let colunas = '';
  const q: any = {
    select: (c: string) => {
      colunas = c;
      if (tabela === 'v_empenho_saldo_contabil') selects.push(c);
      return q;
    },
    not: () => q,
    order: () => q,
    range: async () => {
      if (tabela === 'v_empenho_saldo_contabil') {
        if (semColunasNovas && colunas.includes('rpnp_liquidado_a_pagar')) {
          return { data: null, error: { code: '42703', message: 'column v_empenho_saldo_contabil.rpnp_liquidado_a_pagar does not exist' } };
        }
        return {
          data: [{ empenho_id: 'e1', pago_total: 10, exercicio_a_liquidar: 0, exercicio_liquidado_a_pagar: 0, rp_a_liquidar: 5, rp_liquidado_a_pagar: 2, atualizado_tesouro: null, rpnp_liquidado_a_pagar: 2, rpp_a_pagar: 0, rp_pago_no_ano: 3 }],
          error: null
        };
      }
      if (tabela === 'v_empenhos_resumo') {
        return { data: [{ empenho_id: 'e1', numero_oficial: '2025NE000001', ano_exercicio: 2025, uasg_emitente: '200330', valor_empenhado: 20, identificador_fonte: 'X' }], error: null };
      }
      if (tabela === 'contrato_empenhos') return { data: [{ empenho_id: 'e1', contract_key: 'K' }], error: null };
      return vazio();
    }
  };
  return q;
}
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: (t: string) => consulta(t) } }));

import { fetchEmpenhosCarteira } from '../financeiroCarteiraService';

describe('fetchEmpenhosCarteira: saldo do Tesouro', () => {
  it('banco sem as colunas de restos a pagar: lê o resto sem elas, sem quebrar a tela', async () => {
    semColunasNovas = true;
    selects.length = 0;
    const [row] = await fetchEmpenhosCarteira([]);
    expect(selects).toHaveLength(2);
    expect(selects[1]).not.toContain('rpnp_liquidado_a_pagar');
    expect(row).toMatchObject({ valorPago: 10, saldo: 7, fontePago: 'TESOURO', restosAPagar: null });
  });

  it('banco com as colunas: restos a pagar na linha', async () => {
    semColunasNovas = false;
    selects.length = 0;
    const [row] = await fetchEmpenhosCarteira([]);
    expect(selects).toHaveLength(1);
    expect(row.restosAPagar).toEqual({ naoProcessadoALiquidar: 5, naoProcessadoLiquidadoAPagar: 2, processadoAPagar: 0, pagoNoAno: 3 });
  });
});
