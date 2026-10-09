import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ArpRecord } from '../../types';

// RPCs da trava (sincronizacao_fontes) observáveis.
const banco = vi.hoisted(() => ({ rpc: null as unknown as ReturnType<typeof vi.fn<(...args: any[]) => Promise<any>>> }));

vi.mock('../supabaseClient', () => {
  banco.rpc = vi.fn<(...args: any[]) => Promise<any>>();
  return { isSupabaseConfigured: true, supabase: { rpc: (...args: unknown[]) => banco.rpc(...args) } };
});

vi.mock('../api', () => ({
  fetchArpsDasFontes: vi.fn(),
  fetchArpItems: vi.fn(),
  fetchPncpProcessoCompra: vi.fn(),
  limparCachesAtas: vi.fn()
}));

vi.mock('../dbCacheService', () => ({
  cacheArpsInDb: vi.fn(),
  cacheArpItemsInDb: vi.fn(),
  gravarProcessoDaAta: vi.fn(),
  fetchEstadoAtasNoBanco: vi.fn()
}));

// Atas publicadas no PNCP sem fornecedor (atas_fornecedor_pncp): leitura, gravação da pendência e conferência.
vi.mock('../fornecedorAtaPncpService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../fornecedorAtaPncpService')>();
  return {
    ...real,
    fetchRegistrosFornecedorPncp: vi.fn().mockResolvedValue([]),
    gravarPendenciasFornecedorPncp: vi.fn().mockResolvedValue(0),
    conferirFornecedorPelaFonte: vi.fn().mockResolvedValue(null)
  };
});

import * as api from '../api';
import * as dbCache from '../dbCacheService';
import * as fornecedorPncp from '../fornecedorAtaPncpService';
import {
  coletarEGravarAtas,
  sincronizarAtas,
  uasgsSincronizandoAtasAgora,
  ataPrecisaDeItens,
  atasSemProcessoConsultado,
  JANELA_VIGENCIA_ATAS,
  ITENS_VALIDADE_DIAS
} from '../syncService';

const UASG = '200331';

function ata(n: number): ArpRecord {
  return {
    numeroAtaRegistroPreco: `${String(n).padStart(5, '0')}/2025`,
    codigoUnidadeGerenciadora: UASG,
    dataVigenciaInicial: '2025-01-01',
    dataVigenciaFinal: '2026-12-31'
  } as ArpRecord;
}

function rpcsPadrao(reservou = true) {
  banco.rpc.mockImplementation(async (nome: string) => {
    if (nome === 'reservar_sincronizacao') return { data: reservou, error: null };
    if (nome === 'concluir_sincronizacao') return { data: true, error: null };
    return { data: null, error: { message: `rpc inesperada ${nome}` } };
  });
}

const chamadas = (nome: string) => banco.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args);
const params = { ...JANELA_VIGENCIA_ATAS, codigoUnidadeGerenciadora: UASG, numeroAtaRegistroPreco: '' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbCache.cacheArpsInDb).mockResolvedValue(true);
  vi.mocked(dbCache.cacheArpItemsInDb).mockResolvedValue(true);
  // Por padrão o banco não tem nada: todas as atas precisam de itens (comportamento da primeira sincronização).
  vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockResolvedValue(new Map());
  vi.mocked(api.fetchArpItems).mockResolvedValue({ resultado: [{ numeroItem: '00001' } as any], totalRegistros: 1, totalPaginas: 1, paginasRestantes: 0 });
});

