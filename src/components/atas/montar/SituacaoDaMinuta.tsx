import React from 'react';
import { StatusBadge, type StatusBadgeVariant } from '../../../design-system/components/StatusBadge';
import type { EstadoDaMinutaNaTela } from '../../../services/atasAMontarService';
import { COR_DA_SITUACAO } from '../../../design-system/coresDaSituacao';

const MINUTA: Record<EstadoDaMinutaNaTela, { rotulo: string; variante: StatusBadgeVariant }> = {
  LIDA: { rotulo: 'Lida', variante: COR_DA_SITUACAO.CONCLUIDO },
  A_CONFERIR: { rotulo: 'A conferir', variante: COR_DA_SITUACAO.ATENCAO },
  SEM_MINUTA: { rotulo: 'Sem minuta no edital', variante: COR_DA_SITUACAO.ATENCAO },
  PENDENTE: { rotulo: 'Ainda não lida', variante: COR_DA_SITUACAO.NEUTRO },
  ERRO: { rotulo: 'Leitura falhou', variante: COR_DA_SITUACAO.URGENTE }
};

export const SituacaoDaMinuta: React.FC<{ estado: EstadoDaMinutaNaTela; aConferir?: number }> = ({ estado, aConferir }) => {
  const m = MINUTA[estado] ?? MINUTA.PENDENTE;
  const rotulo = estado === 'A_CONFERIR' && aConferir ? `${aConferir} ${aConferir === 1 ? 'item' : 'itens'} a conferir` : m.rotulo;
  return <StatusBadge label={rotulo} variant={m.variante} size="sm" dot={false} />;
};
