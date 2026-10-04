import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SortDir = 'asc' | 'desc';
export type SortValue = string | number | null | undefined;

/** Coluna ordenável: como ler o valor da linha e o sentido do primeiro clique (números grandes primeiro costumam ser "desc"). */
export interface CarteiraSortColumn<T> {
  value: (row: T) => SortValue;
  firstDir?: SortDir;
}

const PARAM = 'ordem';

/** Lê "?ordem=coluna:asc"; coluna desconhecida = sem ordenação escolhida (vale a ordem que a página já deu). */
export function readSort(raw: string | null, keys: string[]): { key: string; dir: SortDir } | null {
  if (!raw) return null;
  const [key, dir] = raw.split(':');
  if (!keys.includes(key)) return null;
  return { key, dir: dir === 'desc' ? 'desc' : 'asc' };
}

/** Compara dois valores; vazio fica sempre por último, em qualquer sentido. */
export function compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const aVazio = a === null || a === undefined || a === '';
  const bVazio = b === null || b === undefined || b === '';
  if (aVazio || bVazio) return aVazio === bVazio ? 0 : aVazio ? 1 : -1;
  const base =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? base : -base;
}

export function sortRows<T>(rows: T[], column: CarteiraSortColumn<T>, dir: SortDir): T[] {
  // Ordenação estável: empates mantêm a ordem que a página já deu (prazo).
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => compareSortValues(column.value(x.row), column.value(y.row), dir) || x.i - y.i)
    .map((x) => x.row);
}

/**
 * Ordenação das tabelas das carteiras pelo cabeçalho, guardada na URL (?ordem=) para sobreviver à ida ao detalhe.
 * Clicar na coluna ordena no sentido inicial dela; clicar de novo inverte; um terceiro clique volta à ordem padrão.
 */
export function useCarteiraSort<T>(rows: T[], columns: Record<string, CarteiraSortColumn<T>>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const keys = Object.keys(columns);
  const sort = readSort(searchParams.get(PARAM), keys);

  const sorted = useMemo(
    () => (sort ? sortRows(rows, columns[sort.key], sort.dir) : rows),
    // `columns` deve ser estável (constante ou useMemo): quando muda (ex.: saldos chegaram), reordena.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, columns, sort?.key, sort?.dir]
  );

  const toggle = useCallback(
    (key: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const atual = readSort(prev.get(PARAM), keys);
          const first = columns[key]?.firstDir ?? 'asc';
          if (!atual || atual.key !== key) next.set(PARAM, `${key}:${first}`);
          else if (atual.dir === first) next.set(PARAM, `${key}:${first === 'asc' ? 'desc' : 'asc'}`);
          else next.delete(PARAM);
          return next;
        },
        { replace: true }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearchParams, keys.join('|')]
  );

  return { sorted, sortKey: sort?.key ?? null, sortDir: sort?.dir ?? null, toggle };
}
