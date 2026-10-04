/** Valores do filtro de gestor nas carteiras: 'TODOS' = sem filtro; SEM_GESTOR = instrumentos sem gestor atribuído. */
export const TODOS_GESTORES = 'TODOS';
export const SEM_GESTOR = '__SEM_GESTOR__';

/**
 * O filtro de gestor só serve a quem enxerga a carteira inteira. O perfil "gestor" já vê apenas
 * o que lhe foi atribuído, então o filtro listaria só o próprio nome.
 */
export function canFilterByGestor(role: string | null | undefined): boolean {
  return role !== 'gestor';
}

export function matchesGestorFilter(gestorNome: string | undefined, filter: string): boolean {
  if (filter === TODOS_GESTORES) return true;
  if (filter === SEM_GESTOR) return !gestorNome;
  return gestorNome === filter;
}

/** Nomes distintos, em ordem alfabética, para o seletor de gestor. */
export function listGestores(nomes: Iterable<string | undefined>): string[] {
  const set = new Set<string>();
  for (const nome of nomes) if (nome) set.add(nome);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
