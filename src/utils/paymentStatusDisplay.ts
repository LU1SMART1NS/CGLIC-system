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
  RECEBIDO: { label: 'Atesto Recebido', variant: 'neutral' },
  ATRIBUIDO: { label: 'Atribuído para Instrução', variant: 'info' },
  EM_INSTRUCAO: { label: 'Em Instrução', variant: 'info' },
  PENDENTE_DOCUMENTACAO: { label: 'Pendência Documental', variant: 'warning' },
  DESPACHO_ELABORADO: { label: 'Despacho Elaborado', variant: 'purple' },
  ENVIADO_CGOFI: { label: 'Enviado à CGOFI', variant: 'info' },
  AGUARDANDO_CGOFI: { label: 'Aguardando CGOFI', variant: 'warning' },
  DEVOLVIDO_FISCAL: { label: 'Devolvido pela CGOFI', variant: 'danger' },
  PAGAMENTO_CONFIRMADO: { label: 'Pagamento Confirmado (OB)', variant: 'success' },
  CONCLUIDO: { label: 'Ciclo Concluído', variant: 'success' },
  CANCELADO: { label: 'Cancelado', variant: 'neutral' }
};

export function getPaymentStatusDisplay(status: PaymentWorkflowStatus | string): PaymentStatusDisplay {
  const entry = MAP[status as PaymentWorkflowStatus] ?? { label: String(status), variant: 'neutral' as StatusBadgeVariant };
  const token = colors.semantic[entry.variant];
  return { ...entry, bg: token.bg, color: token.text, border: token.border };
}
