import { describe, it, expect, vi, beforeEach } from 'vitest';

let cargas: any[] = [];
const rpc = vi.fn(async (_nome: string, args: any): Promise<any> => ({ data: { gravadas: args.p_linhas.length, removidas: 0, bloqueada: false }, error: null }));
vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => {
      const q: any = { select: () => q, eq: async () => ({ data: cargas, error: null }) };
      return q;
    },
    rpc: (n: string, a: any) => rpc(n, a)
  }
}));
vi.mock('../sincronizacaoFontesService', async (orig) => ({
  ...(await orig<typeof import('../sincronizacaoFontesService')>()),
  executarComReserva: async (_r: string, _u: string, _o: unknown, tarefa: () => Promise<unknown>) => tarefa()
}));
const fetchSaldo = vi.fn(async (_ano: number, _ug: string, conta: string): Promise<any[]> => [
  { conta_corrente: '2025NE00047152', saldo: '37861227.00', debito_mensal: '0.00', credito_mensal: '37861227.00', created_at: '2026-10-13 08:36:23' },
  { conta_corrente: `2026NE0000${conta.slice(-2)}39`, saldo: '10.50', debito_mensal: '1', credito_mensal: '2', created_at: '2026-10-13 08:36:23' },
  { conta_corrente: 'NAO-E-EMPENHO', saldo: '1' }
]);
vi.mock('../api', () => ({ fetchSaldoContabil: (a: number, u: string, c: string) => fetchSaldo(a, u, c) }));

import {
  ANO_INICIAL_SALDO_CONTABIL,
  CONTAS_SALDO_CONTABIL,
  normalizarLinhaSaldo,
  planejarLeituras,
  sincronizarSaldoContabil
} from '../saldoContabilSyncService';

const AGORA = Date.parse('2026-10-14T15:00:00Z');
const ANOS_FECHADOS = 2026 - ANO_INICIAL_SALDO_CONTABIL;

describe('normalizarLinhaSaldo', () => {
  it('lê a linha do Tesouro (conta corrente = empenho + subitem)', () => {
    expect(
      normalizarLinhaSaldo({ conta_corrente: '2025NE00047152', saldo: '37861227.00', debito_mensal: '0.00', credito_mensal: '37861227.00', created_at: '2026-10-13 08:36:23' })
    ).toEqual({ conta_corrente: '2025NE00047152', saldo: 37861227, debito_mensal: 0, credito_mensal: 37861227, atualizado_tesouro: '2026-10-13 08:36:23' });
  });
  it('descarta conta corrente que não é empenho + subitem; valores ruins viram zero', () => {
    expect(normalizarLinhaSaldo({ conta_corrente: '2025NE000471' })).toBeNull();
    expect(normalizarLinhaSaldo({ conta_corrente: 'XPTO' })).toBeNull();
    expect(normalizarLinhaSaldo({ conta_corrente: '2025ne00047152', saldo: 'abc' })).toMatchObject({ conta_corrente: '2025NE00047152', saldo: 0, atualizado_tesouro: null });
  });
});

describe('planejarLeituras', () => {
  it('sem cargas: ano corrente e todos os anos fechados desde 2016', () => {
    const p = planejarLeituras([], 2026);
    expect(p).toHaveLength(CONTAS_SALDO_CONTABIL.length * (ANOS_FECHADOS + 1));
    expect(p.slice(0, CONTAS_SALDO_CONTABIL.length).every((x) => x.ano === 2026)).toBe(true);
    expect(Math.min(...p.map((x) => x.ano))).toBe(2016);
  });
  it('ano fechado lido depois de fevereiro do ano seguinte não é lido de novo; o lido antes, sim', () => {
    const cargas = [];
    for (let ano = 2016; ano <= 2025; ano++) for (const conta of CONTAS_SALDO_CONTABIL) cargas.push({ ano, conta, carregado_em: '2026-10-01T10:00:00Z' });
    // 2025 lido em janeiro de 2026 (antes do fechamento): volta para a fila
    for (const c of cargas.filter((c) => c.ano === 2025)) c.carregado_em = '2026-01-03T10:00:00Z';
    const p = planejarLeituras(cargas, 2026);
    expect(p.filter((x) => x.ano === 2026)).toHaveLength(CONTAS_SALDO_CONTABIL.length);
    expect(p.filter((x) => x.ano === 2025)).toHaveLength(CONTAS_SALDO_CONTABIL.length);
    expect(p.filter((x) => x.ano < 2025)).toHaveLength(0);
  });
});

