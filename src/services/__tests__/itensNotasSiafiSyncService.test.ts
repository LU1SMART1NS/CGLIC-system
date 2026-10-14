import { describe, it, expect, vi, beforeEach } from 'vitest';

const banco = vi.hoisted(() => ({
  rpc: null as unknown as ReturnType<typeof vi.fn<(...args: any[]) => Promise<any>>>
}));

vi.mock('../supabaseClient', () => {
  banco.rpc = vi.fn<(...args: any[]) => Promise<any>>();
  return { isSupabaseConfigured: true, supabase: { rpc: (...args: unknown[]) => banco.rpc(...args) } };
});

import {
  ChaveRecusadaError,
  codigoDoDocumento,
  consolidarHistorico,
  itemDaDescricao,
  lerNotaNoSiafi,
  numeroBR,
  sincronizarItensNotasSiafi
} from '../itensNotasSiafiSyncService';

const json = (corpo: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as unknown as Response;
const op = (operacao: string, quantidade: string, valorUnitario: string, valorTotal: string, data = '20/12/2023') => ({ data, operacao, quantidade, valorUnitario, valorTotal });
const semEspera = async () => {};

describe('leitura das notas no Portal da Transparência', () => {
  it('números no formato brasileiro e o item da compra na descrição', () => {
    expect(numeroBR('1.145,21')).toBe(1145.21);
    expect(numeroBR('20.663.042,21')).toBe(20663042.21);
    expect(numeroBR('')).toBeNull();
    expect(itemDaDescricao('Item compra: 00032 - HALTERE, MATERIAL FERRO')).toEqual({ numero: 32, descricao: 'HALTERE, MATERIAL FERRO' });
    expect(itemDaDescricao('ENERGIA ELETRICA')).toEqual({ numero: null, descricao: 'ENERGIA ELETRICA' });
    expect(codigoDoDocumento('200330', '2026ne000410')).toBe('200330000012026NE000410');
  });

  it('descarta a operação repetida e ignora a inscrição em RP (2023NE000432, item 6: 40 un, não 80)', () => {
    const c = consolidarHistorico([
      op('INCLUSAO', '40,00', '115.435,99', '4.617.439,60'),
      op('INCLUSAO', '40,00', '115.435,99', '4.617.439,60'),
      op('INSCRICAO EM RP', '1,00', '20.663.042,21', '20.663.042,21', '13/01/2024'),
      op('INSCRICAO EM RP', '1,00', '20.663.042,21', '20.663.042,21', '13/01/2024')
    ]);
    expect(c).toMatchObject({ quantidade: 40, valorTotal: 4617439.6, valorUnitario: 115435.99, repetidas: 2 });
  });

  it('anulação subtrai e reforço soma (2023NE000432, item 8: 57 − 2 = 55)', () => {
    expect(consolidarHistorico([op('INCLUSAO', '57,00', '115.435,99', '6.579.851,43'), op('ANULACAO', '2,00', '115.435,99', '230.871,98', '26/12/2023')])).toMatchObject({
      quantidade: 55,
      valorTotal: 6348979.45
    });
    expect(consolidarHistorico([op('REFORCO', '4,05', '49.413,34', '200.000,00', '22/07/2024'), op('INCLUSAO', '2,02', '49.413,46', '100.000,00', '26/01/2024')])).toMatchObject({
      quantidade: 6.07,
      valorTotal: 300000
    });
  });

  it('operação desconhecida não conta e fica registrada', () => {
    expect(consolidarHistorico([op('INCLUSAO', '1,00', '10,00', '10,00'), op('ESTORNO X', '1,00', '10,00', '10,00')])).toMatchObject({ quantidade: 1, desconhecidas: ['ESTORNO X'] });
  });

  it('lê as linhas e o histórico com a chave, no ritmo do portal', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/historico')) {
        const seq = /sequencial=(\d+)/.exec(url)![1];
        return json(seq === '1' ? [op('INCLUSAO', '1,00', '1.145,21', '1.145,21', '23/09/2026')] : [op('INCLUSAO', '6,00', '46,79', '280,74', '23/09/2026')]);
      }
      return json([
        { sequencial: 1, descricao: 'Item compra: 00032 - APARELHO TIPO BARRA', valorAtual: '1.145,21' },
        { sequencial: 2, descricao: 'Item compra: 00048 - HALTERE', valorAtual: '280,74' }
      ]);
    });
    const esperar = vi.fn(semEspera);
    const leitura = await lerNotaNoSiafi('200330000012026NE000410', { chave: 'k', fetcher: fetcher as unknown as typeof fetch, esperar });
    expect(leitura).toEqual({
      codigo_documento: '200330000012026NE000410',
      situacao: 'LIDA',
      total_siafi: 1425.95,
      linhas: [
        { sequencial: 1, numero_item: 32, descricao: 'APARELHO TIPO BARRA', quantidade: 1, valor_unitario: 1145.21, valor_total: 1145.21 },
        { sequencial: 2, numero_item: 48, descricao: 'HALTERE', quantidade: 6, valor_unitario: 46.79, valor_total: 280.74 }
      ]
    });
    expect(fetcher.mock.calls[0][0]).toBe('/api-transparencia/api-de-dados/despesas/itens-de-empenho?codigoDocumento=200330000012026NE000410&pagina=1');
    expect((fetcher.mock.calls[0] as any)[1].headers['chave-api-dados']).toBe('k');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls).toEqual([[700], [700]]);
  });

  it('página cheia (15 linhas): lê a seguinte', async () => {
    const linha = (i: number) => ({ sequencial: i, descricao: `Item compra: ${String(i).padStart(5, '0')} - X` });
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/historico')) return json([op('INCLUSAO', '1,00', '1,00', '1,00')]);
      return json(url.endsWith('pagina=1') ? Array.from({ length: 15 }, (_, i) => linha(i + 1)) : [linha(16)]);
    });
    const leitura = await lerNotaNoSiafi('X', { chave: 'k', fetcher: fetcher as unknown as typeof fetch, esperar: semEspera });
    expect(leitura.linhas).toHaveLength(16);
    expect(leitura.total_siafi).toBe(16);
  });

  it('nota sem linhas no portal', async () => {
    const fetcher = vi.fn(async () => json([]));
    expect(await lerNotaNoSiafi('X', { chave: 'k', fetcher: fetcher as unknown as typeof fetch, esperar: semEspera })).toMatchObject({ situacao: 'SEM_LINHAS', total_siafi: 0, linhas: [] });
  });

  it('429: espera e tenta de novo; 401: chave recusada; 500 três vezes: lança', async () => {
    let n = 0;
    const comLimite = vi.fn(async () => (++n === 1 ? json({}, 429) : json([])));
    const esperar = vi.fn(semEspera);
    await lerNotaNoSiafi('X', { chave: 'k', fetcher: comLimite as unknown as typeof fetch, esperar });
    expect(comLimite).toHaveBeenCalledTimes(2);
    expect(esperar.mock.calls[0]).toEqual([20_000]);

    const recusada = vi.fn(async () => json({}, 401));
    await expect(lerNotaNoSiafi('X', { chave: 'k', fetcher: recusada as unknown as typeof fetch, esperar: semEspera })).rejects.toBeInstanceOf(ChaveRecusadaError);
    expect(recusada).toHaveBeenCalledTimes(1);

    const fora = vi.fn(async () => json({}, 500));
    await expect(lerNotaNoSiafi('X', { chave: 'k', fetcher: fora as unknown as typeof fetch, esperar: semEspera })).rejects.toThrow('500');
    expect(fora).toHaveBeenCalledTimes(3);
  });
});

