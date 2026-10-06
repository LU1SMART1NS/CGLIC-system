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
  limparCachesAtas: vi.fn()
}));

vi.mock('../dbCacheService', () => ({
  cacheArpsInDb: vi.fn(),
  cacheArpItemsInDb: vi.fn()
}));

import * as api from '../api';
import * as dbCache from '../dbCacheService';
import { coletarEGravarAtas, sincronizarAtas, uasgsSincronizandoAtasAgora, JANELA_VIGENCIA_ATAS } from '../syncService';

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
  vi.mocked(api.fetchArpItems).mockResolvedValue({ resultado: [{ numeroItem: '00001' } as any], totalRegistros: 1, totalPaginas: 1, paginasRestantes: 0 });
});

describe('coletarEGravarAtas', () => {
  it('grava as atas e os itens de cada uma e informa o progresso', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1), ata(2), ata(3), ata(4), ata(5), ata(6), ata(7)]);
    const progresso: number[] = [];
    const r = await coletarEGravarAtas(params, (p) => progresso.push(p.percent));
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
    expect(vi.mocked(api.fetchArpItems).mock.calls[0][4]).toEqual({ estrito: true });
  });

  it('ata sem itens nas fontes não é falha nem tenta gravar itens vazios', async () => {
    vi.mocked(api.fetchArpsDasFontes).mockResolvedValueOnce([ata(1)]);
    vi.mocked(api.fetchArpItems).mockResolvedValueOnce({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
    const r = await coletarEGravarAtas(params);
    expect(r.status).toBe('SUCESSO');
    expect(dbCache.cacheArpItemsInDb).not.toHaveBeenCalled();
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
