import { describe, it, expect, vi, beforeEach } from 'vitest';

// Observações reais do Tesouro (STA), consultadas em 14/10/2026.
const OBS_EMBRATEL =
  'PGTO DO(S) INSTR.(S) DE COBRANCA(S) NUM.(S): 50.961-0, CONTRATO Nº: 00020/2020 - 09.132.659/0001-76 - EMBRATEL TVSAT TELECOMUNICACOES SA, PROC.(S) NUM.(S): 08020.007918/2019-71, DO(S) FORNECIMENTO(S)/SERVICO(S) PRESTADO(S) AO(S) MES(ES): 04/2024.';
const OBS_LISTA = 'PGTO DO(S) INSTR.(S) DE COBRANCA(S) NUM.(S): 72834, 73469, 74833, 73468, CONTRATO Nº: 00055/2023 - 06.157.430/0001-00';
const OBS_PONTO = 'PGTO. DOS INST. DE COBRANCA: 599444, 599445, 599446, 599447, E 599448. CONTRATO 75/2023 - 59.104.760/0001-91 -';
const OBS_NF = 'PAGAMENTO DAS NF 40239 40251 40223. CONTRATO Nº 99/2024 (32554104), CELEBRADO COM A EMPRESA SANTIAGO E CINTRA';

const tabelas: Record<string, any[]> = {};
function consulta(tabela: string) {
  const q: any = { select: () => q, eq: () => q, not: () => q, range: async () => ({ data: tabelas[tabela] ?? [], error: null }) };
  return q;
}
const rpc = vi.fn(async (_nome: string, args: any) => ({ data: (args.p_ordens as any[]).length, error: null }));
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: (t: string) => consulta(t), rpc: (n: string, a: any) => rpc(n, a) } }));
vi.mock('../sincronizacaoFontesService', async (orig) => ({
  ...(await orig<typeof import('../sincronizacaoFontesService')>()),
  executarComReserva: async (_r: string, _u: string, _o: unknown, tarefa: () => Promise<unknown>) => tarefa()
}));
const sta: Record<string, any[]> = {};
const fetchOb = vi.fn(async (ug: string, np: string) => sta[`${ug}/${np}`] ?? []);
vi.mock('../api', () => ({ fetchContratosGovFaturas: vi.fn(), fetchOrdensBancariasDaNp: (ug: string, np: string) => fetchOb(ug, np) }));
vi.mock('../contratosOficiaisService', () => ({ fetchContratosOficiaisDoBanco: vi.fn(async () => []) }));
vi.mock('../empenhosCarteiraService', async (orig) => ({
  ...(await orig<typeof import('../empenhosCarteiraService')>()),
  contratosComEmpenhoAPagar: vi.fn(async () => new Set())
}));

import { obCitaFatura, npsComPagamento, sincronizarOrdensBancariasDaCarteira } from '../faturasService';

describe('obCitaFatura', () => {
  it('acha o número da fatura como palavra inteira nas observações reais', () => {
    expect(obCitaFatura(OBS_EMBRATEL, '50.961-0')).toBe(true);
    expect(obCitaFatura(OBS_LISTA, '73469')).toBe(true);
    expect(obCitaFatura(OBS_LISTA, '73468')).toBe(true);
    expect(obCitaFatura(OBS_PONTO, '599448')).toBe(true);
    expect(obCitaFatura(OBS_NF, '40223')).toBe(true);
    expect(obCitaFatura(OBS_EMBRATEL.toLowerCase(), '50.961-0')).toBe(true);
  });

  it('não confunde com pedaço de outro número, contrato, ano ou processo', () => {
    expect(obCitaFatura(OBS_LISTA, '7346')).toBe(false);
    expect(obCitaFatura(OBS_LISTA, '734690')).toBe(false);
    expect(obCitaFatura(OBS_EMBRATEL, '2020')).toBe(false);
    expect(obCitaFatura(OBS_EMBRATEL, '2024')).toBe(false);
    expect(obCitaFatura(OBS_EMBRATEL, '50.961')).toBe(false);
    expect(obCitaFatura(OBS_NF, '32554104')).toBe(false);
  });

  it('número curto, vazio ou observação vazia não contam', () => {
    expect(obCitaFatura('PGTO NUM.: 123, CONTRATO', '123')).toBe(false);
    expect(obCitaFatura(OBS_LISTA, null)).toBe(false);
    expect(obCitaFatura(null, '73469')).toBe(false);
  });
});

