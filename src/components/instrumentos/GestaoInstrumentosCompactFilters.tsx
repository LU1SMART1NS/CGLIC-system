import React from 'react';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton, type CarteiraFilterOption } from '../carteira/CarteiraFilterButton';
import type { DashboardAttentionCategory, DashboardAttentionSeverity } from '../../types/managementDashboard';

export interface GestaoInstrumentosCompactFiltersState {
  severidade: DashboardAttentionSeverity | 'TODAS';
  /**
   * Motivo da atenção: a categoria do alerta ou, nas abas de uma categoria só, "CATEGORIA.chave" (regra do lembrete,
   * situação da data-base do reajuste); 'TODAS' = sem filtro.
   */
  motivo: DashboardAttentionCategory | 'TODAS' | string;
  busca: string;
}

interface GestaoInstrumentosCompactFiltersProps {
  filters: GestaoInstrumentosCompactFiltersState;
  onChangeFilter: <K extends keyof GestaoInstrumentosCompactFiltersState>(
    key: K,
    value: GestaoInstrumentosCompactFiltersState[K]
  ) => void;
  onResetFilters: () => void;
  /** Motivos presentes na aba aberta (com contagem), já calculados pelo painel. */
  motivoOptions: CarteiraFilterOption[];
  totalFiltered: number;
  totalItems: number;
}

/**
 * Filtros do Início no padrão das carteiras: busca, "+ Prioridade", "Limpar" e contador.
 * Prioridade em níveis (Máxima/Alta/Média) para não confundir com "vencida" (vigência) nem com Crítico/Atenção das carteiras.
 */
export const GestaoInstrumentosCompactFilters: React.FC<GestaoInstrumentosCompactFiltersProps> = ({
  filters,
  onChangeFilter,
  onResetFilters,
  motivoOptions,
  totalFiltered,
  totalItems
}) => {
  const hasActiveFilters = Boolean(filters.severidade !== 'TODAS' || filters.motivo !== 'TODAS' || filters.busca.trim().length > 0);

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
      {/* Em todas as abas, com os motivos da aba aberta (a lista muda com a aba). */}
      <CarteiraFilterButton
        label="Motivo"
        value={filters.motivo}
        emptyValue="TODAS"
        options={motivoOptions}
        onChange={(value) => onChangeFilter('motivo', value as GestaoInstrumentosCompactFiltersState['motivo'])}
        testId="instrumentos-filter-motivo"
      />
    </CarteiraFilterBar>
  );
};
