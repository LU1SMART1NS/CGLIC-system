import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ArpRecord, ArpItemRecord } from '../../types';

// Cliente do Supabase falso, com o interruptor "é servidor" controlável por teste.
const cliente = vi.hoisted(() => ({
  ehServidor: false,
  upsert: null as unknown as ReturnType<typeof vi.fn<(...args: any[]) => Promise<any>>>,
  from: null as unknown as ReturnType<typeof vi.fn<(...args: any[]) => any>>
}));

vi.mock('../supabaseClient', () => {
  cliente.upsert = vi.fn<(...args: any[]) => Promise<any>>(async () => ({ error: null }));
  cliente.from = vi.fn<(...args: any[]) => any>(() => ({
    upsert: cliente.upsert,
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'ata-1' } }) }) }) })
  }));
  return {
    isSupabaseConfigured: true,
    supabase: { from: (...a: unknown[]) => cliente.from(...a) },
    get ehServidor() { return cliente.ehServidor; }
  };
});

import { cacheArpsInDb, cacheArpItemsInDb } from '../dbCacheService';

const ata = { numeroAtaRegistroPreco: '00001/2025', codigoUnidadeGerenciadora: '200331' } as ArpRecord;
const item = { numeroItem: '00001', descricaoItem: 'X', niFornecedor: '1' } as ArpItemRecord;

beforeEach(() => { vi.clearAllMocks(); });

describe('gravação de atas e itens: só o servidor grava', () => {
  it('no navegador (não é servidor): não toca no banco e devolve false', async () => {
    cliente.ehServidor = false;
    expect(await cacheArpsInDb([ata])).toBe(false);
    expect(await cacheArpItemsInDb('00001/2025', '200331', [item])).toBe(false);
    expect(cliente.from).not.toHaveBeenCalled();
  });

  it('no servidor: grava as atas e os itens', async () => {
    cliente.ehServidor = true;
    expect(await cacheArpsInDb([ata])).toBe(true);
    expect(cliente.from).toHaveBeenCalledWith('atas_registro_preco');
    expect(await cacheArpItemsInDb('00001/2025', '200331', [item])).toBe(true);
    expect(cliente.from).toHaveBeenCalledWith('itens_ata');
    expect(cliente.upsert).toHaveBeenCalledTimes(2);
  });

  it('no servidor, erro do banco vira false (a sincronização conta a falha)', async () => {
    cliente.ehServidor = true;
    cliente.upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await cacheArpsInDb([ata])).toBe(false);
  });
});
