import React from 'react';
import { StatusBadge, type StatusBadgeVariant } from '../../../design-system/components/StatusBadge';
import type { EstadoDaMinutaNaTela } from '../../../services/atasAMontarService';

const MINUTA: Record<EstadoDaMinutaNaTela, { rotulo: string; variante: StatusBadgeVariant }> = {
  LIDA: { rotulo: 'Lida', variante: 'success' },
  A_CONFERIR: { rotulo: 'A conferir', variante: 'warning' },
  SEM_MINUTA: { rotulo: 'Sem minuta no edital', variante: 'warning' },
  PENDENTE: { rotulo: 'Ainda não lida', variante: 'neutral' },
  ERRO: { rotulo: 'Leitura falhou', variante: 'danger' }
};

export const SituacaoDaMinuta: React.FC<{ estado: EstadoDaMinutaNaTela; aConferir?: number }> = ({ estado, aConferir }) => {
  const m = MINUTA[estado] ?? MINUTA.PENDENTE;
  const rotulo = estado === 'A_CONFERIR' && aConferir ? `${aConferir} ${aConferir === 1 ? 'item' : 'itens'} a conferir` : m.rotulo;
  return <StatusBadge label={rotulo} variant={m.variante} size="sm" dot={false} />;
};
