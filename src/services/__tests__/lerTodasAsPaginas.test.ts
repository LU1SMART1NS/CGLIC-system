import { describe, it, expect } from 'vitest';
import { lerTodasAsPaginas, PAGINA_POSTGREST } from '../lerTodasAsPaginas';

/** Tabela falsa de 2.500 linhas servida como o PostgREST: no máximo mil por consulta, pelo intervalo pedido. */
const tabela = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1 }));
const servir = (de: number, ate: number) => Promise.resolve({ data: tabela.slice(de, Math.min(ate + 1, de + PAGINA_POSTGREST)), error: null });

describe('lerTodasAsPaginas', () => {
  it('lê além das mil linhas, sem repetir nem pular', async () => {
    const pedidos: Array<[number, number]> = [];
    const linhas = await lerTodasAsPaginas<{ id: number }>((de, ate) => {
      pedidos.push([de, ate]);
      return servir(de, ate);
    });
    expect(linhas).toHaveLength(2500);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(2500);
    expect(pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('para na primeira página incompleta e aceita tabela vazia', async () => {
    expect(await lerTodasAsPaginas(() => Promise.resolve({ data: [], error: null }))).toEqual([]);
    expect(await lerTodasAsPaginas(() => Promise.resolve({ data: null, error: null }))).toEqual([]);
  });

  it('erro do banco sobe para quem chamou', async () => {
    await expect(lerTodasAsPaginas(() => Promise.resolve({ data: null, error: { message: 'falhou' } }))).rejects.toMatchObject({ message: 'falhou' });
  });
});
