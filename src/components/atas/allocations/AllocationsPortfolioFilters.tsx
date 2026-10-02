import React from 'react';
import { FilterBar } from '../../../design-system';
import { VIGENCIA_RULES } from '../../../config/alertRules';

export interface AllocationsPortfolioFilterState {
  unit: string;
  vigencia: 'TODAS' | 'VIGENTE' | 'ALERTAS' | 'EXPIRADA';
  search: string;
}

interface AllocationsPortfolioFiltersProps {
  filters: AllocationsPortfolioFilterState;
  availableUnits: string[];
  onChangeFilter: <K extends keyof AllocationsPortfolioFilterState>(key: K, value: AllocationsPortfolioFilterState[K]) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalItems: number;
}

export const AllocationsPortfolioFilters: React.FC<AllocationsPortfolioFiltersProps> = ({
  filters,
  availableUnits,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalItems
}) => {
  const hasActiveFilters = filters.unit !== 'TODAS' || filters.vigencia !== 'TODAS' || filters.search.trim().length > 0;

  return (
    <div>
      <FilterBar
        testId="allocations-filter-bar"
        searchValue={filters.search}
        onSearchChange={(v) => onChangeFilter('search', v)}
        searchPlaceholder="Buscar por Ata, item, descrição, fornecedor..."
        selects={[
          {
            id: 'allocations-filter-unit',
            label: 'Unidade',
            value: filters.unit,
            onChange: (v) => onChangeFilter('unit', v),
            options: [{ value: 'TODAS', label: 'Todas as Unidades' }, ...availableUnits.map((u) => ({ value: u, label: u }))]
          },
          {
            id: 'allocations-filter-vigencia',
            label: 'Vigência da Ata',
            value: filters.vigencia,
            onChange: (v) => onChangeFilter('vigencia', v as AllocationsPortfolioFilterState['vigencia']),
            options: [
              { value: 'TODAS', label: 'Todas as Vigências' },
              { value: 'VIGENTE', label: 'Atas Vigentes' },
              { value: 'ALERTAS', label: `Vencendo em ≤${VIGENCIA_RULES.ataExpirandoAteDias} dias` },
              { value: 'EXPIRADA', label: 'Expiradas / Canceladas' }
            ]
          }
        ]}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={onResetFilters}
      />
      <div data-testid="allocations-counter" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', margin: '0.5rem 0.25rem 0' }}>
        {totalFiltered === totalItems
          ? `${totalItems} ${totalItems === 1 ? 'alocação' : 'alocações'}`
          : `${totalFiltered} de ${totalItems} alocações`}
      </div>
    </div>
  );
};
