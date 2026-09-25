import React from 'react';
import { Search, Filter, X } from 'lucide-react';

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
  const hasActiveFilters = Boolean(
    filters.unit !== 'TODAS' ||
    filters.vigencia !== 'TODAS' ||
    filters.search.trim().length > 0
  );

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.75rem',
      padding: '0.65rem 0.95rem',
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '0.8rem'
    }}>
      {/* Controles de Filtro em Linha */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.65rem',
        flex: 1
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          color: '#64748b',
          fontWeight: 700,
          fontSize: '0.76rem',
          flexShrink: 0
        }}>
          <Filter size={13} /> Filtros:
        </div>

        {/* 1. Selecionar Unidade / Diretoria */}
        <select
          value={filters.unit}
          onChange={(e) => onChangeFilter('unit', e.target.value)}
          data-testid="allocations-filter-unit"
          style={{
            maxWidth: '220px',
            minWidth: '160px',
            padding: '0.35rem 0.6rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: '0.78rem',
            color: '#0f172a',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <option value="TODAS">Todas as Unidades</option>
          {availableUnits.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>

        {/* 2. Situação de Vigência da Ata */}
        <select
          value={filters.vigencia}
          onChange={(e) => onChangeFilter('vigencia', e.target.value as any)}
          data-testid="allocations-filter-vigencia"
          style={{
            maxWidth: '180px',
            minWidth: '140px',
            padding: '0.35rem 0.6rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: '0.78rem',
            color: '#0f172a',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <option value="TODAS">Todas as Vigências</option>
          <option value="VIGENTE">Atas Vigentes</option>
          <option value="ALERTAS">Vencendo em ≤90d</option>
          <option value="EXPIRADA">Expiradas / Canceladas</option>
        </select>

        {/* 3. Busca Textual */}
        <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '360px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por Ata, item, descrição, fornecedor..."
            value={filters.search}
            onChange={(e) => onChangeFilter('search', e.target.value)}
            data-testid="allocations-filter-search"
            style={{
              width: '100%',
              padding: '0.35rem 0.65rem 0.35rem 2rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.78rem',
              color: '#0f172a',
              outline: 'none'
            }}
          />
        </div>

        {/* 4. Limpar Filtros */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            data-testid="allocations-reset-filters-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.3rem 0.6rem',
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: 700,
              color: '#991b1b',
              cursor: 'pointer'
            }}
          >
            <X size={12} /> Limpar
          </button>
        )}
      </div>

      {/* Contagem */}
      <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {hasActiveFilters
          ? `Exibindo ${totalFiltered} de ${totalItems} alocações`
          : `${totalItems} ${totalItems === 1 ? 'alocação' : 'alocações'}`}
      </div>
    </div>
  );
};
