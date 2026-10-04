import React from 'react';
import { CarteiraSituacaoTabs, type CarteiraSituacao } from '../carteira/CarteiraSituacaoTabs';

export type ArpVigenciaFilterOption = CarteiraSituacao;

interface ArpPortfolioSummaryProps {
  totalAtas: number;
  vigentes: number;
  criticos: number;
  atencao: number;
  historico: number;
  activeStatus: ArpVigenciaFilterOption;
  onSelectStatus: (status: ArpVigenciaFilterOption) => void;
}

/** Situação das atas em segmentos com contagem; o segmento ativo é o filtro de vigência. */
export const ArpPortfolioSummary: React.FC<ArpPortfolioSummaryProps> = ({
  totalAtas,
  vigentes,
  criticos,
  atencao,
  historico,
  activeStatus,
  onSelectStatus
}) => (
  <CarteiraSituacaoTabs
    testIdPrefix="arp"
    vigentes={vigentes}
    criticos={criticos}
    atencao={atencao}
    historico={historico}
    total={totalAtas}
    active={activeStatus}
    onSelect={onSelectStatus}
  />
);
