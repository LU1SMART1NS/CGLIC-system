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
const rpc = vi.fn(async (nome: string, args: any): Promise<any> =>
  nome === 'recalcular_pagamento_faturas' ? { data: { alteradas: 3, removidas: 0 }, error: null } : { data: (args.p_ordens as any[]).length, error: null }
);
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

import { obCitaFatura, npsConfirmadas, sincronizarOrdensBancariasDaCarteira } from '../faturasService';

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

  it('número só de dígitos vale com ou sem zeros à esquerda, dos dois lados', () => {
    // carta de crédito do contrato 00202/2025: fatura "000003007", OB 2026OB002064 da UG 200330
    const carta = 'PAGAMENTO DA CARTA DE CREDITO REFERENTE A INVOICE 3007, CONTRATO 202/2025 - FIRMADO COM A EMPRESA SIG SAUER';
    expect(obCitaFatura(carta, '000003007')).toBe(true);
    expect(obCitaFatura('PGTO NUM.(S): 000003007, CONTRATO', '3007')).toBe(true);
    expect(obCitaFatura('PGTO NUM.(S): 6764681, CONTRATO', '006764681')).toBe(true);
    expect(obCitaFatura('PGTO NUM.(S): 30070, CONTRATO', '000003007')).toBe(false);
    expect(obCitaFatura('PGTO NUM.(S): 13007, CONTRATO', '000003007')).toBe(false);
    // o ano do contrato continua fora, mesmo com zeros
    expect(obCitaFatura(carta, '0002025')).toBe(false);
    // número com pontuação continua exato
    expect(obCitaFatura('PGTO NUM.(S): 50.961-0, CONTRATO', '050.961-0')).toBe(false);
  });

  it('número curto, vazio ou observação vazia não contam', () => {
    expect(obCitaFatura('PGTO NUM.: 123, CONTRATO', '123')).toBe(false);
    expect(obCitaFatura('PGTO NUM.: 123, CONTRATO', '0000123')).toBe(false);
    expect(obCitaFatura('PGTO NUM.: 0000, CONTRATO', '0000')).toBe(false);
    expect(obCitaFatura(OBS_LISTA, null)).toBe(false);
    expect(obCitaFatura(null, '73469')).toBe(false);
  });
});

describe('npsConfirmadas', () => {
  const f = (np: string, ordens_bancarias: string | null, cancelada = false) => ({ np, ordens_bancarias, cancelada });

  it('NP sai da fila só quando todas as faturas não canceladas têm OB que confirma', () => {
    const faturas = [
      f('2024NP000001', '2024OB000001'),
      f('2026NP000231', '2026OB002534'),
      f('2026NP000231', null), // mesma NP, fatura de outro contrato sem pagamento confirmado
      f('2026NP000204', null), // OB da NP é de outra despesa: "a conferir"
      f('2024NP000304', '2024OB040837'),
      f('2024NP000304', null, true) // cancelada não conta
    ];
    expect([...npsConfirmadas(faturas)].sort()).toEqual(['2024NP000001', '2024NP000304']);
  });
});

describe('sincronizarOrdensBancariasDaCarteira: OB paga pela outra UG', () => {
  beforeEach(() => {
    rpc.mockClear();
    fetchOb.mockClear();
    for (const k of Object.keys(sta)) delete sta[k];
    tabelas.v_contrato_faturas = [
      { np: '2024NP000304', numero: '50.961-0', data_liquidacao: null, cancelada: false, ordens_bancarias: null },
      { np: '2024NP000500', numero: '51000', data_liquidacao: '2024-05-01', cancelada: false, ordens_bancarias: null },
      { np: '2024NP000600', numero: '52000', data_liquidacao: '2024-05-01', cancelada: false, ordens_bancarias: null }
    ];
    tabelas.np_consultas = [];
  });

  it('consulta as duas UGs; da outra grava só a OB que cita a fatura, sem registrar a consulta lá; recalcula no fim', async () => {
    sta['200331/2024NP000304'] = [
      { numero: '2024OB040837', emissao: '2024-05-22', valor: '223.70', cancelamentoob: '0', observacao: OBS_EMBRATEL },
      { numero: '2024OB040900', emissao: '2024-05-23', valor: '10.00', cancelamentoob: '0', observacao: 'PGTO NUM.(S): 1234' }
    ];
    // a 500 tem OB na própria UG (ainda não confirmada); a 600 tem OB na outra UG, mas de outra fatura
    sta['200330/2024NP000500'] = [{ numero: '2024OB000500', emissao: '2024-05-02', valor: '1.00', cancelamentoob: '0' }];
    sta['200331/2024NP000600'] = [{ numero: '2024OB000600', emissao: '2024-05-02', valor: '1.00', cancelamentoob: '0', observacao: 'PGTO NUM.(S): 99999' }];

    const r: any = await sincronizarOrdensBancariasDaCarteira('200330');
    expect(r.status).toBe('SUCESSO');
    expect(r.mensagem).toContain('3 de 3 NP(s) consultada(s)');
    expect(r.mensagem).toContain('2 com ordem bancária');
    expect(r.mensagem).toContain('1 com OB na UG 200331');
    expect(r.mensagem).toContain('pagamento recalculado em 3 fatura(s)');

    // a OB da própria UG pode ser de outra despesa: a outra UG é consultada para todas as NPs da fila
    expect(fetchOb.mock.calls.map((c) => c.join('/')).sort()).toEqual([
      '200330/2024NP000304',
      '200330/2024NP000500',
      '200330/2024NP000600',
      '200331/2024NP000304',
      '200331/2024NP000500',
      '200331/2024NP000600'
    ]);
    expect(rpc.mock.calls.filter((c) => c[0] === 'recalcular_pagamento_faturas')).toHaveLength(1);
    const daOutra = rpc.mock.calls.map((c) => c[1]).filter((a: any) => a?.p_ug === '200331');
    expect(daOutra).toHaveLength(1);
    expect(daOutra[0]).toMatchObject({ p_np: '2024NP000304', p_registrar_consulta: false });
    expect(daOutra[0].p_ordens.map((o: any) => o.numero)).toEqual(['2024OB040837']);
    // as gravações da própria UG seguem registrando a consulta (sem o parâmetro novo)
    const daPropria = rpc.mock.calls.map((c) => c[1]).filter((a: any) => a?.p_ug === '200330');
    expect(daPropria).toHaveLength(3);
    expect(daPropria.every((a: any) => !('p_registrar_consulta' in a))).toBe(true);
  });

  it('NP com o pagamento confirmado sai da fila; NP "a conferir" continua', async () => {
    tabelas.v_contrato_faturas[0].ordens_bancarias = '2024OB040837';
    const r: any = await sincronizarOrdensBancariasDaCarteira('200330');
    expect(r.mensagem).toContain('2 de 2 NP(s) consultada(s)');
    expect(fetchOb.mock.calls.some((c) => c[1] === '2024NP000304')).toBe(false);
  });

  it('falha no recálculo vira aviso e deixa a execução parcial, sem perder as OBs gravadas', async () => {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (nome: string, args: any) =>
      nome === 'recalcular_pagamento_faturas' ? { data: null, error: { message: 'tempo esgotado', code: '57014' } as any } : original(nome, args)
    );
    const r: any = await sincronizarOrdensBancariasDaCarteira('200330');
    rpc.mockImplementation(original);
    expect(r.status).toBe('PARCIAL');
    expect(r.mensagem).toContain('recálculo do pagamento');
  });
});
