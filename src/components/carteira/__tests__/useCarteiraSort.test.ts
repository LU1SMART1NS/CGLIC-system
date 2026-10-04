import { describe, expect, it } from 'vitest';
import { compareSortValues, readSort, sortRows } from '../useCarteiraSort';

describe('ordenação das carteiras', () => {
  it('lê ?ordem= e ignora coluna desconhecida', () => {
    expect(readSort('valor:desc', ['valor'])).toEqual({ key: 'valor', dir: 'desc' });
    expect(readSort('valor', ['valor'])).toEqual({ key: 'valor', dir: 'asc' });
    expect(readSort('outra:asc', ['valor'])).toBeNull();
    expect(readSort(null, ['valor'])).toBeNull();
  });

  it('vazio fica por último nos dois sentidos', () => {
    expect(compareSortValues(null, 1, 'asc')).toBeGreaterThan(0);
    expect(compareSortValues(null, 1, 'desc')).toBeGreaterThan(0);
    expect(compareSortValues('', 'a', 'asc')).toBeGreaterThan(0);
  });

  it('compara texto em português e números com dígitos', () => {
    expect(compareSortValues('Ávila', 'Bruno', 'asc')).toBeLessThan(0);
    expect(compareSortValues('item 2', 'item 10', 'asc')).toBeLessThan(0);
  });

  it('é estável: empates mantêm a ordem anterior', () => {
    const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 0 }];
    expect(sortRows(rows, { value: (r) => r.v }, 'desc').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(sortRows(rows, { value: (r) => r.v }, 'asc').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});
