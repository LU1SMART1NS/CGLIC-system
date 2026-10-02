import { describe, it, expect, vi, beforeEach } from 'vitest';

const order = vi.fn();
vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })) }
}));

import { fetchDepartments } from '../unitService';
import * as supabaseModule from '../supabaseClient';

describe('fetchDepartments: o banco é a única fonte do catálogo', () => {
  const getItem = vi.fn(() => JSON.stringify([{ id: 'x', sigla: 'LEGADO', nomeCompleto: 'Cópia local', ativo: true }]));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
  });

  it('catálogo vazio devolve lista vazia, sem inventar departamentos nem ler a cópia local', async () => {
    order.mockResolvedValueOnce({ data: [], error: null });
    await expect(fetchDepartments()).resolves.toEqual([]);
    expect(getItem).not.toHaveBeenCalled();
  });

  it('mapeia as linhas do banco', async () => {
    order.mockResolvedValueOnce({
      data: [{ id: 'uuid-1', sigla: 'DSUSP', nome_completo: 'Diretoria do Sistema Único', descricao: null, ativo: true, created_at: '2026-10-02' }],
      error: null
    });
    await expect(fetchDepartments()).resolves.toEqual([
      { id: 'uuid-1', sigla: 'DSUSP', nomeCompleto: 'Diretoria do Sistema Único', descricao: '', ativo: true, criadoEm: '2026-10-02' }
    ]);
  });

  it('falha de leitura vira erro, e não uma lista de reserva', async () => {
    order.mockResolvedValueOnce({ data: null, error: new Error('permission denied') });
    await expect(fetchDepartments()).rejects.toThrow('permission denied');
  });

  it('sem Supabase configurado dá erro de configuração', async () => {
    (supabaseModule as any).isSupabaseConfigured = false;
    try {
      await expect(fetchDepartments()).rejects.toThrow('CONFIG_ERROR');
    } finally {
      (supabaseModule as any).isSupabaseConfigured = true;
    }
  });
});
