import type { StatusBadgeVariant } from './components/StatusBadge';

/**
 * Padrão de cores das etiquetas de situação em todo o sistema (pedido do usuário, 13/11/2026: "um padrão para o
 * sistema", sem cada tela pintada de um jeito). A cor diz o que a situação significa, não o módulo:
 *
 * - ANDAMENTO (azul): o trabalho segue normal com alguém (preparação, ordem, produção, Exército, processo enviado).
 * - CONFERENCIA (roxo): chegou e está sendo conferido ou recebido (entregue, TRP, TRD, conferência de fatura).
 * - CONCLUIDO (verde): marco atingido ou fim do caminho (empenhado, contratado, pago, finalizado).
 * - ATENCAO (amarelo): só aviso que pede atenção (prazo a vencer, entrega atrasada, aguardando decisão).
 * - URGENTE (vermelho): só o que pede ação já (prazo vencido, erro, empenho anulado).
 * - NEUTRO (cinza): fora do fluxo (cancelado, área requisitante, sem acompanhamento).
 *
 * Amarelo e vermelho nunca marcam uma etapa normal. Use estas constantes nas telas novas em vez de escolher a variante.
 */
export const COR_DA_SITUACAO = {
  ANDAMENTO: 'info',
  CONFERENCIA: 'purple',
  CONCLUIDO: 'success',
  ATENCAO: 'warning',
  URGENTE: 'danger',
  NEUTRO: 'neutral'
} as const satisfies Record<string, StatusBadgeVariant>;

export type SignificadoDaCor = keyof typeof COR_DA_SITUACAO;
