/**
 * Tipos Canônicos do Motor de Prazos e Agenda Contratual (SaldoARP — Fase 2)
 */

export type TemporalStatus = 'FUTURO' | 'VENCE_EM_BREVE' | 'VENCE_HOJE' | 'ATRASADO' | 'CONCLUIDO';

export type AtencaoNivel = 'NORMAL' | 'ATENCAO' | 'CRITICO';

export type RegraOrigemTipo =
  | 'LEGAL'
  | 'CONTRATUAL'
  | 'EDITAL'
  | 'INTERNA'
  | 'OPERACIONAL'
  | 'CONFIGURAVEL';

export type UnidadeContagem = 'DIAS_CORRIDOS' | 'DIAS_UTEIS';

export interface ExplicabilidadePrazo {
  dataBase: string;
  fonteDataBase: string;
  regraNome: string;
  regraTipo: RegraOrigemTipo;
  unidadeContagem: UnidadeContagem;
  offsetDias: number;
  dataCalculada: string;
  diasRestantes: number;
  statusTemporal: TemporalStatus;
  nivelAtencao?: AtencaoNivel;
  descricaoRegra: string;
}

export interface CalculatedDeadline {
  dataAlvo: string;
  diasRestantes: number;
  statusTemporal: TemporalStatus;
  nivelAtencao: AtencaoNivel;
  explicabilidade: ExplicabilidadePrazo;
}

export interface RegraPrazoConfig {
  id: string;
  nome: string;
  tipo: RegraOrigemTipo;
  unidadeContagem: UnidadeContagem;
  offsetDias: number; // Ex: -60 para 60 dias antes, +10 para 10 dias após
  descricao: string;
  nivelAtencaoPadrao?: (diasRestantes: number) => AtencaoNivel;
}
