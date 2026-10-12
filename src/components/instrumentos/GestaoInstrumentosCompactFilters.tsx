import React from 'react';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import type { DashboardAttentionSeverity } from '../../types/managementDashboard';

export interface GestaoInstrumentosCompactFiltersState {
  severidade: DashboardAttentionSeverity | 'TODAS';
  busca: string;
}

interface GestaoInstrumentosCompactFiltersProps {
  filters: GestaoInstrumentosCompactFiltersState;
  onChangeFilter: <K extends keyof GestaoInstrumentosCompactFiltersState>(
    key: K,
    value: GestaoInstrumentosCompactFiltersState[K]
  ) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalItems: number;
}

/**
 * Filtros da Visão Geral no padrão das carteiras: busca, "+ Prioridade", "Limpar" e contador.
 * Prioridade em níveis (Máxima/Alta/Média) para não confundir com "vencida" (vigência) nem com Crítico/Atenção das carteiras.
 */
export const GestaoInstrumentosCompactFilters: React.FC<GestaoInstrumentosCompactFiltersProps> = ({
  filters,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalItems
}) => {
  const hasActiveFilters = Boolean(filters.severidade !== 'TODAS' || filters.busca.trim().length > 0);

  return (
    <CarteiraFilterBar
      busca={filters.busca}
      searchPlaceholder="Buscar por instrumento, fornecedor, objeto..."
      onChangeBusca={(value) => onChangeFilter('busca', value)}
      hasActiveFilters={hasActiveFilters}
      onResetFilters={onResetFilters}
      counter={carteiraCounter(totalFiltered, totalItems, hasActiveFilters, 'instrumento', 'instrumentos')}
      testIdPrefix="instrumentos"
    >
      <CarteiraFilterButton
        label="Prioridade"
        value={filters.severidade}
        emptyValue="TODAS"
        options={[
          { value: 'CRITICA', label: 'Máxima' },
          { value: 'URGENTE', label: 'Alta' },
          { value: 'ATENCAO', label: 'Média' }
        ]}
        onChange={(value) => onChangeFilter('severidade', value as GestaoInstrumentosCompactFiltersState['severidade'])}
        testId="instrumentos-filter-severity"
      />
    </CarteiraFilterBar>
  );
};