describe('coletarEGravarAtas', () => {
  it('grava as atas e os itens de cada uma e informa o progresso', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2), ata(3), ata(4), ata(5), ata(6), ata(7)]);
    const progresso: number[] = [];
    const r = await coletarEGravarAtas(params, { onProgress: (p) => progresso.push(p.percent) });
    expect(r).toEqual({ status: 'SUCESSO', total: 7, fontesComFalha: [] });
    expect(dbCache.cacheArpsInDb).toHaveBeenCalledTimes(1);
    expect(dbCache.cacheArpItemsInDb).toHaveBeenCalledTimes(7);
    expect(progresso.at(-1)).toBe(100);
  });

  it('falha da fonte de atas vira erro (não cai para o banco como se fosse dado novo)', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockRejectedValueOnce(new Error('Compras.gov.br respondeu 503 na consulta de atas.'));
    await expect(coletarEGravarAtas(params)).rejects.toThrow('503');
    expect(dbCache.cacheArpsInDb).not.toHaveBeenCalled();
  });

  it('atas que não puderam ser gravadas viram erro', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1)]);
    vi.mocked(dbCache.cacheArpsInDb).mockResolvedValueOnce(false);
    await expect(coletarEGravarAtas(params)).rejects.toThrow('gravar as atas');
  });

  it('itens que não puderam ser gravados: resultado PARCIAL', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2)]);
    vi.mocked(dbCache.cacheArpItemsInDb).mockResolvedValueOnce(false);
    const r = await coletarEGravarAtas(params);
    expect(r).toEqual({
      status: 'PARCIAL',
      total: 2,
      fontesComFalha: ['Itens das atas'],
      mensagem: 'não foi possível gravar os itens de 1 ata no banco.'
    });
  });

  it('fonte recusou os itens (429) de uma ata: PARCIAL, e as outras seguem', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2), ata(3)]);
    vi.mocked(api.fetchArpItems).mockRejectedValueOnce(new Error('Compras.gov.br recusou por excesso de requisições (429).'));
    const r = await coletarEGravarAtas(params);
    expect(r).toMatchObject({ status: 'PARCIAL', total: 3, mensagem: 'o Compras.gov.br não entregou os itens de 1 ata.' });
    expect(dbCache.cacheArpItemsInDb).toHaveBeenCalledTimes(2);
    // Além de `estrito`, a sincronização passa a indicação de fornecedor e o coletor de pendências (atas_fornecedor_pncp).
    expect(vi.mocked(api.fetchArpItems).mock.calls[0][4]).toEqual(expect.objectContaining({ estrito: true }));
  });

  it('fornecedor indicado pelo coordenador vai às consultas; pendência detectada é gravada no fim', async () => {
    const CTRL = '00394494000136-1-001667/2025-000002';
    vi.mocked(fornecedorPncp.fetchRegistrosFornecedorPncp).mockResolvedValueOnce([
      { numeroControlePncp: CTRL, numeroAta: '00043/2026', codigoUasg: UASG, estado: 'INDICADO', fornecedorIdentificador: 'ESTRANG0000440', candidatos: [], itensSemResultado: [], detectadoEm: '', atualizadoEm: '' }
    ]);
    const a42 = { ...ata(42), numeroControlePncpAta: '00394494000136-1-001667/2025-000001' };
    vi.mocked(api.fetchArpsDasFontes).mockImplementationOnce(async (_p, opts) => {
      // A lista do PNCP detecta a pendência da 42 e recebe a indicação da 43.
      expect(opts?.fornecedorIndicado?.(CTRL)).toBe('ESTRANG0000440');
      expect(opts?.fornecedorIndicado?.('outra')).toBeUndefined();
      opts?.aoDetectarPendencia?.({ numeroControlePncpAta: a42.numeroControlePncpAta, numeroAta: a42.numeroAtaRegistroPreco, uasg: UASG, numeroControlePncpCompra: 'c', anoCompra: '2025', atasNaCompra: 2, candidatos: [], itensSemResultado: [] });
      return [a42];
    });
    vi.mocked(api.fetchArpItems).mockResolvedValueOnce({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0, origem: 'PNCP' });
    const r = await coletarEGravarAtas(params);
    expect(r.status).toBe('SUCESSO');
    expect(vi.mocked(api.fetchArpItems).mock.calls[0][4]).toMatchObject({ estrito: true });
    expect(fornecedorPncp.gravarPendenciasFornecedorPncp).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fornecedorPncp.gravarPendenciasFornecedorPncp).mock.calls[0][0].map((p) => p.numeroControlePncpAta)).toEqual([a42.numeroControlePncpAta]);
    expect(fornecedorPncp.conferirFornecedorPelaFonte).not.toHaveBeenCalled();
  });

  it('ata que já tem itens no banco não vira pendência, mesmo se a releitura caiu no PNCP (caso 00102/2024)', async () => {
    const CTRL = '00394494000136-1-001169/2024-000005';
    const a102 = { ...ata(102), numeroAtaRegistroPreco: '00102/2024', numeroControlePncpAta: CTRL };
    vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockResolvedValueOnce(new Map([['00102/2024', { itens: 1, itensLidosEmMaisAntigo: '2026-10-02T15:32:08Z' } as any]]));
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([a102]);
    vi.mocked(api.fetchArpItems).mockImplementationOnce(async (_d, _u, _n, _ctx, opts) => {
      opts?.aoDetectarPendencia?.({ numeroControlePncpAta: CTRL, numeroAta: '00102/2024', uasg: UASG, numeroControlePncpCompra: 'c', anoCompra: '2024', atasNaCompra: 5, candidatos: [], itensSemResultado: [] });
      return { resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0, origem: 'PNCP' };
    });
    await coletarEGravarAtas(params);
    expect(api.fetchArpItems).toHaveBeenCalledTimes(1);
    expect(fornecedorPncp.gravarPendenciasFornecedorPncp).not.toHaveBeenCalled();
  });

  it('Compras.gov.br publicou a ata: a indicação é conferida e a pendência detectada nesta execução não é gravada', async () => {
    const CTRL = '00394494000136-1-001667/2025-000002';
    const registro = { numeroControlePncp: CTRL, numeroAta: '00043/2026', codigoUasg: UASG, estado: 'PENDENTE' as const, candidatos: [], itensSemResultado: [], detectadoEm: '', atualizadoEm: '' };
    vi.mocked(fornecedorPncp.fetchRegistrosFornecedorPncp).mockResolvedValueOnce([registro]);
    const a43 = { ...ata(43), numeroControlePncpAta: CTRL };
    vi.mocked(api.fetchArpsDasFontes).mockImplementationOnce(async (_p, opts) => {
      opts?.aoDetectarPendencia?.({ numeroControlePncpAta: CTRL, numeroAta: '00043/2026', uasg: UASG, numeroControlePncpCompra: 'c', anoCompra: '2025', atasNaCompra: 2, candidatos: [], itensSemResultado: [] });
      return [a43];
    });
    const itens = [{ numeroItem: '00003', niFornecedor: 'ESTRANG0000440' } as any];
    vi.mocked(api.fetchArpItems).mockResolvedValueOnce({ resultado: itens, totalRegistros: 1, totalPaginas: 1, paginasRestantes: 0, origem: 'COMPRAS_GOV' });
    await coletarEGravarAtas(params);
    expect(fornecedorPncp.conferirFornecedorPelaFonte).toHaveBeenCalledWith(registro, itens);
    expect(fornecedorPncp.gravarPendenciasFornecedorPncp).not.toHaveBeenCalled();
    expect(dbCache.cacheArpItemsInDb).toHaveBeenCalledTimes(1);
  });

  it('ata sem itens nas fontes não é falha nem tenta gravar itens vazios', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1)]);
    vi.mocked(api.fetchArpItems).mockResolvedValueOnce({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
    const r = await coletarEGravarAtas(params);
    expect(r.status).toBe('SUCESSO');
    expect(dbCache.cacheArpItemsInDb).not.toHaveBeenCalled();
  });
});

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-10-06T12:00:00Z');
const dias = (n: number) => new Date(AGORA - n * DIA).toISOString();
const ataCom = (n: number, extra: Partial<ArpRecord> = {}) => ({ ...ata(n), ...extra });
const estado = (itens: number, lidoHaDias: number | null) => ({ itens, itensLidosEmMaisAntigo: lidoHaDias === null ? null : dias(lidoHaDias) });

