/**
 * Saldo por item (v_arp_item_saldo_detalhado): a falha da consulta vira erro. Antes ela devolvia [] e a Carteira
 * guardava o vazio por 5 min, zerando o filtro "Qtd. assinada" (16/10/2026: 0 de 214 atas em vez de 196).
 * Lê em páginas de mil, na ordem de item_key (o PostgREST corta em mil sem avisar; a 200331 tinha 667 itens em 17/10/2026).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, banco } = vi.hoisted(() => {
  const banco = {
    linhas: [] as any[],
    /** Página (pelo início do intervalo) que responde com erro. */
    falharEm: null as number | null,
    selects: [] as string[],
    filtros: [] as Array<[string, string]>,
    ordens: [] as string[][],
    intervalos: [] as Array<[number, number]>
  };
  const from = vi.fn(() => {
    const ordem: string[] = [];
    const consulta: any = {
      select: (c: string) => {
        banco.selects.push(c);
        return consulta;
      },
      eq: (coluna: string, valor: string) => {
        banco.filtros.push([coluna, valor]);
        return consulta;
      },
      order: (coluna: string) => {
        ordem.push(coluna);
        return consulta;
      },
      range: async (de: number, ate: number) => {
        banco.ordens.push([...ordem]);
        banco.intervalos.push([de, ate]);
        if (banco.falharEm === de) return { data: null, error: { message: 'canceling statement due to statement timeout' } };
        return { data: banco.linhas.slice(de, Math.min(ate + 1, de + 1000)), error: null };
      }
    };
    return consulta;
  });
  return { from, banco };
});

vi.mock('../supabaseClient', () => ({ supabase: { from }, isSupabaseConfigured: true }));

import { COLUNAS_SALDO_CARTEIRA, fetchArpItemSaldosFromDb } from '../dashboardService';

describe('fetchArpItemSaldosFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.assign(banco, { linhas: [], falharEm: null, selects: [], filtros: [], ordens: [], intervalos: [] });
  });

  it('erro da consulta (ex.: tempo limite) vira exceção, e não uma lista vazia', async () => {
    banco.falharEm = 0;
    await expect(fetchArpItemSaldosFromDb('200331')).rejects.toThrow(/Não foi possível ler o saldo dos itens: canceling statement/);
  });

  it('pede só as colunas informadas e filtra pela carteira da UASG', async () => {
    banco.linhas = [{ numero_ata: '00001/2026' }];
    const linhas = await fetchArpItemSaldosFromDb('200331', COLUNAS_SALDO_CARTEIRA);
    expect(from).toHaveBeenCalledWith('v_arp_item_saldo_detalhado');
    expect(banco.selects).toEqual([COLUNAS_SALDO_CARTEIRA.join(',')]);
    expect(banco.filtros).toEqual([['uasg_carteira', '200331']]);
    expect(linhas).toEqual([{ numero_ata: '00001/2026' }]);
  });

  it('sem colunas, lê a view inteira (Ata 360, Item, Visão Geral)', async () => {
    await fetchArpItemSaldosFromDb('200331');
    expect(banco.selects).toEqual(['*']);
  });

  it('passa de mil itens: lê todas as páginas, com as colunas e o filtro em cada uma, na ordem de item_key', async () => {
    banco.linhas = Array.from({ length: 1667 }, (_, i) => ({ item_key: `00001/2026-200331-${String(i + 1).padStart(5, '0')}` }));
    const linhas = await fetchArpItemSaldosFromDb('200331', COLUNAS_SALDO_CARTEIRA);
    expect(linhas).toHaveLength(1667);
    expect(new Set(linhas.map((l) => l.item_key)).size).toBe(1667);
    expect(banco.intervalos).toEqual([[0, 999], [1000, 1999]]);
    expect(banco.selects).toEqual([COLUNAS_SALDO_CARTEIRA.join(','), COLUNAS_SALDO_CARTEIRA.join(',')]);
    expect(banco.filtros).toEqual([['uasg_carteira', '200331'], ['uasg_carteira', '200331']]);
    for (const ordem of banco.ordens) expect(ordem[0]).toBe('item_key');
  });

  it('falha na segunda página vira erro, e não a primeira página sozinha', async () => {
    banco.linhas = Array.from({ length: 1500 }, (_, i) => ({ item_key: String(i) }));
    banco.falharEm = 1000;
    await expect(fetchArpItemSaldosFromDb('200331')).rejects.toThrow(/Não foi possível ler o saldo dos itens/);
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
