import type { CarteiraFilterOption } from '../../carteira/CarteiraFilterButton';
import type { PrazoFaixa } from '../../carteira/carteiraPrazo';

/** Filas da Central de Distribuição (?aba=); a ordem é fixa e a inicial é a de atas sem gestor. */
export const FILAS = ['EQUIPE', 'ATAS', 'CONTRATOS', 'DIVERGENCIAS'] as const;
export type Fila = (typeof FILAS)[number];
export const FILA_INICIAL: Fila = 'ATAS';

export const TODAS = 'TODAS';
export const PAGE_SIZE = 25;

const ROTULO_FAIXA: Record<PrazoFaixa, string> = {
  CRITICO: 'Crítico',
  ATENCAO: 'Atenção',
  REGULAR: 'Em dia',
  EXPIRADO: 'Encerrada',
  SEM_DATA: 'Sem data'
};
const ORDEM_FAIXA: PrazoFaixa[] = ['CRITICO', 'ATENCAO', 'REGULAR', 'EXPIRADO', 'SEM_DATA'];

/** Opções do filtro de vigência com a contagem de cada faixa (faixas sem registro ficam de fora). */
export function vigenciaOptions(faixas: PrazoFaixa[]): CarteiraFilterOption[] {
  const contagem = new Map<PrazoFaixa, number>();
  for (const f of faixas) contagem.set(f, (contagem.get(f) || 0) + 1);
  return ORDEM_FAIXA.filter((f) => contagem.has(f)).map((f) => ({ value: f, label: ROTULO_FAIXA[f], count: contagem.get(f) }));
}

/** Busca sem diferenciar maiúsculas nem acentos. */
export function normalizarBusca(texto: string | undefined | null): string {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function contemBusca(busca: string, ...campos: Array<string | undefined | null>): boolean {
  const q = normalizarBusca(busca.trim());
  return !q || campos.some((c) => normalizarBusca(c).includes(q));
}
