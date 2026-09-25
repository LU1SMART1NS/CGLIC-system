/**
 * Tipos de Domínio para o Radar Preditivo de Reajuste / Repactuação (SaldoARP — Fase 7.5-C3)
 *
 * Princípios Fundamentais:
 * 1. Radar operacional preventivo, NUNCA decisão jurídica automática;
 * 2. Chave determinística e idempotente: ALERT::ANIVERSARIO_REAJUSTE::{contractKey}::{ciclo};
 * 3. Janela temporal estrita de 60 dias antes do marco de 1 ano.
 */

export type ReajusteRadarPriorityLevel = 'PROXIMA' | 'URGENTE' | 'HOJE' | 'VENCIDA';

export type ReajusteRadarOrigemDataBase = 'PROPOSTA' | 'ULTIMO_REAJUSTE' | 'ASSINATURA';

/**
 * Entidade canônica do Alerta de Radar de Reajuste / Repactuação
 */
export interface ReajusteRadarAlert {
  id: string; // Chave determinística: ALERT::ANIVERSARIO_REAJUSTE::{contractKey}::{ciclo}
  contractKey: string;
  uasg?: string;
  numeroContrato?: string;
  anoContrato?: number;
  ciclo: number; // 1, 2, 3...
  dataBase: string; // YYYY-MM-DD
  origemDataBase: ReajusteRadarOrigemDataBase;
  dataAniversario: string; // YYYY-MM-DD
  diasRestantes: number;
  nivel: ReajusteRadarPriorityLevel;
  titulo: string;
  descricao: string;
  recomendacao: string;
}
