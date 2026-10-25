/**
 * Leituras de empenhos em páginas de mil com ordem única (passo 1 da auditoria das telas, 17/10/2026).
 *
 * O banco falso abaixo responde como o PostgREST: no máximo mil linhas por pedido, na ordem pedida, e as linhas que
 * empatam na ordem vêm numa ordem diferente a cada pedido (o Postgres não garante a ordem dos empates; aqui, invertida
 * nos pedidos ímpares). Com ordem que empata e um empate na virada da página, a página 2 repete uma linha da página 1
 * e pula outra; com a chave única, cada linha vem uma vez só.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { banco, from } = vi.hoisted(() => {
  const banco = {
    tabelas: {} as Record<string, any[]>,
    /** tabela → início da página que responde com erro */
    falhar: {} as Record<string, number>,
    /** tabela → código de erro em toda leitura */
    erroFixo: {} as Record<string, { code?: string; message: string }>,
    /** tabela → colunas de ordem pedidas em cada página */
    ordens: {} as Record<string, string[][]>,
    selects: {} as Record<string, string[]>
  };

  const pedidos: Record<string, number> = {};

  const from = (tabela: string) => {
    const filtros: Array<(r: any) => boolean> = [];
    const ordem: string[] = [];
    let colunas = '*';
    const linhas = () => {
      const n = (pedidos[tabela] = (pedidos[tabela] ?? -1) + 1);
      const filtradas = (banco.tabelas[tabela] ?? []).filter((r) => filtros.every((f) => f(r)));
      const base = n % 2 === 1 ? filtradas.reverse() : filtradas;
      // sort estável: os empates ficam na ordem de base (que muda a cada pedido)
      return base.sort((a, b) => {
        for (const c of ordem) {
          if (a[c] < b[c]) return -1;
          if (a[c] > b[c]) return 1;
        }
        return 0;
      });
    };
    const erro = () => {
      const fixo = banco.erroFixo[tabela];
      if (fixo && (!fixo.message.includes('versao_edicao') || colunas.includes('versao_edicao'))) return fixo;
      return null;
    };
    const q: any = {
      select: (c: string) => {
        colunas = c;
        (banco.selects[tabela] ??= []).push(c);
        return q;
      },
      eq: (c: string, v: unknown) => (filtros.push((r) => r[c] === v), q),
      in: (c: string, vs: unknown[]) => (filtros.push((r) => vs.includes(r[c])), q),
      not: () => q,
      or: () => q,
      order: (c: string) => (ordem.push(c), q),
      range: async (de: number, ate: number) => {
        (banco.ordens[tabela] ??= []).push([...ordem]);
        const e = erro();
        if (e) return { data: null, error: e };
        if (banco.falhar[tabela] === de) return { data: null, error: { message: `falhou a página ${de} de ${tabela}` } };
        return { data: linhas().slice(de, Math.min(ate + 1, de + 1000)), error: null };
      },
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
        Promise.resolve(erro() ? { data: null, error: erro() } : { data: linhas(), error: null }).then(ok, falha)
    };
    return q;
  };
  return { banco, from };
});

vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from } }));

import { fetchEmpenhosCarteira } from '../financeiroCarteiraService';
import { fetchDistribuicoesDoContrato, fetchDistribuicoesParaVincular, fetchSituacaoDistribuicaoPorEmpenho } from '../distribuicaoEmpenhoService';

const pad = (n: number) => String(n).padStart(5, '0');

/**
 * 2.049 notas; 67 delas em dois contratos (2.116 vínculos), como no banco em 17/10/2026. As notas em dois contratos
 * são as de 933 a 999, e a primeira fatura cita três notas: assim um empate cai nas posições 999 e 1.000, na virada
 * da primeira página, nas duas tabelas.
 */
function montarEmpenhos() {
  const empenhos = Array.from({ length: 2049 }, (_, i) => ({
    empenho_id: `e${pad(i)}`,
    numero_oficial: `2026NE${pad(i)}`,
    ano_exercicio: 2026,
    uasg_emitente: '200331',
    valor_empenhado: 1000,
    identificador_fonte: `g${pad(i)}`
  }));
  const vinculos: any[] = [];
  for (let i = 0; i < 2049; i++) {
    vinculos.push({ id: `ce${pad(vinculos.length)}`, empenho_id: `e${pad(i)}`, contract_key: `K${pad(i)}` });
    if (i >= 933 && i < 1000) vinculos.push({ id: `ce${pad(vinculos.length)}`, empenho_id: `e${pad(i)}`, contract_key: `K-outro${pad(i)}` });
  }
  // 1.250 faturas: a primeira cita três notas, as outras duas (2.501 linhas, id_fatura repete).
  const faturaEmpenhos: any[] = [{ id_fatura: 0, id_empenho_gov: `g${pad(2048)}`, valor: 1 }];
  for (let f = 0; f < 1250; f++) {
    faturaEmpenhos.push({ id_fatura: f, id_empenho_gov: `g${pad(f)}`, valor: 1 });
    faturaEmpenhos.push({ id_fatura: f, id_empenho_gov: `g${pad((f + 1250) % 2049)}`, valor: 1 });
  }
  return { empenhos, vinculos, faturaEmpenhos };
}

beforeEach(() => {
  banco.tabelas = {};
  banco.falhar = {};
  banco.erroFixo = {};
  banco.ordens = {};
  banco.selects = {};
});

