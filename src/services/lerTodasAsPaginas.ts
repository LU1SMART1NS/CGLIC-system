/**
 * O PostgREST devolve no máximo mil linhas por consulta e corta o resto sem avisar. Toda leitura de tabela ou view
 * que pode crescer passa por aqui: lê de mil em mil até a última página.
 *
 * A consulta de cada página PRECISA ter `.order(...)` por uma coluna única (ou combinação única): sem ordem fixa, o
 * banco pode devolver as linhas em outra ordem a cada página e repetir ou pular linhas entre elas.
 */
export const PAGINA_POSTGREST = 1000;

/** Lê todas as páginas. `pagina(de, ate)` monta a consulta já com a ordem fixa e `.range(de, ate)`. */
export async function lerTodasAsPaginas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: any }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA_POSTGREST) {
    const { data, error } = await pagina(de, de + PAGINA_POSTGREST - 1);
    if (error) throw error;
    const lote = (Array.isArray(data) ? data : []) as T[];
    linhas.push(...lote);
    if (lote.length < PAGINA_POSTGREST) break;
  }
  return linhas;
}
