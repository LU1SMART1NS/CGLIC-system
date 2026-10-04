import React from 'react';
import { carteiraSelect } from '../../carteira/carteiraStyles';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, type CarteiraFilterSchema } from '../../carteira/carteiraFilters';
import { TODOS_GESTORES } from '../../carteira/carteiraGestor';
import type { ContractStatusFilterOption } from './ContractsPortfolioSummary';
import { VIGENCIA_RULES } from '../../../config/alertRules';

export { SEM_GESTOR } from '../../carteira/carteiraGestor';

export interface ContractsPortfolioFilterState {
  status: ContractStatusFilterOption;
  pendencia: 'TODOS' | 'COM_PENDENCIA';
  /** Nome do gestor ('TODOS' = sem filtro; '__SEM_GESTOR__' = contratos sem gestor atribuído). */
  gestor: string;
  busca: string;
}

export const CONTRACTS_FILTER_SCHEMA: CarteiraFilterSchema<ContractsPortfolioFilterState> = {
  status: { param: 'situacao', default: 'VIGENTES', values: ['TODOS', 'VIGENTES', 'CRITICO', 'ATENCAO', 'HISTORICO'] },
  pendencia: { param: 'pendencia', default: 'TODOS', values: ['TODOS', 'COM_PENDENCIA'] },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};

export const DEFAULT_CONTRACTS_FILTERS: ContractsPortfolioFilterState = {
  status: 'VIGENTES',
  pendencia: 'TODOS',
  gestor: TODOS_GESTORES,
  busca: ''
};

interface ContractsPortfolioFiltersProps {
  filters: ContractsPortfolioFilterState;
  gestores: string[];
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
      <select
        value={filters.status}
        onChange={(e) => onChangeFilter('status', e.target.value as ContractStatusFilterOption)}
        data-testid="contracts-filter-status"
        style={carteiraSelect}
      >
        <option value="TODOS">Todas as Situações</option>
        <option value="VIGENTES">Vigentes</option>
        <option value="CRITICO">Crítico (≤{VIGENCIA_RULES.faixaCriticoAteDias} dias)</option>
        <option value="ATENCAO">Atenção ({VIGENCIA_RULES.faixaCriticoAteDias + 1}–{VIGENCIA_RULES.faixaAtencaoAteDias} dias)</option>
        <option value="HISTORICO">Histórico</option>
      </select>

      <select
        value={filters.pendencia}
        onChange={(e) => onChangeFilter('pendencia', e.target.value as ContractsPortfolioFilterState['pendencia'])}
        data-testid="contracts-filter-pendencia"
        style={carteiraSelect}
      >
        <option value="TODOS">Todas as Pendências</option>
        <option value="COM_PENDENCIA">Com pendência</option>
      </select>

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
