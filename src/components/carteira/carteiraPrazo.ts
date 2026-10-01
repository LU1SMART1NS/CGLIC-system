/**
 * Faixas de prazo únicas para as carteiras de Contratos e de Atas — as mesmas
 * usadas na Visão Geral: crítico (até 30 dias) e atenção (31 a 90 dias).
 */
export const PRAZO_CRITICO_DIAS = 30;
export const PRAZO_ATENCAO_DIAS = 90;

export type PrazoFaixa = 'EXPIRADO' | 'CRITICO' | 'ATENCAO' | 'REGULAR' | 'SEM_DATA';

/** Filtro de situação compartilhado pelos cards de resumo das duas carteiras. */
export type CarteiraStatusFilter = 'VIGENTES' | 'CRITICO' | 'ATENCAO' | 'HISTORICO';

export function classifyPrazo(diasRestantes: number | null, expirado = false): PrazoFaixa {
  if (expirado || (diasRestantes !== null && diasRestantes < 0)) return 'EXPIRADO';
  if (diasRestantes === null) return 'SEM_DATA';
  if (diasRestantes <= PRAZO_CRITICO_DIAS) return 'CRITICO';
  if (diasRestantes <= PRAZO_ATENCAO_DIAS) return 'ATENCAO';
  return 'REGULAR';
}

export function matchesStatusFilter(faixa: PrazoFaixa, filter: CarteiraStatusFilter | 'TODOS'): boolean {
  switch (filter) {
    case 'VIGENTES':
      // Sem data de vigência não conta como vigente (mesmo critério da Visão Geral); segue visível em "Todas as Situações".
      return faixa !== 'EXPIRADO' && faixa !== 'SEM_DATA';
    case 'CRITICO':
      return faixa === 'CRITICO';
    case 'ATENCAO':
      return faixa === 'ATENCAO';
    case 'HISTORICO':
      return faixa === 'EXPIRADO';
    default:
      return true;
  }
}

export function formatDiasRestantes(dias: number | null): string {
  if (dias === null) return 'Sem data';
  if (dias < 0) return `Vencido há ${Math.abs(dias)}d`;
  if (dias === 0) return 'Vence hoje';
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

export const PRAZO_COLORS: Record<PrazoFaixa, { color: string; bg: string }> = {
  EXPIRADO: { color: '#475569', bg: '#f1f5f9' },
  CRITICO: { color: '#b91c1c', bg: '#fef2f2' },
  ATENCAO: { color: '#b45309', bg: '#fffbeb' },
  REGULAR: { color: '#15803d', bg: '#f0fdf4' },
  SEM_DATA: { color: '#64748b', bg: '#f8fafc' }
};

/**
 * Ordenação padrão das carteiras: vigentes primeiro, do vencimento mais próximo
 * para o mais distante; encerrados por último, do mais recente para o mais antigo.
 * Sem data de vigência vai para o fim de cada grupo.
 */
export function comparePrazo(a: number | null, b: number | null): number {
  const aExp = a !== null && a < 0;
  const bExp = b !== null && b < 0;
  if (aExp !== bExp) return aExp ? 1 : -1;
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return aExp ? b - a : a - b;
}