describe('sincronizarSaldoContabil', () => {
  beforeEach(() => {
    rpc.mockClear();
    fetchSaldo.mockClear();
    cargas = [];
    for (let ano = 2016; ano <= 2025; ano++) for (const conta of CONTAS_SALDO_CONTABIL) cargas.push({ ano, conta, carregado_em: '2026-10-01T10:00:00Z' });
  });

  it('lê as contas do ano corrente e grava só as linhas de empenho', async () => {
    const r: any = await sincronizarSaldoContabil('200330', { agora: () => AGORA });
    expect(r).toMatchObject({ status: 'SUCESSO', total: 10 });
    expect(r.mensagem).toContain('10 de 10 conta(s) lida(s)');
    expect(r.mensagem).toContain('20 linha(s) gravada(s)');
    expect(fetchSaldo.mock.calls.every((c) => c[0] === 2026 && c[1] === '200330')).toBe(true);
    const args = rpc.mock.calls.map((c) => c[1]);
    expect(args.every((a: any) => a.p_ug === '200330' && a.p_ano === 2026 && a.p_linhas.length === 2)).toBe(true);
    expect(args.map((a: any) => a.p_conta).sort()).toEqual([...CONTAS_SALDO_CONTABIL].sort());
  });

  it('falha numa conta vira parcial sem perder as outras; lista vazia mantida vira aviso', async () => {
    fetchSaldo.mockImplementationOnce(async () => {
      throw new Error('Tesouro (STA) respondeu 503');
    });
    rpc.mockImplementationOnce(async () => ({ data: { gravadas: 0, removidas: 0, bloqueada: true }, error: null }));
    const r: any = await sincronizarSaldoContabil('200331', { agora: () => AGORA });
    expect(r.status).toBe('PARCIAL');
    expect(r.mensagem).toContain('9 de 10 conta(s) lida(s)');
    expect(r.mensagem).toContain('1 com falha');
    expect(r.mensagem).toContain('1 conta(s) vieram vazias e o saldo anterior foi mantido');
  });

  it('erro da gravação (objeto do banco) aparece com o texto, não "[object Object]"', async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }));
    const r: any = await sincronizarSaldoContabil('200330', { agora: () => AGORA });
    expect(r.status).toBe('PARCIAL');
    expect(r.mensagem).not.toContain('[object Object]');
    expect(r.mensagem).toMatch(/1 com falha \(ex\.: \d{9}\/2026: .+\)/);
  });

  it('lê várias contas ao mesmo tempo e conta todas certo', async () => {
    let emVoo = 0;
    let maximo = 0;
    const padrao = fetchSaldo.getMockImplementation()!;
    fetchSaldo.mockImplementation(async (_a: number, _u: string, conta: string) => {
      emVoo++;
      maximo = Math.max(maximo, emVoo);
      await new Promise((r) => setTimeout(r, 5 + (Number(conta.slice(-2)) % 4) * 3));
      emVoo--;
      return [{ conta_corrente: '2025NE00047152', saldo: '1', created_at: '2026-10-13 08:36:23' }];
    });
    const r: any = await sincronizarSaldoContabil('200330', { agora: () => AGORA, concorrencia: 4 });
    expect(maximo).toBe(4);
    expect(r).toMatchObject({ status: 'SUCESSO', total: 10 });
    expect(r.mensagem).toContain('10 linha(s) gravada(s)');
    fetchSaldo.mockImplementation(padrao);
  });

  it('o orçamento de tempo deixa o resto para a próxima', async () => {
    let t = AGORA;
    const r: any = await sincronizarSaldoContabil('200330', { agora: () => (t += 40_000), orcamentoMs: 100_000 });
    expect(r.status).toBe('PARCIAL');
    expect(r.mensagem).toContain('ficam para a próxima');
    expect(fetchSaldo.mock.calls.length).toBeLessThan(10);
  });
});
