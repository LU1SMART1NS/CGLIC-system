/**
 * Faixas de prazo únicas para as carteiras de Contratos e de Atas — as mesmas
 * usadas na Visão Geral: crítico (até 30 dias) e atenção (31 a 90 dias).
 */
import { VIGENCIA_RULES } from '../../config/alertRules';
/** Faixas lidas no momento do uso, para valerem as regras ajustadas na Administração. */
export const prazoCriticoDias = () => VIGENCIA_RULES.faixaCriticoAteDias;
export const prazoAtencaoDias = () => VIGENCIA_RULES.faixaAtencaoAteDias;

export type PrazoFaixa = 'EXPIRADO' | 'CRITICO' | 'ATENCAO' | 'REGULAR' | 'SEM_DATA';

/** Filtro de situação compartilhado pelos cards de resumo das duas carteiras. */
export type CarteiraStatusFilter = 'VIGENTES' | 'CRITICO' | 'ATENCAO' | 'HISTORICO';

export function classifyPrazo(diasRestantes: number | null, expirado = false): PrazoFaixa {
  if (expirado || (diasRestantes !== null && diasRestantes < 0)) return 'EXPIRADO';
  if (diasRestantes === null) return 'SEM_DATA';
  if (diasRestantes <= prazoCriticoDias()) return 'CRITICO';
  if (diasRestantes <= prazoAtencaoDias()) return 'ATENCAO';
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

/** Segmento de situação que corresponde a uma faixa de prazo (para filtrar ao clicar no selo de prazo). */
export function situacaoDaFaixa(faixa: PrazoFaixa): CarteiraStatusFilter | null {
  switch (faixa) {
    case 'CRITICO': return 'CRITICO';
    case 'ATENCAO': return 'ATENCAO';
    case 'EXPIRADO': return 'HISTORICO';
    case 'REGULAR': return 'VIGENTES';
    default: return null;
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
  CRITICO: { color: 'var(--color-danger-text)', bg: 'var(--color-danger-bg)' },
  ATENCAO: { color: 'var(--color-warning-text)', bg: 'var(--color-warning-bg)' },
  REGULAR: { color: 'var(--color-success-text)', bg: 'var(--color-success-bg)' },
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
