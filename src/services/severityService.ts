/**
 * Serviço Canônico de Severidade — CGLIC-system 3.0 (Fase 10-A.2)
 *
 * Formaliza `SeverityLevel` (src/design-system/tokens.ts) como a ÚNICA
 * taxonomia de severidade do sistema — a mesma já usada pelo Funil Único de
 * Atenção testado (funnelAttentionIntegration.test.ts) e pelos componentes
 * de design system (SeverityBadge, AlertCard).
 *
 * Este arquivo NÃO cria uma segunda taxonomia: reexporta SeverityLevel e
 * fornece as funções de conversão determinística, documentadas na Fase
 * 10-A.1, para as demais taxonomias que ainda existem no código por razões
 * semânticas legítimas (granularidade diferente de exibição) mas que devem
 * sempre ser capazes de se traduzir para a severidade canônica sem inventar
 * uma régua de cores própria.
 *
 * Regra de ouro (Fase 10-A.2): nenhuma regra de negócio deve computar sua
 * própria severidade a partir de thresholds ad-hoc — toda severidade exibida
 * ao usuário deve ser derivada por uma das funções abaixo.
 */

import type { SeverityLevel } from '../design-system/tokens';
import type { AtencaoNivel, TemporalStatus } from '../types/temporal';
import type { ReajusteRadarPriorityLevel } from '../types/contractReajusteRadar';
import type { PaymentAlertNivel } from '../types/paymentFollowUp';

export type { SeverityLevel };

/**
 * AtencaoNivel (NORMAL/ATENCAO/CRITICO) + TemporalStatus opcional (para
 * distinguir "vencido" de "crítico por proximidade", que hoje merecem
 * severidades canônicas diferentes: CRITICA vs URGENTE).
 */
export function severityFromAtencaoNivel(
  nivelAtencao: AtencaoNivel | undefined,
  estadoTemporal?: TemporalStatus
): SeverityLevel {
  if (estadoTemporal === 'ATRASADO') return 'CRITICA';
  if (estadoTemporal === 'VENCE_HOJE') return 'URGENTE';
  if (nivelAtencao === 'CRITICO') return 'URGENTE';
  if (nivelAtencao === 'ATENCAO') return 'ATENCAO';
  return 'INFO';
}

/**
 * ReajusteRadarPriorityLevel (PROXIMA/URGENTE/HOJE/VENCIDA).
 * Mapeamento idêntico ao já praticado (de forma inline, não reutilizável)
 * em dashboardService.calculateAttentionSummary antes desta fase.
 */
export function severityFromReajusteRadarNivel(nivel: ReajusteRadarPriorityLevel): SeverityLevel {
  switch (nivel) {
    case 'VENCIDA':
      return 'CRITICA';
    case 'HOJE':
    case 'URGENTE':
      return 'URGENTE';
    case 'PROXIMA':
    default:
      return 'ATENCAO';
  }
}

/**
 * PaymentAlertNivel (CRITICO/ATENCAO/ACOMPANHAMENTO/NORMAL) — nível de
 * alerta individual de um PaymentAlert (paymentFollowUpService.ts).
 */
export function severityFromPaymentAlertNivel(nivel: PaymentAlertNivel): SeverityLevel {
  switch (nivel) {
    case 'CRITICO':
      return 'CRITICA';
    case 'ATENCAO':
      return 'ATENCAO';
    case 'ACOMPANHAMENTO':
    case 'NORMAL':
    default:
      return 'INFO';
  }
}

/**
 * PaymentCyclePrazos.statusPrazo (NORMAL/ATENCAO/CRITICO/VENCIDO).
 */
export function severityFromPaymentStatusPrazo(
  statusPrazo: 'NORMAL' | 'ATENCAO' | 'CRITICO' | 'VENCIDO' | undefined
): SeverityLevel {
  switch (statusPrazo) {
    case 'VENCIDO':
      return 'CRITICA';
    case 'CRITICO':
      return 'URGENTE';
    case 'ATENCAO':
      return 'ATENCAO';
    case 'NORMAL':
    default:
      return 'INFO';
  }
}

/**
 * AttentionPriorityLevel (VENCIDA/HOJE/URGENTE/PROXIMA/SEM_PRAZO) — taxonomia
 * de classifyTaskAttention (components/contracts/taskAttentionDisplay.ts).
 */
export function severityFromAttentionPriorityLevel(
  level: 'VENCIDA' | 'HOJE' | 'URGENTE' | 'PROXIMA' | 'SEM_PRAZO'
): SeverityLevel {
  switch (level) {
    case 'VENCIDA':
      return 'CRITICA';
    case 'HOJE':
    case 'URGENTE':
      return 'URGENTE';
    case 'PROXIMA':
      return 'ATENCAO';
    case 'SEM_PRAZO':
    default:
      return 'INFO';
  }
}
