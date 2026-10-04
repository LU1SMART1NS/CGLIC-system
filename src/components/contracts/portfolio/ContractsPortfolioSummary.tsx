import React from 'react';
import { CarteiraSituacaoTabs, type CarteiraSituacao } from '../../carteira/CarteiraSituacaoTabs';
import { formatCurrencyCompact } from '../../carteira/carteiraFormat';

export type ContractStatusFilterOption = CarteiraSituacao;

interface ContractsPortfolioSummaryProps {
  vigentes: number;
  criticos: number;
  atencao: number;
  historico: number;
  totalContratos: number;
  /** Valor vigente da carteira: aparece uma vez, ao lado dos segmentos. */
  valorVigenteTotal?: number;
  activeStatus: ContractStatusFilterOption;
  onSelectStatus: (status: ContractStatusFilterOption) => void;
}

/** Situação dos contratos em segmentos com contagem; o segmento ativo é o filtro de situação. */
export const ContractsPortfolioSummary: React.FC<ContractsPortfolioSummaryProps> = ({
  vigentes,
  criticos,
  atencao,
  historico,
  totalContratos,
  valorVigenteTotal,
  activeStatus,
  onSelectStatus
}) => (
  <CarteiraSituacaoTabs
    testIdPrefix="contracts"
    vigentes={vigentes}
    criticos={criticos}
    atencao={atencao}
    historico={historico}
    total={totalContratos}
    meta={typeof valorVigenteTotal === 'number' ? `${formatCurrencyCompact(valorVigenteTotal)} em valor vigente` : undefined}
    active={activeStatus}
    onSelect={onSelectStatus}
  />
);
