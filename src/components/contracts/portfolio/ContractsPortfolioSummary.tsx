import React from 'react';
import { CarteiraSummaryCards } from '../../carteira/CarteiraSummaryCards';
import { formatCurrencyCompact } from '../../carteira/carteiraFormat';
import type { CarteiraStatusFilter } from '../../carteira/carteiraPrazo';

export type ContractStatusFilterOption = CarteiraStatusFilter | 'TODOS';

interface ContractsPortfolioSummaryProps {
  vigentes: number;
  criticos: number;
  atencao: number;
  historico: number;
  totalContratos: number;
  valorVigenteTotal?: number;
  valorCritico?: number;
  valorAtencao?: number;
  activeStatus: ContractStatusFilterOption;
  onSelectStatus: (status: ContractStatusFilterOption) => void;
}

export const ContractsPortfolioSummary: React.FC<ContractsPortfolioSummaryProps> = ({
  vigentes,
  criticos,
  atencao,
  historico,
  totalContratos,
  valorVigenteTotal,
  valorCritico,
  valorAtencao,
  activeStatus,
  onSelectStatus
}) => (
  <CarteiraSummaryCards
    testIdPrefix="contracts"
    vigentes={vigentes}
    criticos={criticos}
    atencao={atencao}
    historico={historico}
    vigentesHint={`de ${totalContratos} ${totalContratos === 1 ? 'contrato' : 'contratos'}`}
    vigentesValorHint={typeof valorVigenteTotal === 'number' ? `${formatCurrencyCompact(valorVigenteTotal)} em valor vigente` : undefined}
    criticoValorHint={typeof valorCritico === 'number' ? `${formatCurrencyCompact(valorCritico)} em valor vigente` : undefined}
    atencaoValorHint={typeof valorAtencao === 'number' ? `${formatCurrencyCompact(valorAtencao)} em valor vigente` : undefined}
    historicoHint="Expirados / encerrados"
    active={activeStatus}
    onSelect={onSelectStatus}
  />
);
