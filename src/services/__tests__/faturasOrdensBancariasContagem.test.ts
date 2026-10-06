import { describe, it, expect, vi, beforeEach } from 'vitest';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NPS = Array.from({ length: 12 }, (_, i) => `2026NP${String(i + 1).padStart(6, '0')}`);

const tabelas: Record<string, any[]> = {
  contrato_faturas: NPS.map((np) => ({ np, data_liquidacao: '2026-09-01', cancelada: false })),
  ordens_bancarias: [],
  np_consultas: []
};

function consulta(tabela: string) {
  const q: any = {
    select: () => q,
    eq: () => q,
    not: () => q,
    range: async () => ({ data: tabelas[tabela] ?? [], error: null })
  };
  return q;
}

let gravacoes = 0;
vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (tabela: string) => consulta(tabela),
    // Cada gravação demora um tempo diferente: as respostas voltam fora de ordem, como no servidor.
    rpc: vi.fn(async (_nome: string, args: any) => {
      await esperar(5 + (gravacoes++ % 5) * 4);
      return { data: (args.p_ordens as any[]).length, error: null };
    })
  }
}));
vi.mock('../sincronizacaoFontesService', async (orig) => ({
  ...(await orig<typeof import('../sincronizacaoFontesService')>()),
  executarComReserva: async (_r: string, _u: string, _o: unknown, tarefa: () => Promise<unknown>) => tarefa()
}));
vi.mock('../api', () => ({
  fetchContratosGovFaturas: vi.fn(),
  fetchOrdensBancariasDaNp: vi.fn(async (_ug: string, np: string) => {
    await esperar(2);
    // 2 OBs por NP: a soma correta é 24
    return [1, 2].map((n) => ({ numero: `2026OB${np.slice(-4).padStart(4, '0')}${String(n).padStart(2, '0')}`.replace(/^(\d{4}OB)(\d+)$/, (_m, a, b) => a + b.padStart(6, '0')), emissao: '2026-09-02', valor: '100.00', cancelamentoob: '0' }));
  })
}));
vi.mock('../contratosOficiaisService', () => ({ fetchContratosOficiaisDoBanco: vi.fn(async () => []) }));
vi.mock('../empenhosCarteiraService', async (orig) => ({
  ...(await orig<typeof import('../empenhosCarteiraService')>()),
  contratosComEmpenhoAPagar: vi.fn(async () => new Set())
}));

import { sincronizarOrdensBancariasDaCarteira } from '../faturasService';

describe('sincronizarOrdensBancariasDaCarteira: contagem com NPs em paralelo', () => {
  beforeEach(() => {
    gravacoes = 0;
  });

  it('soma todas as OBs gravadas, mesmo com as respostas voltando fora de ordem', async () => {
    const r = await sincronizarOrdensBancariasDaCarteira('200331', { concorrencia: 6 });
    expect(r).toMatchObject({ status: 'SUCESSO', total: 12 });
    expect((r as any).mensagem).toContain('12 de 12 NP(s) consultada(s)');
    expect((r as any).mensagem).toContain('12 com ordem bancária');
    expect((r as any).mensagem).toContain('24 OB(s) gravada(s)');
  });
});
