/**
 * Saldo por item (v_arp_item_saldo_detalhado): a falha da consulta vira erro. Antes ela devolvia [] e a Carteira
 * guardava o vazio por 5 min, zerando o filtro "Qtd. assinada" (16/10/2026: 0 de 214 atas em vez de 196).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, select, eq, resposta } = vi.hoisted(() => {
  const resposta: { atual: { data: any[] | null; error: any } } = { atual: { data: [], error: null } };
  const consulta: any = {};
  const select = vi.fn(() => consulta);
  const eq = vi.fn(() => consulta);
  consulta.eq = eq;
  consulta.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resposta.atual).then(ok, falha);
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, resposta };
});

vi.mock('../supabaseClient', () => ({ supabase: { from }, isSupabaseConfigured: true }));

import { COLUNAS_SALDO_CARTEIRA, fetchArpItemSaldosFromDb } from '../dashboardService';

describe('fetchArpItemSaldosFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resposta.atual = { data: [], error: null };
  });

  it('erro da consulta (ex.: tempo limite) vira exceção, e não uma lista vazia', async () => {
    resposta.atual = { data: null, error: { message: 'canceling statement due to statement timeout' } };
    await expect(fetchArpItemSaldosFromDb('200331')).rejects.toThrow(/Não foi possível ler o saldo dos itens: canceling statement/);
  });

  it('pede só as colunas informadas e filtra pela carteira da UASG', async () => {
    resposta.atual = { data: [{ numero_ata: '00001/2026' }], error: null };
    const linhas = await fetchArpItemSaldosFromDb('200331', COLUNAS_SALDO_CARTEIRA);
    expect(from).toHaveBeenCalledWith('v_arp_item_saldo_detalhado');
    expect(select).toHaveBeenCalledWith(COLUNAS_SALDO_CARTEIRA.join(','));
    expect(eq).toHaveBeenCalledWith('uasg_carteira', '200331');
    expect(linhas).toEqual([{ numero_ata: '00001/2026' }]);
  });

  it('sem colunas, lê a view inteira (Ata 360, Item, Visão Geral)', async () => {
    await fetchArpItemSaldosFromDb('200331');
    expect(select).toHaveBeenCalledWith('*');
  });

  it('as colunas da carteira cobrem o que a situação da ata assinada e o consumo usam', () => {
    for (const coluna of [
      'quantidade_base_senasp',
      'percentual_consumido',
      'quantidade_consumida',
      'ata_assinada_informada',
      'assinada_senasp_participante',
      'outros_orgaos_registrados',
      'papel_senasp',
      'quantidade_contratada_sem_unidade'
    ]) {
      expect(COLUNAS_SALDO_CARTEIRA).toContain(coluna);
    }
  });
});
