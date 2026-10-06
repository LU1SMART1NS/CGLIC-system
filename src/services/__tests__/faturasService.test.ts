import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizarFatura,
  normalizarOrdemBancaria,
  filaDeNps,
  filaDeContratos,
  processarComOrcamento
} from '../faturasService';
import { fetchContratosGovFaturas, fetchOrdensBancariasDaNp } from '../api';
import { RECONSULTA_HORAS } from '../empenhosCarteiraService';

// Fatura real (contrato 00021/2017, id 22571), resumida.
const faturaReal = {
  id: 1267717,
  contrato_id: 22571,
  sfadrao_id: '2025NP000545',
  numero: '131503',
  tipo_instrumento_cobranca: 'Nota Fiscal Eletrônica',
  emissao: '2019-12-30',
  vencimento: '2025-10-03',
  valor: '663,38',
  glosa: '0,00',
  valorliquido: '663,38',
  data_liquidacao: '2025-10-10',
  nota_cancelada: 'Não',
  processo: '11397572',
  situacao: 'Siafi Apropriado',
  contratante: '200331 - SENASP',
  dados_referencia: [{ mesref: '12', anoref: '2019', valorref: '663,38' }],
  dados_empenho: [{ id_empenho: 8812290, numero_empenho: '2022NE000245', valor_empenho: '663,38', subelemento: '07' }]
};

// OB real da NP 2025NP000564: a primeira foi cancelada e reemitida.
const obCancelada = {
  ug: '200331', gestao: '00001', numero: '2025OB093118', emissao: '2025-10-23', valor: '3474599.32',
  cancelamentoob: '1', numeroobcancelamento: '200331000012025OB093369', tipoob: '3', documentoorigem: '2025NP000564',
  empenhos: ['200331000012023NE000280', '200331000012023NE000281'], banco: '237', agencia: '2864', conta: '39659'
};

describe('normalizarFatura', () => {
  it('converte valores, datas, NP, UG do contratante, referência e NEs', () => {
    expect(normalizarFatura(faturaReal)).toEqual({
      id_fatura: 1267717,
      contrato_id_gov: '22571',
      numero: '131503',
      tipo: 'Nota Fiscal Eletrônica',
      emissao: '2019-12-30',
      vencimento: '2025-10-03',
      valor: 663.38,
      glosa: 0,
      valor_liquido: 663.38,
      data_liquidacao: '2025-10-10',
      situacao: 'Siafi Apropriado',
      cancelada: false,
      np: '2025NP000545',
      ug_np: '200331',
      referencia: '12/2019',
      processo: '11397572',
      empenhos: [{ id_empenho_gov: '8812290', numero_empenho: '2022NE000245', valor: 663.38 }]
    });
  });

  it('valor com milhar no formato brasileiro', () => {
    expect(normalizarFatura({ ...faturaReal, valor: '3.959,68' })?.valor).toBe(3959.68);
  });

  it('nota cancelada ou "Siafi Cancelado" é cancelada; NP fora do formato vira nula', () => {
    expect(normalizarFatura({ ...faturaReal, nota_cancelada: 'Sim' })?.cancelada).toBe(true);
    expect(normalizarFatura({ ...faturaReal, situacao: 'Siafi Cancelado' })?.cancelada).toBe(true);
    expect(normalizarFatura({ ...faturaReal, sfadrao_id: '' })?.np).toBeNull();
  });

  it('sem id não grava', () => {
    expect(normalizarFatura({ ...faturaReal, id: null })).toBeNull();
  });
});

describe('normalizarOrdemBancaria', () => {
  it('marca a OB cancelada, guarda a de cancelamento e reduz as NEs ao número', () => {
    expect(normalizarOrdemBancaria(obCancelada)).toMatchObject({
      numero: '2025OB093118',
      gestao: '00001',
      emissao: '2025-10-23',
      valor: 3474599.32,
      cancelada: true,
      ob_cancelamento: '200331000012025OB093369',
      empenhos: ['2023NE000280', '2023NE000281']
    });
    expect(normalizarOrdemBancaria({ ...obCancelada, cancelamentoob: '0' })?.cancelada).toBe(false);
  });

  it('número que não é de OB não grava', () => {
    expect(normalizarOrdemBancaria({ ...obCancelada, numero: '2025NP000564' })).toBeNull();
  });
});