describe('npsComPagamento', () => {
  const f = (np: string, numero: string, cancelada = false) => ({ np, numero, cancelada });

  it('conta a OB da própria UG e a da outra UG que cita todas as faturas da NP', () => {
    const faturas = [f('2024NP000001', 'A1'), f('2024NP000304', '50.961-0'), f('2026NP000231', '795823'), f('2026NP000231', '886222'), f('2024NP000009', '9999')];
    const obs = [
      { ug: '200330', np: '2024NP000001', observacao: null },
      { ug: '200331', np: '2024NP000304', observacao: OBS_EMBRATEL },
      // cita só uma das duas faturas da NP: a outra pode ser NP distinta de mesmo número na própria UG
      { ug: '200331', np: '2026NP000231', observacao: 'PGTO NUM.(S): 795823, CONTRATO Nº: 00216/2025' },
      // OB da outra UG que não cita a fatura
      { ug: '200331', np: '2024NP000009', observacao: 'PGTO NUM.(S): 1234, CONTRATO Nº: 1/2024' }
    ];
    expect([...npsComPagamento(faturas, obs, '200330')].sort()).toEqual(['2024NP000001', '2024NP000304']);
  });

  it('fatura cancelada não precisa estar citada; UG fora da CGLIC só olha a própria', () => {
    const faturas = [f('2024NP000304', '50.961-0'), f('2024NP000304', '7777', true)];
    const obs = [{ ug: '200331', np: '2024NP000304', observacao: OBS_EMBRATEL }];
    expect([...npsComPagamento(faturas, obs, '200330')]).toEqual(['2024NP000304']);
    expect([...npsComPagamento(faturas, obs, '999999')]).toEqual([]);
  });
});

describe('sincronizarOrdensBancariasDaCarteira: OB paga pela outra UG', () => {
  beforeEach(() => {
    rpc.mockClear();
    fetchOb.mockClear();
    for (const k of Object.keys(sta)) delete sta[k];
    tabelas.contrato_faturas = [
      { np: '2024NP000304', numero: '50.961-0', data_liquidacao: null, cancelada: false },
      { np: '2024NP000500', numero: '51000', data_liquidacao: '2024-05-01', cancelada: false },
      { np: '2024NP000600', numero: '52000', data_liquidacao: '2024-05-01', cancelada: false }
    ];
    tabelas.ordens_bancarias = [];
    tabelas.np_consultas = [];
  });

  it('sem OB na própria UG, grava só a OB da outra UG que cita a fatura, sem registrar a consulta lá', async () => {
    sta['200331/2024NP000304'] = [
      { numero: '2024OB040837', emissao: '2024-05-22', valor: '223.70', cancelamentoob: '0', observacao: OBS_EMBRATEL },
      { numero: '2024OB040900', emissao: '2024-05-23', valor: '10.00', cancelamentoob: '0', observacao: 'PGTO NUM.(S): 1234' }
    ];
    // a própria UG paga a 500; a 600 tem OB na outra UG, mas de outra fatura
    sta['200330/2024NP000500'] = [{ numero: '2024OB000500', emissao: '2024-05-02', valor: '1.00', cancelamentoob: '0' }];
    sta['200331/2024NP000600'] = [{ numero: '2024OB000600', emissao: '2024-05-02', valor: '1.00', cancelamentoob: '0', observacao: 'PGTO NUM.(S): 99999' }];

    const r: any = await sincronizarOrdensBancariasDaCarteira('200330');
    expect(r.status).toBe('SUCESSO');
    expect(r.mensagem).toContain('3 de 3 NP(s) consultada(s)');
    expect(r.mensagem).toContain('2 com ordem bancária');
    expect(r.mensagem).toContain('1 paga(s) pela UG 200331');

    // a NP paga na própria UG não consulta a outra
    expect(fetchOb.mock.calls.map((c) => c.join('/')).sort()).toEqual([
      '200330/2024NP000304',
      '200330/2024NP000500',
      '200330/2024NP000600',
      '200331/2024NP000304',
      '200331/2024NP000600'
    ]);
    const daOutra = rpc.mock.calls.map((c) => c[1]).filter((a: any) => a.p_ug === '200331');
    expect(daOutra).toHaveLength(1);
    expect(daOutra[0]).toMatchObject({ p_np: '2024NP000304', p_registrar_consulta: false });
    expect(daOutra[0].p_ordens.map((o: any) => o.numero)).toEqual(['2024OB040837']);
    // as gravações da própria UG seguem registrando a consulta (sem o parâmetro novo)
    const daPropria = rpc.mock.calls.map((c) => c[1]).filter((a: any) => a.p_ug === '200330');
    expect(daPropria).toHaveLength(3);
    expect(daPropria.every((a: any) => !('p_registrar_consulta' in a))).toBe(true);
  });

  it('NP já paga pela outra UG sai da fila', async () => {
    tabelas.ordens_bancarias = [{ ug: '200331', np: '2024NP000304', observacao: OBS_EMBRATEL }];
    const r: any = await sincronizarOrdensBancariasDaCarteira('200330');
    expect(r.mensagem).toContain('2 de 2 NP(s) consultada(s)');
    expect(fetchOb.mock.calls.some((c) => c[1] === '2024NP000304')).toBe(false);
  });
});
