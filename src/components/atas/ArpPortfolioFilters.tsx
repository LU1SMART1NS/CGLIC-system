import React from 'react';
import { Search, X } from 'lucide-react';
import { carteiraSelect } from '../carteira/carteiraStyles';
import type { ArpVigenciaFilterOption } from './ArpPortfolioSummary';

export const DEFAULT_ARP_FILTERS: ArpPortfolioFilterState = {
  statusVigencia: 'VIGENTES',
  filtroAlocacao: 'TODAS',
  filtroEmpenho: 'TODAS',
  busca: ''
};

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
    filters.statusVigencia !== DEFAULT_ARP_FILTERS.statusVigencia ||
    filters.filtroAlocacao !== 'TODAS' ||
    filters.filtroEmpenho !== 'TODAS' ||
    filters.busca.trim().length > 0
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', flex: 1 }}>
        <div style={{ position: 'relative', minWidth: '260px', flex: 1, maxWidth: '400px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por Ata, fornecedor, CNPJ, item..."
            value={filters.busca}
            onChange={(e) => onChangeFilter('busca', e.target.value)}
            data-testid="arp-filter-search"
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
          value={filters.statusVigencia}
          onChange={(e) => onChangeFilter('statusVigencia', e.target.value as ArpVigenciaFilterOption)}
          data-testid="arp-filter-vigencia"
          style={carteiraSelect}
        >
          <option value="TODOS">Todas as Vigências</option>
          <option value="VIGENTES">Vigentes</option>
          <option value="CRITICO">Crítico (≤30 dias)</option>
          <option value="ATENCAO">Atenção (31–90 dias)</option>
          <option value="HISTORICO">Histórico</option>
        </select>

        <select
          value={filters.filtroAlocacao}
          onChange={(e) => onChangeFilter('filtroAlocacao', e.target.value as 'TODAS' | 'SIM' | 'NAO')}
          data-testid="arp-filter-alocacao"
          style={carteiraSelect}
        >
          <option value="TODAS">Alocação (Todas)</option>
          <option value="SIM">Com Alocação</option>
          <option value="NAO">Sem Alocação</option>
        </select>

        <select
          value={filters.filtroEmpenho}
          onChange={(e) => onChangeFilter('filtroEmpenho', e.target.value as 'TODAS' | 'SIM' | 'NAO')}
          data-testid="arp-filter-empenho"
          style={carteiraSelect}
        >
          <option value="TODAS">Empenho (Todos)</option>
          <option value="SIM">Com Empenho</option>
          <option value="NAO">Sem Empenho</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            data-testid="arp-reset-filters-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.35rem 0.65rem',
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: '#991b1b',
              cursor: 'pointer'
            }}
          >
            <X size={12} /> Limpar
          </button>
        )}
      </div>

      <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {hasActiveFilters || totalFiltered !== totalAtas
          ? `Exibindo ${totalFiltered} de ${totalAtas} Atas`
          : `${totalAtas} ${totalAtas === 1 ? 'Ata' : 'Atas'}`}
      </div>
    </div>
  );
};