describe('ataPrecisaDeItens — só relê os itens que precisam', () => {
  it('forçar sempre relê', () => {
    expect(ataPrecisaDeItens(ata(1), estado(3, 0), AGORA, true)).toBe(true);
  });
  it('ata nova (sem registro no banco) ou sem itens gravados: relê', () => {
    expect(ataPrecisaDeItens(ata(1), undefined, AGORA, false)).toBe(true);
    expect(ataPrecisaDeItens(ata(1), estado(0, null), AGORA, false)).toBe(true);
  });
  it('itens lidos há mais de 7 dias: relê (renovação periódica)', () => {
    expect(ataPrecisaDeItens(ata(1), estado(3, ITENS_VALIDADE_DIAS + 1), AGORA, false)).toBe(true);
  });
  it('ata alterada na fonte nos últimos 2 dias: relê', () => {
    expect(ataPrecisaDeItens(ataCom(1, { dataHoraAtualizacao: dias(1) }), estado(3, 1), AGORA, false)).toBe(true);
  });
  it('itens recentes e ata sem alteração recente: não relê', () => {
    expect(ataPrecisaDeItens(ataCom(1, { dataHoraAtualizacao: dias(30) }), estado(3, 1), AGORA, false)).toBe(false);
    expect(ataPrecisaDeItens(ata(1), estado(3, 1), AGORA, false)).toBe(false);
  });
  it('data de leitura ilegível: relê por segurança', () => {
    expect(ataPrecisaDeItens(ata(1), { itens: 2, itensLidosEmMaisAntigo: 'lixo' }, AGORA, false)).toBe(true);
  });
});

