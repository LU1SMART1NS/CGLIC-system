import React from 'react';
import { CarteiraFilterButton } from '../../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, type CarteiraFilterSchema } from '../../carteira/carteiraFilters';
import { TODOS_GESTORES } from '../../carteira/carteiraGestor';
import type { ContractStatusFilterOption } from './ContractsPortfolioSummary';
import { CarteiraUnidadeSelect, TODAS_UNIDADES } from '../../carteira/CarteiraExecucaoSelects';

export { SEM_GESTOR } from '../../carteira/carteiraGestor';

export interface ContractsPortfolioFilterState {
  status: ContractStatusFilterOption;
  pendencia: 'TODOS' | 'COM_PENDENCIA';
  /** Unidade interna (nome normalizado; 'TODAS' = sem filtro): contratos cujos itens receberam alocação dela. */
  unidade: string;
  /** Nome do gestor ('TODOS' = sem filtro; '__SEM_GESTOR__' = contratos sem gestor atribuído). */
  gestor: string;
  busca: string;
}

export const CONTRACTS_FILTER_SCHEMA: CarteiraFilterSchema<ContractsPortfolioFilterState> = {
  status: { param: 'situacao', default: 'VIGENTES', values: ['TODOS', 'VIGENTES', 'CRITICO', 'ATENCAO', 'HISTORICO'] },
  pendencia: { param: 'pendencia', default: 'TODOS', values: ['TODOS', 'COM_PENDENCIA'] },
  unidade: { param: 'unidade', default: TODAS_UNIDADES },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};

export const DEFAULT_CONTRACTS_FILTERS: ContractsPortfolioFilterState = {
  status: 'VIGENTES',
  pendencia: 'TODOS',
  unidade: TODAS_UNIDADES,
  gestor: TODOS_GESTORES,
  busca: ''
};

interface ContractsPortfolioFiltersProps {
  filters: ContractsPortfolioFilterState;
  gestores: string[];
  /** Unidades internas com alocação (opções do seletor). */
  unidades?: Array<{ chave: string; nome: string }>;
  /** Quantos contratos têm pendência (aparece no menu do filtro). */
  comPendencia?: number;
  /** Esconde o seletor de gestor (perfil "gestor", que já vê só os próprios contratos). */
  showGestorFilter?: boolean;
  onChangeFilter: <K extends keyof ContractsPortfolioFilterState>(key: K, value: ContractsPortfolioFilterState[K]) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalContracts: number;
}

export const ContractsPortfolioFilters: React.FC<ContractsPortfolioFiltersProps> = ({
  filters,
  gestores,
  unidades = [],
  comPendencia,
  showGestorFilter = true,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalContracts
}) => {
  const hasActiveFilters = hasActiveCarteiraFilters(CONTRACTS_FILTER_SCHEMA, filters);

  return (
    <CarteiraFilterBar
      busca={filters.busca}
      searchPlaceholder="Buscar por contrato, fornecedor, CNPJ..."
      onChangeBusca={(value) => onChangeFilter('busca', value)}
      hasActiveFilters={hasActiveFilters}
      onResetFilters={onResetFilters}
      counter={carteiraCounter(totalFiltered, totalContracts, hasActiveFilters, 'contrato', 'contratos')}
      testIdPrefix="contracts"
    >
      <CarteiraFilterButton
        label="Pendências"
        value={filters.pendencia}
        emptyValue="TODOS"
        options={[{ value: 'COM_PENDENCIA', label: 'Com pendência', count: comPendencia }]}
        onChange={(value) => onChangeFilter('pendencia', value as ContractsPortfolioFilterState['pendencia'])}
        testId="contracts-filter-pendencia"
      />

      <CarteiraUnidadeSelect
        value={filters.unidade}
        unidades={unidades}
        onChange={(value) => onChangeFilter('unidade', value)}
        testId="contracts-filter-unidade"
      />

      {showGestorFilter && (
        <CarteiraGestorSelect
          value={filters.gestor}
          gestores={gestores}
          onChange={(value) => onChangeFilter('gestor', value)}
          testId="contracts-filter-gestor"
        />
      )}
    </CarteiraFilterBar>
  );
};
