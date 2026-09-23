/**
 * Motor de Prazos e Agenda Contratual (SaldoARP — Fase 2)
 *
 * Centraliza e unifica todas as regras temporais do sistema:
 * - Cálculos em dias corridos e dias úteis (com suporte opcional a feriados);
 * - Normalização estrita para fuso horário America/Sao_Paulo (sem derivações incorretas por UTC);
 * - Explicabilidade completa de cada prazo calculado (Data-Base -> Regra -> Data Alvo -> Status);
 * - Separação formal entre Estado Temporal (FUTURO, VENCE_EM_BREVE, VENCE_HOJE, ATRASADO, CONCLUIDO)
 *   e Nível de Atenção (NORMAL, ATENCAO, CRITICO).
 */

import type {
  TemporalStatus,
  AtencaoNivel,
  RegraPrazoConfig,
  CalculatedDeadline,
  ExplicabilidadePrazo
} from '../types/temporal';

/**
 * Normaliza uma string de data (YYYY-MM-DD ou ISO) para um objeto Date na meia-noite local.
 */
export function parseDateBRT(dateStr?: string | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length < 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const d = new Date(year, month, day, 0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formata um objeto Date para string no padrão YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formata uma string de data (YYYY-MM-DD ou ISO) para o padrão brasileiro DD/MM/YYYY.
 */
export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Adiciona ou subtrai dias corridos de uma data.
 */
export function addDays(date: Date, days: number): Date {
  const res = new Date(date);
  res.setDate(res.getDate() + days);
  res.setHours(0, 0, 0, 0);
  return res;
}

/**
 * Verifica se um dia da semana é final de semana (0 = Domingo, 6 = Sábado).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Adiciona ou subtrai dias úteis de uma data, considerando finais de semana e feriados opcionais.
 */
export function addBusinessDays(date: Date, days: number, holidays: string[] = []): Date {
  const holidaySet = new Set(holidays.map(h => h.split('T')[0].trim()));
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);

  let remaining = Math.abs(days);
  const step = days >= 0 ? 1 : -1;

  while (remaining > 0) {
    current.setDate(current.getDate() + step);
    const dateStr = formatDateISO(current);
    if (!isWeekend(current) && !holidaySet.has(dateStr)) {
      remaining--;
    }
  }

  return current;
}

/**
 * Calcula a diferença em dias corridos entre targetDate e fromDate (targetDate - fromDate).
 */
export function differenceInDays(targetDate: Date, fromDate?: Date): number {
  const base = fromDate ? new Date(fromDate) : new Date();
  base.setHours(0, 0, 0, 0);

  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - base.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calcula a diferença em dias úteis entre targetDate e fromDate.
 */
export function differenceInBusinessDays(targetDate: Date, fromDate?: Date, holidays: string[] = []): number {
  const base = fromDate ? new Date(fromDate) : new Date();
  base.setHours(0, 0, 0, 0);

  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() === base.getTime()) return 0;

  const isForward = target > base;
  const step = isForward ? 1 : -1;
  const current = new Date(base);
  const holidaySet = new Set(holidays.map(h => h.split('T')[0].trim()));
  let count = 0;

  while (isForward ? current < target : current > target) {
    current.setDate(current.getDate() + step);
    const dateStr = formatDateISO(current);
    if (!isWeekend(current) && !holidaySet.has(dateStr)) {
      count++;
    }
  }

  return isForward ? count : -count;
}

/**
 * Deriva o Estado Temporal de um prazo.
 */
export function deriveTemporalStatus(
  diasRestantes: number,
  isConcluido: boolean = false,
  thresholdVenceEmBreve: number = 30
): TemporalStatus {
  if (isConcluido) return 'CONCLUIDO';
  if (diasRestantes < 0) return 'ATRASADO';
  if (diasRestantes === 0) return 'VENCE_HOJE';
  if (diasRestantes <= thresholdVenceEmBreve) return 'VENCE_EM_BREVE';
  return 'FUTURO';
}

/**
 * Deriva o Nível de Atenção (Urgência) de um prazo temporal.
 */
export function deriveAtencaoNivel(
  diasRestantes: number,
  statusTemporal: TemporalStatus
): AtencaoNivel {
  if (statusTemporal === 'CONCLUIDO') return 'NORMAL';
  if (statusTemporal === 'ATRASADO') return 'CRITICO';
  if (statusTemporal === 'VENCE_HOJE') return 'CRITICO';
  if (diasRestantes <= 15) return 'CRITICO';
  if (diasRestantes <= 60) return 'ATENCAO';
  return 'NORMAL';
}

/**
 * Catálogo de Regras Operacionais Padrão Identificadas na Prática Atual
 * (Classificadas rigorosamente como OPERACIONAL / INTERNA e não como regras legais compulsórias)
 */
export const REGRAS_OPERACIONAIS_PADRAO: Record<string, RegraPrazoConfig> = {
  PRORROGACAO_180D: {
    id: 'PRORROGACAO_180D',
    nome: 'Início da Análise de Prorrogação (180d)',
    tipo: 'OPERACIONAL',
    unidadeContagem: 'DIAS_CORRIDOS',
    offsetDias: -180,
    descricao: 'Regra operacional de planejamento para iniciar estudo de prorrogação 180 dias antes do término da vigência.'
  },
  CONSULTA_FORNECEDOR_120D: {
    id: 'CONSULTA_FORNECEDOR_120D',
    nome: 'Consulta de Interesse ao Fornecedor (120d)',
    tipo: 'OPERACIONAL',
    unidadeContagem: 'DIAS_CORRIDOS',
    offsetDias: -120,
    descricao: 'Regra operacional para enviar ofício de interesse na prorrogação 120 dias antes da vigência final.'
  },
  REMESSA_JURIDICA_60D: {
    id: 'REMESSA_JURIDICA_60D',
    nome: 'Remessa aos Órgãos de Controle (60d)',
    tipo: 'OPERACIONAL',
    unidadeContagem: 'DIAS_CORRIDOS',
    offsetDias: -60,
    descricao: 'Regra operacional interna para encaminhar processo instruído para análise jurídica 60 dias antes do vencimento.'
  },
  RESPOSTA_FORNECEDOR_10DU: {
    id: 'RESPOSTA_FORNECEDOR_10DU',
    nome: 'Limite de Resposta da Empresa (10 dias úteis)',
    tipo: 'OPERACIONAL',
    unidadeContagem: 'DIAS_UTEIS',
    offsetDias: 10,
    descricao: 'Prazo operacional administrativo concedido ao fornecedor para manifestação formal sobre prorrogação.'
  },
  ARP_VIGENCIA_90D: {
    id: 'ARP_VIGENCIA_90D',
    nome: 'Alerta de Exaustão de Vigência da ARP (90d)',
    tipo: 'OPERACIONAL',
    unidadeContagem: 'DIAS_CORRIDOS',
    offsetDias: -90,
    descricao: 'Regra operacional de planejamento para novos certames ou contratações 90 dias antes do fim da vigência da ARP.'
  }
};

/**
 * Função Central do Motor Temporal:
 * Recebe data-base, fonte e configuração de regra, retornando o prazo calculado com explicabilidade completa.
 */
export function calculateDeadline(params: {
  dataBase: string;
  fonteDataBase?: string;
  regra: RegraPrazoConfig;
  currentDate?: Date;
  holidays?: string[];
  isConcluido?: boolean;
}): CalculatedDeadline | null {
  const baseDate = parseDateBRT(params.dataBase);
  if (!baseDate) return null;

  const { regra, fonteDataBase = 'Contratos.gov.br', currentDate, holidays = [], isConcluido = false } = params;

  const targetDate = regra.unidadeContagem === 'DIAS_UTEIS'
    ? addBusinessDays(baseDate, regra.offsetDias, holidays)
    : addDays(baseDate, regra.offsetDias);

  const dataCalculada = formatDateISO(targetDate);
  const diasRestantes = differenceInDays(targetDate, currentDate);
  const statusTemporal = deriveTemporalStatus(diasRestantes, isConcluido);
  const nivelAtencao = regra.nivelAtencaoPadrao
    ? regra.nivelAtencaoPadrao(diasRestantes)
    : deriveAtencaoNivel(diasRestantes, statusTemporal);

  const explicabilidade: ExplicabilidadePrazo = {
    dataBase: params.dataBase.split('T')[0],
    fonteDataBase,
    regraNome: regra.nome,
    regraTipo: regra.tipo,
    unidadeContagem: regra.unidadeContagem,
    offsetDias: regra.offsetDias,
    dataCalculada,
    diasRestantes,
    statusTemporal,
    nivelAtencao,
    descricaoRegra: regra.descricao
  };

  return {
    dataAlvo: dataCalculada,
    diasRestantes,
    statusTemporal,
    nivelAtencao,
    explicabilidade
  };
}
