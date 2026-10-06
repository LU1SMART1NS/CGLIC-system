import React from 'react';
import { Search, X } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';
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

export const GestaoInstrumentosCompactFilters: React.FC<GestaoInstrumentosCompactFiltersProps> = ({
  filters,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalItems
}) => {
  const hasActiveFilters = Boolean(filters.severidade !== 'TODAS' || filters.busca.trim().length > 0);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', flex: 1 }}>
        <div style={{ position: 'relative', minWidth: 0, flex: '1 1 240px', maxWidth: '380px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por instrumento, fornecedor, objeto..."
            value={filters.busca}
            onChange={(e) => onChangeFilter('busca', e.target.value)}
            data-testid="instrumentos-filter-search"
            style={{
              width: '100%',
              padding: '0.4rem 0.7rem 0.4rem 2rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.8rem',
              color: '#0f172a',
              outline: 'none'
            }}
          />
        </div>

        <select
          value={filters.severidade}
          onChange={(e) => onChangeFilter('severidade', e.target.value as GestaoInstrumentosCompactFiltersState['severidade'])}
          data-testid="instrumentos-filter-severity"
          style={{
            minWidth: 0,
            flex: '1 1 160px',
            padding: '0.4rem 0.65rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: '0.8rem',
            color: '#0f172a',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <option value="TODAS">Toda Prioridade</option>
          <option value="CRITICA">Crítico</option>
          <option value="URGENTE">Urgente</option>
          <option value="ATENCAO">Atenção</option>
          <option value="INFO">Info</option>
        </select>

        {hasActiveFilters && (
          <AppButton
            type="button"
            variant="ghostDanger"
            size="sm"
            onClick={onResetFilters}
            data-testid="instrumentos-reset-filters-btn"
            icon={<X size={14} />}
          >
            Limpar
          </AppButton>
        )}
      </div>

      <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {hasActiveFilters
          ? `Exibindo ${totalFiltered} de ${totalItems} instrumentos`
          : `${totalItems} ${totalItems === 1 ? 'instrumento' : 'instrumentos'}`}
      </div>
    </div>
  );
};