describe('filas', () => {
  const agora = new Date('2026-10-06T20:00:00Z').getTime();
  const ha = (h: number) => new Date(agora - h * 3600_000).toISOString();

  it('NPs: só as sem OB válida e não canceladas; nunca consultadas primeiro; tira as consultadas há pouco', () => {
    const faturas = [
      { np: '2025NP000001', data_liquidacao: '2025-10-01', cancelada: false },
      { np: '2025NP000002', data_liquidacao: '2025-10-01', cancelada: false },
      { np: '2025NP000003', data_liquidacao: null, cancelada: false },
      { np: '2025NP000004', data_liquidacao: '2025-10-01', cancelada: true },
      { np: '2025NP000005', data_liquidacao: '2025-10-01', cancelada: false },
      { np: '2025NP000005', data_liquidacao: '2025-10-02', cancelada: false },
      { np: null, data_liquidacao: null, cancelada: false }
    ];
    const comOb = new Set(['2025NP000001']);
    const consultas = new Map([
      ['2025NP000002', ha(RECONSULTA_HORAS - 1)],
      ['2025NP000005', ha(30)]
    ]);
    expect(filaDeNps(faturas, comOb, consultas, { agora })).toEqual(['2025NP000003', '2025NP000005']);
    expect(filaDeNps(faturas, comOb, consultas, { agora, forcar: true })).toEqual(['2025NP000003', '2025NP000005', '2025NP000002']);
  });

  it('contratos: nunca sincronizados primeiro, depois o mais antigo', () => {
    const c = (id: string) => ({ id, uasg: '200331', numero: '', ano: '' }) as any;
    const sinc = new Map([['200331-00001-2026', ha(50)], ['200331-00002-2026', ha(1)]]);
    expect(filaDeContratos([c('200331-00001-2026'), c('200331-00002-2026'), c('200331-00003-2026')], sinc, { agora }).map((x) => x.id)).toEqual([
      '200331-00003-2026',
      '200331-00001-2026'
    ]);
  });

  it('processarComOrcamento não começa itens depois do orçamento', async () => {
    let t = 0;
    const feitos: number[] = [];
    const r = await processarComOrcamento([1, 2, 3, 4], async (n) => { t += 50; feitos.push(n); }, { orcamentoMs: 100, concorrencia: 1, agora: () => t });
    expect(feitos).toEqual([1, 2, 3]);
    expect(r).toEqual({ processados: 3, adiados: 1 });
  });
});

describe('busca nas fontes', () => {
  afterEach(() => vi.unstubAllGlobals());
  const resposta = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as unknown as Response;

  it('faturas: lista quando 200, erro com o status quando falha', async () => {
    const fetchMock = vi.fn(async (_url: string) => resposta(200, [faturaReal]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchContratosGovFaturas(22571)).resolves.toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api-contratos-gov/api/contrato/22571/faturas');
    vi.stubGlobal('fetch', vi.fn(async () => resposta(500, null)));
    await expect(fetchContratosGovFaturas(22571)).rejects.toThrow(/respondeu 500/);
  });

  it('ordens bancárias: UG + gestão 00001 + NP no STA', async () => {
    const fetchMock = vi.fn(async (_url: string) => resposta(200, []));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchOrdensBancariasDaNp('200331', '2025NP000545')).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api-sta/api/ordembancaria/documento/200331000012025NP000545');
    vi.stubGlobal('fetch', vi.fn(async () => resposta(503, null)));
    await expect(fetchOrdensBancariasDaNp('200331', '2025NP000545')).rejects.toThrow(/Tesouro \(STA\) respondeu 503/);
  });
});
