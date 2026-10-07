import type { PaymentWorkflowStatus } from '../types/paymentFollowUp';
import { colors } from '../design-system/tokens';
import type { StatusBadgeVariant } from '../design-system/components/StatusBadge';

export interface PaymentStatusDisplay {
  label: string;
  variant: StatusBadgeVariant;
  bg: string;
  color: string;
  border: string;
}

/** Fonte única de rótulo e cor da situação do ciclo de pagamento (tela do contrato e /pagamentos). */
const MAP: Record<PaymentWorkflowStatus, { label: string; variant: StatusBadgeVariant }> = {
  RECEBIDO: { label: 'Em conferência', variant: 'info' },
  COM_PENDENCIA: { label: 'Devolvido para correção', variant: 'warning' },
  CONFERIDO: { label: 'Conferido', variant: 'purple' },
  ENVIADO_CGOFI: { label: 'Na CGOFI', variant: 'info' },
  DEVOLVIDO: { label: 'Devolvido pela CGOFI', variant: 'danger' },
  LIQUIDADO: { label: 'Liquidado · aguardando OB', variant: 'info' },
  PAGO: { label: 'Pago (OB emitida)', variant: 'success' },
  CANCELADO: { label: 'Cancelado', variant: 'neutral' }
};

export function getPaymentStatusDisplay(status: PaymentWorkflowStatus | string): PaymentStatusDisplay {
  const entry = MAP[status as PaymentWorkflowStatus] ?? { label: String(status), variant: 'neutral' as StatusBadgeVariant };
  const token = colors.semantic[entry.variant];
  return { ...entry, bg: token.bg, color: token.text, border: token.border };
}
