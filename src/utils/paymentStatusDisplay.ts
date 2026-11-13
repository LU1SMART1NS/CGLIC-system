import type { PaymentWorkflowStatus } from '../types/paymentFollowUp';
import { colors } from '../design-system/tokens';
import type { StatusBadgeVariant } from '../design-system/components/StatusBadge';
import { COR_DA_SITUACAO } from '../design-system/coresDaSituacao';

export interface PaymentStatusDisplay {
  label: string;
  variant: StatusBadgeVariant;
  bg: string;
  color: string;
  border: string;
}

/** Fonte única de rótulo e cor da situação do ciclo de pagamento (tela do contrato e /pagamentos). */
const MAP: Record<PaymentWorkflowStatus, { label: string; variant: StatusBadgeVariant }> = {
  RECEBIDO: { label: 'Em conferência', variant: COR_DA_SITUACAO.CONFERENCIA },
  COM_PENDENCIA: { label: 'Devolvido para correção', variant: COR_DA_SITUACAO.ATENCAO },
  CONFERIDO: { label: 'Conferido', variant: COR_DA_SITUACAO.CONFERENCIA },
  ENVIADO_CGOFI: { label: 'Na CGOFI', variant: COR_DA_SITUACAO.ANDAMENTO },
  DEVOLVIDO: { label: 'Devolvido pela CGOFI', variant: COR_DA_SITUACAO.URGENTE },
  LIQUIDADO: { label: 'Liquidado · aguardando OB', variant: COR_DA_SITUACAO.ANDAMENTO },
  PAGO: { label: 'Pago (OB emitida)', variant: COR_DA_SITUACAO.CONCLUIDO },
  CANCELADO: { label: 'Cancelado', variant: COR_DA_SITUACAO.NEUTRO }
};

export function getPaymentStatusDisplay(status: PaymentWorkflowStatus | string): PaymentStatusDisplay {
  const entry = MAP[status as PaymentWorkflowStatus] ?? { label: String(status), variant: COR_DA_SITUACAO.NEUTRO as StatusBadgeVariant };
  const token = colors.semantic[entry.variant];
  return { ...entry, bg: token.bg, color: token.text, border: token.border };
}
