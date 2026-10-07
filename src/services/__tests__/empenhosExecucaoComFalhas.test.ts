import { describe, it, expect, vi, beforeEach } from 'vitest';

const AGORA = new Date('2026-10-06T22:50:00Z').getTime();
const ha = (h: number) => new Date(AGORA - h * 3600_000).toISOString();

let situacoes: Array<{ contract_key: string; tentativa_em: string; situacao: string }> = [];
const tabelas = () => ({ contrato_empenhos_sincronizacao: situacoes, contrato_empenhos: [] as any[], v_empenhos_resumo: [] as any[] });

vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (t: string) => {
      const q: any = { select: () => q, range: async () => ({ data: (tabelas() as any)[t] ?? [], error: null }) };
      return q;
    }
  }
}));
vi.mock('../sincronizacaoFontesService', async (orig) => ({
  ...(await orig<typeof import('../sincronizacaoFontesService')>()),
  executarComReserva: async (_r: string, _u: string, _o: unknown, tarefa: () => Promise<unknown>) => tarefa()
}));
const contratos = ['200331-00065-2021', '200331-00001-2026', '200331-00002-2026'].map((id) => ({
  id, uasg: '200331', numero: id.slice(7, 12), ano: id.slice(-4), dataVigenciaFim: '2027-12-31', contratoId: 100 + Number(id.slice(9, 12))
}));
vi.mock('../contratosOficiaisService', () => ({ fetchContratosOficiaisDoBanco: vi.fn(async () => contratos) }));
const sincronizar = vi.fn(async (c: any) => ({
  target: { contractKey: c.id },
  result: { status: 'SUCESSO', empenhos_persistidos: 2, vinculos_contrato_removidos: 0, erros: [], pendencias: [], resumo_sync: { erros: [] } }
}));
vi.mock('../contratoEmpenhosSincronizacaoService', async (orig) => ({
  ...(await orig<typeof import('../contratoEmpenhosSincronizacaoService')>()),
  sincronizarEmpenhosDoRegistro: (c: any) => sincronizar(c)
}));

import { sincronizarEmpenhosDaCarteira, falhasEsperandoNovaTentativa } from '../empenhosCarteiraService';

const rodar = () => sincronizarEmpenhosDaCarteira('200331', { agora: () => AGORA, hoje: () => '2026-10-06' });
const todosOkRecentes = (h = 2) => contratos.map((c) => ({ contract_key: c.id, tentativa_em: ha(h), situacao: 'OK' }));

describe('execução de empenhos com contratos em falha', () => {
  beforeEach(() => {
    sincronizar.mockClear();
  });

  it('PARCIAL de 30 min atrás ainda não é devido: nada é processado, mas a execução fica PARCIAL', async () => {
    situacoes = todosOkRecentes().map((s) => (s.contract_key === '200331-00065-2021' ? { ...s, tentativa_em: ha(0.5), situacao: 'PARCIAL' } : s));
    const r = await rodar();
    expect(sincronizar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 'PARCIAL', total: 0 });
    expect((r as any).mensagem).toContain('1 contrato(s) com falha recente esperam 1 h');
  });

  it('PARCIAL de 2 h atrás já é devido: é processado e, com sucesso, a execução termina SUCESSO', async () => {
    situacoes = todosOkRecentes().map((s) => (s.contract_key === '200331-00065-2021' ? { ...s, situacao: 'PARCIAL' } : s));
    const r = await rodar();
    expect(sincronizar).toHaveBeenCalledTimes(1);
    expect(sincronizar.mock.calls[0][0].id).toBe('200331-00065-2021');
    expect(r).toMatchObject({ status: 'SUCESSO', total: 1 });
  });

  it('falha de mais de 6 h atrás não mantém a execução aberta (contrato que falha sempre)', async () => {
    situacoes = todosOkRecentes(10).map((s) => ({ ...s, tentativa_em: ha(10) }));
    situacoes[0] = { contract_key: '200331-00065-2021', tentativa_em: ha(5), situacao: 'ERRO' };
    const comFalhaRecente = situacoes.filter((s) => s.situacao === 'ERRO');
    expect(comFalhaRecente).toHaveLength(1);
    // ERRO de 5 h atrás: devido (>1 h) e processado; resultado SUCESSO
    expect((await rodar()).status).toBe('SUCESSO');
    // ERRO de 7 h atrás e já processado antes: devido também; sem pendência na espera
    situacoes[0] = { contract_key: '200331-00065-2021', tentativa_em: ha(7), situacao: 'ERRO' };
    sincronizar.mockClear();
    expect((await rodar()).status).toBe('SUCESSO');
  });

  it('sem nenhuma falha e nada devido: SUCESSO com 0 contratos', async () => {
    situacoes = todosOkRecentes();
    const r = await rodar();
    expect(sincronizar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 'SUCESSO', total: 0 });
    expect((r as any).mensagem).not.toContain('esperam');
  });
});

describe('falhasEsperandoNovaTentativa', () => {
  const c = (id: string) => ({ id, uasg: '200331', numero: '', ano: '' }) as any;
  it('só os de falha recente que não estão na fila', () => {
    const elegiveis = [c('200331-00001-2026'), c('200331-00002-2026'), c('200331-00003-2026')];
    const fila = [c('200331-00002-2026')];
    const comFalha = new Set(['200331-00001-2026', '200331-00002-2026']);
    expect(falhasEsperandoNovaTentativa(elegiveis, fila, comFalha).map((x) => x.id)).toEqual(['200331-00001-2026']);
  });
});