describe('coletarEGravarAtas — incremental e com orçamento de tempo', () => {
  it('atas com itens recentes não têm os itens consultados de novo (só a lista é relida)', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2), ata(3)]);
    vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockResolvedValueOnce(new Map([
      ['00001/2025', estado(2, 1)], ['00002/2025', estado(2, 1)]  // a 3 é nova
    ]));
    const r = await coletarEGravarAtas(params, { agora: () => AGORA });
    expect(r).toEqual({ status: 'SUCESSO', total: 3, fontesComFalha: [] });
    expect(dbCache.cacheArpsInDb).toHaveBeenCalledTimes(1);
    expect(api.fetchArpItems).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.fetchArpItems).mock.calls[0][2]).toBe('00003/2025');
  });

  it('o estado do banco é lido ANTES de gravar a lista nova', async () => {
    const ordem: string[] = [];
    vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockImplementationOnce(async () => { ordem.push('estado'); return new Map(); });
    vi.mocked(api.fetchArpsDasFontes).mockImplementationOnce(async () => { ordem.push('fontes'); return [ata(1)]; });
    vi.mocked(dbCache.cacheArpsInDb).mockImplementationOnce(async () => { ordem.push('grava'); return true; });
    await coletarEGravarAtas(params);
    expect(ordem).toEqual(['estado', 'fontes', 'grava']);
  });

  it('forçar relê os itens de todas, mesmo as em dia', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2)]);
    vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockResolvedValueOnce(new Map([['00001/2025', estado(2, 0)], ['00002/2025', estado(2, 0)]]));
    await coletarEGravarAtas(params, { forcar: true, agora: () => AGORA });
    expect(api.fetchArpItems).toHaveBeenCalledTimes(2);
  });

  it('entre as que precisam, as de itens lidos há mais tempo vêm antes (releitura forçada que estoura o tempo continua de onde parou)', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2), ata(3)]);
    vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockResolvedValueOnce(new Map([
      ['00001/2025', estado(2, 1)], ['00002/2025', estado(2, 6)], ['00003/2025', estado(2, 3)]
    ]));
    await coletarEGravarAtas(params, { forcar: true, agora: () => AGORA });
    expect(vi.mocked(api.fetchArpItems).mock.calls.map((c) => c[2])).toEqual(['00002/2025', '00003/2025', '00001/2025']);
  });

  it('as atas sem itens vão primeiro', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2), ata(3)]);
    vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockResolvedValueOnce(new Map([
      ['00001/2025', estado(2, 10)], ['00002/2025', estado(0, null)], ['00003/2025', estado(2, 10)]
    ]));
    await coletarEGravarAtas(params, { agora: () => AGORA });
    const ordem = vi.mocked(api.fetchArpItems).mock.calls.map((c) => c[2]);
    expect(ordem[0]).toBe('00002/2025');
    expect(ordem).toHaveLength(3);
  });

  it('estourou o orçamento de tempo: para, grava o que tem e avisa que o resto fica para a próxima', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2), ata(3), ata(4), ata(5), ata(6)]);
    let relogio = 0;
    // cada leitura do relógio avança 40 s: o orçamento de 100 s estoura depois de 2 lotes
    const agora = () => (relogio += 40_000);
    const r = await coletarEGravarAtas(params, { orcamentoMs: 100_000, agora });
    expect(r.status).toBe('PARCIAL');
    expect(r).toMatchObject({ total: 6, fontesComFalha: ['Itens das atas'] });
    expect('mensagem' in r && r.mensagem).toMatch(/o tempo da execução acabou e os itens de \d+ atas? ficam para a próxima/);
    const lidas = vi.mocked(api.fetchArpItems).mock.calls.length;
    expect(lidas).toBeGreaterThan(0);
    expect(lidas).toBeLessThan(6);
  });

  it('sem orçamento (navegador): não corta', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2), ata(3), ata(4), ata(5)]);
    let relogio = 0;
    await coletarEGravarAtas(params, { agora: () => (relogio += 1_000_000) });
    expect(api.fetchArpItems).toHaveBeenCalledTimes(5);
  });
});

