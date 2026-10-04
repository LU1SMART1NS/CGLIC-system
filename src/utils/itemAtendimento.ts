/**
 * Estados de alocação e de empenho de um item da ata, usados pelos filtros da Carteira (Atas e Itens).
 *
 * - Alocação: o que as unidades internas receberam, comparado ao quantitativo SENASP do item.
 * - Empenho: o que foi empenhado, comparado à quantidade contratada do item.
 */
export type NivelAtendimento = 'TOTAL' | 'PARCIAL' | 'SEM';

/** Valor de um seletor de nível: 'TODOS' = sem filtro. */
export type FiltroNivel = NivelAtendimento | 'TODOS';

export const FILTRO_NIVEL_VALUES = ['TODOS', 'TOTAL', 'PARCIAL', 'SEM'] as const;

const EPS = 0.0001;

/** Totalmente alocado = o alocado alcança o quantitativo SENASP; sem alocação = nada alocado. */
export function nivelAlocacao(alocado: number, quantitativoSenasp: number): NivelAtendimento {
  if (alocado <= EPS) return 'SEM';
  if (quantitativoSenasp > 0 && alocado + EPS < quantitativoSenasp) return 'PARCIAL';
  return 'TOTAL';
}

/**
 * Totalmente empenhado = o empenhado alcança a quantidade contratada. Sem a quantidade contratada
 * (a API ainda não a trouxe) não há o que comparar: com algum empenho o item fica parcial.
 */
export function nivelEmpenho(empenhado: number, contratada: number | null): NivelAtendimento {
  if (empenhado <= EPS) return 'SEM';
  if (contratada == null || empenhado + EPS < contratada) return 'PARCIAL';
  return 'TOTAL';
}

/** Nível de uma ata (ou de qualquer grupo) a partir dos níveis dos itens; nulo quando não há item conhecido. */
export function agregarNivel(niveis: NivelAtendimento[]): NivelAtendimento | null {
  if (niveis.length === 0) return null;
  if (niveis.every((n) => n === 'TOTAL')) return 'TOTAL';
  if (niveis.every((n) => n === 'SEM')) return 'SEM';
  return 'PARCIAL';
}

/** Aplica um seletor de nível: sem nível conhecido só passa quando não há filtro. */
export function passaFiltroNivel(nivel: NivelAtendimento | null, filtro: FiltroNivel): boolean {
  return filtro === 'TODOS' || nivel === filtro;
}

export const NIVEL_ALOCACAO_LABEL: Record<NivelAtendimento, string> = {
  TOTAL: 'Totalmente alocado',
  PARCIAL: 'Parcialmente alocado',
  SEM: 'Sem alocação'
};

export const NIVEL_EMPENHO_LABEL: Record<NivelAtendimento, string> = {
  TOTAL: 'Totalmente empenhado',
  PARCIAL: 'Parcialmente empenhado',
  SEM: 'Sem empenho'
};
