import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Um filtro da carteira e o parâmetro da URL que o guarda. Sem `values`, qualquer texto vale (ex.: busca, nome do gestor). */
export interface CarteiraFilterField {
  param: string;
  default: string;
  values?: readonly string[];
}

/** Estado de filtros: todos os campos são texto (valores de seletor ou busca). */
export type CarteiraFilterState<T> = { [K in keyof T]: string };

export type CarteiraFilterSchema<T extends CarteiraFilterState<T>> = { [K in keyof T]: CarteiraFilterField };

/** Lê os filtros da URL; parâmetro ausente ou com valor desconhecido cai no padrão. */
export function readCarteiraFilters<T extends CarteiraFilterState<T>>(
  searchParams: URLSearchParams,
  schema: CarteiraFilterSchema<T>
): T {
  const state = {} as Record<string, string>;
  for (const [key, field] of Object.entries(schema) as [string, CarteiraFilterField][]) {
    const raw = searchParams.get(field.param);
    state[key] = raw !== null && (!field.values || field.values.includes(raw)) ? raw : field.default;
  }
  return state as T;
}

/** Escreve os filtros na URL: valores padrão ficam de fora do endereço; outros parâmetros (ex.: `aba`) são preservados. */
export function writeCarteiraFilters<T extends CarteiraFilterState<T>>(
  searchParams: URLSearchParams,
  schema: CarteiraFilterSchema<T>,
  state: T
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  for (const [key, field] of Object.entries(schema) as [string, CarteiraFilterField][]) {
    const value = (state as Record<string, string>)[key];
    if (value === field.default || value === '') next.delete(field.param);
    else next.set(field.param, value);
  }
  return next;
}

export function hasActiveCarteiraFilters<T extends CarteiraFilterState<T>>(schema: CarteiraFilterSchema<T>, state: T): boolean {
  return (Object.entries(schema) as [string, CarteiraFilterField][]).some(
    ([key, field]) => (state as Record<string, string>)[key].trim() !== field.default
  );
}

/**
 * Filtros das carteiras de Atas e de Contratos guardados na URL: sobrevivem à ida ao detalhe e volta,
 * e permitem abrir a carteira já filtrada (ex.: `/contratos?gestor=Maria`). Mudar filtro não empilha histórico.
 */
export function useCarteiraFilters<T extends CarteiraFilterState<T>>(schema: CarteiraFilterSchema<T>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readCarteiraFilters(searchParams, schema), [searchParams, schema]);

  const setFilter = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setSearchParams(
        (prev) => writeCarteiraFilters(prev, schema, { ...readCarteiraFilters(prev, schema), [key]: value } as T),
        { replace: true }
      );
    },
    [schema, setSearchParams]
  );

  const resetFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const field of Object.values(schema) as CarteiraFilterField[]) next.delete(field.param);
        return next;
      },
      { replace: true }
    );
  }, [schema, setSearchParams]);

  return { filters, setFilter, resetFilters };
}