describe('Financeiro › Empenhos: contrato_empenhos e fatura_empenhos em páginas com ordem única', () => {
  function prepararBanco() {
    const { empenhos, vinculos, faturaEmpenhos } = montarEmpenhos();
    banco.tabelas = {
      v_empenhos_resumo: empenhos,
      contrato_empenhos: vinculos,
      fatura_empenhos: faturaEmpenhos,
      contrato_faturas_sincronizacao: vinculos.map((v) => ({ contract_key: v.contract_key })),
      empenhos: empenhos.map((e) => ({ id: e.empenho_id, plano_interno: null, natureza_despesa: null })),
      v_empenho_saldo_contabil: []
    };
    const faturas = Array.from({ length: 1250 }, (_, f) => ({ idFatura: f, paga: true, cancelada: false, valorLiquido: 100 })) as any[];
    return faturas;
  }

  it('ordena contrato_empenhos por id e fatura_empenhos pela chave (id_fatura, id_empenho_gov)', async () => {
    const faturas = prepararBanco();
    await fetchEmpenhosCarteira(faturas);
    expect(banco.ordens.contrato_empenhos).toHaveLength(3);
    for (const ordem of banco.ordens.contrato_empenhos) expect(ordem).toEqual(['id']);
    expect(banco.ordens.fatura_empenhos).toHaveLength(3);
    for (const ordem of banco.ordens.fatura_empenhos) expect(ordem).toEqual(['id_fatura', 'id_empenho_gov']);
  });

  it('com empate na virada da página, nenhuma nota perde contrato e o pago não sai repetido nem pela metade', async () => {
    const faturas = prepararBanco();
    for (let rodada = 0; rodada < 5; rodada++) {
      const rows = await fetchEmpenhosCarteira(faturas);
      expect(rows).toHaveLength(2049);
      expect(rows.filter((r) => r.contractKeys.length === 2)).toHaveLength(67);
      // 2.501 linhas de fatura_empenhos, R$ 1 cada: o pago soma exatamente 2.501.
      expect(rows.reduce((s, r) => s + (r.valorPago ?? 0), 0)).toBe(2501);
    }
  });

  it('falha em qualquer página vira erro, nunca lista pela metade', async () => {
    const faturas = prepararBanco();
    banco.falhar.fatura_empenhos = 1000;
    await expect(fetchEmpenhosCarteira(faturas)).rejects.toBeTruthy();
    banco.falhar = { contrato_empenhos: 2000 };
    await expect(fetchEmpenhosCarteira(faturas)).rejects.toBeTruthy();
  });
});

describe('v_contrato_empenho_distribuicao em páginas de mil, na ordem de contrato_empenho_id', () => {
  function prepararView() {
    const { vinculos } = montarEmpenhos();
    banco.tabelas = {
      v_contrato_empenho_distribuicao: vinculos.map((v, i) => ({
        contrato_empenho_id: v.id,
        empenho_id: v.empenho_id,
        contract_key: v.contract_key,
        situacao: i % 3 === 0 ? 'A_DISTRIBUIR' : 'DISTRIBUIDA',
        origem: null,
        valor_nota: 10
      })),
      v_empenho_nota_siafi: []
    };
  }

  it('coluna Itens da tela Empenhos: lê as 2.116 notas, e não só as mil primeiras', async () => {
    prepararView();
    const linhas = await fetchSituacaoDistribuicaoPorEmpenho();
    expect(linhas).toHaveLength(2116);
    expect(new Set(linhas.map((l) => `${l.empenhoId}|${l.contractKey}`)).size).toBe(2116);
    expect(banco.ordens.v_contrato_empenho_distribuicao).toEqual([['contrato_empenho_id'], ['contrato_empenho_id'], ['contrato_empenho_id']]);
  });

  it('fila de Vínculos: lê todas as páginas e, sem a versão (banco sem a migration 129), relê sem ela', async () => {
    prepararView();
    banco.erroFixo.v_contrato_empenho_distribuicao = { code: '42703', message: 'column v_contrato_empenho_distribuicao.versao_edicao does not exist' };
    const linhas = await fetchDistribuicoesParaVincular();
    expect(linhas).toHaveLength(2116);
    expect(banco.selects.v_contrato_empenho_distribuicao[0]).toContain('versao_edicao');
    expect(banco.selects.v_contrato_empenho_distribuicao.at(-1)).toBe('*');
  });

  it('notas de um contrato: em páginas, com o filtro do contrato', async () => {
    prepararView();
    const linhas = await fetchDistribuicoesDoContrato('K00000');
    expect(linhas.map((l) => l.contractKey)).toEqual(['K00000']);
    expect(banco.ordens.v_contrato_empenho_distribuicao[0]).toEqual(['contrato_empenho_id']);
  });

  it('falha numa página do meio vira erro, nunca lista pela metade', async () => {
    prepararView();
    banco.falhar.v_contrato_empenho_distribuicao = 1000;
    await expect(fetchSituacaoDistribuicaoPorEmpenho()).rejects.toThrow(/falhou a página 1000/);
    await expect(fetchDistribuicoesParaVincular()).rejects.toThrow(/falhou a página 1000/);
  });

  it('banco sem a view (migration 94): a tela segue sem a coluna de itens', async () => {
    banco.erroFixo.v_contrato_empenho_distribuicao = { code: '42P01', message: 'relation "v_contrato_empenho_distribuicao" does not exist' };
    expect(await fetchSituacaoDistribuicaoPorEmpenho()).toEqual([]);
  });
});
