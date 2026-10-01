import React from 'react';
import { CarteiraSummaryCards } from '../carteira/CarteiraSummaryCards';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import type { CarteiraStatusFilter } from '../carteira/carteiraPrazo';

export type ArpVigenciaFilterOption = CarteiraStatusFilter | 'TODOS';

interface ArpPortfolioSummaryProps {
  totalAtas: number;
  vigentes: number;
  criticos: number;
  atencao: number;
  historico: number;
  valorVigenteTotal?: number;
  valorCritico?: number;
  valorAtencao?: number;
  activeStatus: ArpVigenciaFilterOption;
  onSelectStatus: (status: ArpVigenciaFilterOption) => void;
}

export const ArpPortfolioSummary: React.FC<ArpPortfolioSummaryProps> = ({
  totalAtas,
  vigentes,
  criticos,
  atencao,
  historico,
  valorVigenteTotal,
  valorCritico,
  valorAtencao,
  activeStatus,
  onSelectStatus
}) => (
  <CarteiraSummaryCards
    testIdPrefix="arp"
    vigentes={vigentes}
    criticos={criticos}
    atencao={atencao}
    historico={historico}
    vigentesHint={`de ${totalAtas} ${totalAtas === 1 ? 'ata' : 'atas'}`}
    vigentesValorHint={typeof valorVigenteTotal === 'number' ? `${formatCurrencyCompact(valorVigenteTotal)} em valor registrado` : undefined}
    criticoValorHint={typeof valorCritico === 'number' ? `${formatCurrencyCompact(valorCritico)} em valor registrado` : undefined}
    atencaoValorHint={typeof valorAtencao === 'number' ? `${formatCurrencyCompact(valorAtencao)} em valor registrado` : undefined}
    historicoHint="Expiradas / canceladas"
    active={activeStatus}
    onSelect={onSelectStatus}
  />
);