describe('sincronizarAtas — trava no banco', () => {
  it('sem a reserva (outro navegador sincronizando ou dados na validade), não consulta as fontes', async () => {
    rpcsPadrao(false);
    const r = await sincronizarAtas(UASG);
    expect(r.status).toBe('NAO_RESERVADO');
    expect(api.fetchArpsDasFontes).not.toHaveBeenCalled();
    expect(chamadas('reservar_sincronizacao')[0]).toMatchObject({ p_recurso: 'atas', p_uasg: UASG, p_forcar: false });
  });

  it('com a reserva: limpa os caches em memória, sincroniza e registra SUCESSO', async () => {
    rpcsPadrao(true);
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2)]);
    const r = await sincronizarAtas(UASG, { forcar: true });
    expect(r).toEqual({ status: 'SUCESSO', total: 2, fontesComFalha: [] });
    expect(api.limparCachesAtas).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.fetchArpsDasFontes).mock.calls[0][0]).toMatchObject({ codigoUnidadeGerenciadora: UASG, ...JANELA_VIGENCIA_ATAS });
    expect(chamadas('reservar_sincronizacao')[0]).toMatchObject({ p_forcar: true });
    expect(chamadas('concluir_sincronizacao')[0]).toMatchObject({ p_recurso: 'atas', p_status: 'SUCESSO', p_total: 2 });
    expect(uasgsSincronizandoAtasAgora()).toEqual([]);
  });

  it('fonte fora do ar: registra ERRO com a mensagem e libera a trava', async () => {
    rpcsPadrao(true);
    vi.mocked(api.fetchArpsDasFontes).mockRejectedValueOnce(new Error('Compras.gov.br respondeu 503 na consulta de atas.'));
    const r = await sincronizarAtas(UASG);
    expect(r.status).toBe('ERRO');
    expect(chamadas('concluir_sincronizacao')[0]).toMatchObject({ p_status: 'ERRO', p_mensagem: 'Compras.gov.br respondeu 503 na consulta de atas.' });
    expect(uasgsSincronizandoAtasAgora()).toEqual([]);
  });
});

describe('processo da compra das atas', () => {
  const comCompra = (n: number) => ataCom(n, { numeroControlePncpCompra: `00394494000136-1-${String(n).padStart(6, '0')}/2025` });
  const semProcesso: { itens: number; itensLidosEmMaisAntigo: string | null; processoCompra: string | null } = { itens: 0, itensLidosEmMaisAntigo: null, processoCompra: null };

  it('só consulta o PNCP para a ata que ainda não tem o processo consultado', () => {
    const estadoBanco = new Map([
      [ata(1).numeroAtaRegistroPreco, { ...semProcesso, processoCompra: '08020001450202479' }],
      [ata(2).numeroAtaRegistroPreco, { ...semProcesso, processoCompra: '' }],
      [ata(3).numeroAtaRegistroPreco, semProcesso]
    ]);
    const pendentes = atasSemProcessoConsultado([comCompra(1), comCompra(2), comCompra(3), comCompra(4)], estadoBanco);
    // 1 já tem, 2 o PNCP já respondeu sem processo, 3 não consultada, 4 é nova (sem registro no banco)
    expect(pendentes.map((a) => a.numeroAtaRegistroPreco)).toEqual([ata(3).numeroAtaRegistroPreco, ata(4).numeroAtaRegistroPreco]);
  });

  it('ata sem o identificador da compra não é consultada', () => {
    expect(atasSemProcessoConsultado([ataCom(1, { numeroControlePncpCompra: '' })], new Map())).toEqual([]);
  });

  it('a coleta grava o processo uma vez por compra e ignora consulta que falhou', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([comCompra(1), comCompra(2)]);
    vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockResolvedValueOnce(new Map());
    vi.mocked(dbCache.cacheArpsInDb).mockResolvedValueOnce(true);
    vi.mocked(api.fetchPncpProcessoCompra).mockResolvedValueOnce('08020001450202479').mockResolvedValueOnce(null);
    vi.mocked(api.fetchArpItems).mockResolvedValue({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
    await coletarEGravarAtas(params);
    expect(dbCache.gravarProcessoDaAta).toHaveBeenCalledTimes(1);
    expect(dbCache.gravarProcessoDaAta).toHaveBeenCalledWith(ata(1).numeroAtaRegistroPreco, UASG, '08020001450202479');
  });

  it('o passo do processo tem relógio próprio: leitura lenta da lista não o impede de consultar', async () => {
    let t = 0;
    const agora = () => t;
    vi.mocked(api.fetchArpsDasFontes).mockImplementationOnce(async () => { t += 60_000; return [comCompra(1)]; });
    vi.mocked(dbCache.fetchEstadoAtasNoBanco).mockResolvedValueOnce(new Map());
    vi.mocked(dbCache.cacheArpsInDb).mockResolvedValueOnce(true);
    vi.mocked(api.fetchPncpProcessoCompra).mockResolvedValueOnce('08020001450202479');
    vi.mocked(api.fetchArpItems).mockResolvedValue({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
    await coletarEGravarAtas(params, { agora, orcamentoMs: 100_000 });
    expect(dbCache.gravarProcessoDaAta).toHaveBeenCalledWith(ata(1).numeroAtaRegistroPreco, UASG, '08020001450202479');
  });
});
