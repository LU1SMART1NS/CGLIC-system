import React from 'react';
import { Search, Filter, X } from 'lucide-react';
import type { ArpVigenciaFilterOption } from './ArpPortfolioSummary';

export interface ArpPortfolioFilterState {
  statusVigencia: ArpVigenciaFilterOption;
  filtroAlocacao: 'TODAS' | 'SIM' | 'NAO';
  filtroEmpenho: 'TODAS' | 'SIM' | 'NAO';
  busca: string;
}

interface ArpPortfolioFiltersProps {
  filters: ArpPortfolioFilterState;
  onChangeFilter: <K extends keyof ArpPortfolioFilterState>(key: K, value: ArpPortfolioFilterState[K]) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalAtas: number;
}

export const ArpPortfolioFilters: React.FC<ArpPortfolioFiltersProps> = ({
  filters,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalAtas
}) => {
  const hasActiveFilters = Boolean(
    filters.statusVigencia !== 'TODAS' ||
    filters.filtroAlocacao !== 'TODAS' ||
    filters.filtroEmpenho !== 'TODAS' ||
    filters.busca.trim().length > 0
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

        {/* 1. Situação de Vigência */}
        <select
          value={filters.statusVigencia}
          onChange={(e) => onChangeFilter('statusVigencia', e.target.value as ArpVigenciaFilterOption)}
          data-testid="arp-filter-vigencia"
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
          <option value="VIGENTE">Vigentes</option>
          <option value="A_VENCER_90D">A Vencer (≤90d)</option>
          <option value="EXPIRADA">Expiradas / Canceladas</option>
        </select>

        {/* 2. Filtro por Alocação */}
        <select
          value={filters.filtroAlocacao}
          onChange={(e) => onChangeFilter('filtroAlocacao', e.target.value as 'TODAS' | 'SIM' | 'NAO')}
          data-testid="arp-filter-alocacao"
          style={{
            maxWidth: '170px',
            minWidth: '130px',
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
          <option value="TODAS">Alocação (Todas)</option>
          <option value="SIM">Com Alocação</option>
          <option value="NAO">Sem Alocação</option>
        </select>

        {/* 3. Filtro por Empenho */}
        <select
          value={filters.filtroEmpenho}
          onChange={(e) => onChangeFilter('filtroEmpenho', e.target.value as 'TODAS' | 'SIM' | 'NAO')}
          data-testid="arp-filter-empenho"
          style={{
            maxWidth: '170px',
            minWidth: '130px',
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
          <option value="TODAS">Empenho (Todos)</option>
          <option value="SIM">Com Empenho</option>
          <option value="NAO">Sem Empenho</option>
        </select>

        {/* 4. Busca Textual */}
        <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '360px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por Ata, fornecedor, CNPJ, item..."
            value={filters.busca}
            onChange={(e) => onChangeFilter('busca', e.target.value)}
            data-testid="arp-filter-search"
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

        {/* 5. Limpar Filtros */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            data-testid="arp-reset-filters-btn"
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
          ? `Exibindo ${totalFiltered} de ${totalAtas} Atas`
          : `${totalAtas} ${totalAtas === 1 ? 'Ata' : 'Atas'}`}
      </div>
    </div>
  );
};