describe('sincronização no servidor', () => {
  beforeEach(() => banco.rpc.mockReset());

  const rpcs = (fila: Array<{ empenho_id: string; numero_oficial: string; uasg_emitente: string }>) => {
    const gravadas: any[] = [];
    banco.rpc.mockImplementation(async (nome: string, args: any) => {
      if (nome === 'reservar_sincronizacao') return { data: true, error: null };
      if (nome === 'concluir_sincronizacao') return { data: null, error: null };
      if (nome === 'notas_para_ler_no_siafi') return { data: fila, error: null };
      if (nome === 'gravar_leituras_siafi') {
        gravadas.push(...args.p_leituras);
        return { data: args.p_leituras.length, error: null };
      }
      return { data: null, error: { message: `rpc inesperada ${nome}` } };
    });
    return gravadas;
  };
  const fila = [
    { empenho_id: 'e1', numero_oficial: '2026NE000410', uasg_emitente: '200330' },
    { empenho_id: 'e2', numero_oficial: '2026NE000409', uasg_emitente: '200330' }
  ];

  it('sem chave: erro claro, sem consultar o portal', async () => {
    rpcs(fila);
    const fetcher = vi.fn();
    const r = await sincronizarItensNotasSiafi('200330', { chave: undefined, fetcher: fetcher as unknown as typeof fetch, esperar: semEspera });
    expect(r).toMatchObject({ status: 'ERRO' });
    expect((r as any).erro).toContain('PORTAL_TRANSPARENCIA_CHAVE');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('lê a fila e grava cada nota com o id do empenho', async () => {
    const gravadas = rpcs(fila);
    const fetcher = vi.fn(async (url: string) =>
      json(url.includes('/historico') ? [op('INCLUSAO', '2,00', '10,00', '20,00')] : [{ sequencial: 1, descricao: 'Item compra: 00001 - X' }])
    );
    const r = await sincronizarItensNotasSiafi('200330', { chave: 'k', fetcher: fetcher as unknown as typeof fetch, esperar: semEspera });
    expect(r).toMatchObject({ status: 'SUCESSO', total: 2 });
    expect(gravadas.map((g) => [g.empenho_id, g.codigo_documento, g.total_siafi])).toEqual([
      ['e1', '200330000012026NE000410', 20],
      ['e2', '200330000012026NE000409', 20]
    ]);
  });

  it('chave recusada: para na hora e grava o que já leu', async () => {
    const gravadas = rpcs(fila);
    let n = 0;
    const fetcher = vi.fn(async (url: string) => {
      n++;
      if (n > 2) return json({}, 403);
      return json(url.includes('/historico') ? [op('INCLUSAO', '1,00', '5,00', '5,00')] : [{ sequencial: 1, descricao: 'Item compra: 00001 - X' }]);
    });
    const r = await sincronizarItensNotasSiafi('200330', { chave: 'k', fetcher: fetcher as unknown as typeof fetch, esperar: semEspera });
    expect(r).toMatchObject({ status: 'ERRO' });
    expect(gravadas.map((g) => g.empenho_id)).toEqual(['e1']);
  });

  it('orçamento de tempo: o que não cabe fica para a próxima (PARCIAL)', async () => {
    rpcs(fila);
    let t = 0;
    const fetcher = vi.fn(async (url: string) =>
      json(url.includes('/historico') ? [op('INCLUSAO', '1,00', '5,00', '5,00')] : [{ sequencial: 1, descricao: 'Item compra: 00001 - X' }])
    );
    const r = await sincronizarItensNotasSiafi('200330', {
      chave: 'k',
      fetcher: fetcher as unknown as typeof fetch,
      esperar: semEspera,
      orcamentoMs: 1000,
      agora: () => (t += 800)
    });
    expect(r).toMatchObject({ status: 'PARCIAL', total: 1 });
    expect((r as any).mensagem).toContain('1 nota ficou para a próxima execução');
  });
});
