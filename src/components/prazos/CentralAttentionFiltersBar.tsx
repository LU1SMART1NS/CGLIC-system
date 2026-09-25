import React from 'react';
import { Search, Filter, X } from 'lucide-react';
import type { DashboardAttentionSeverity } from '../../types/managementDashboard';

export interface CentralAttentionFiltersState {
  severidade: DashboardAttentionSeverity | 'TODAS';
  origem: 'TODAS' | 'CONTRATO' | 'PAGAMENTO' | 'ATA' | 'REAJUSTE' | 'TAREFA';
  busca: string;
}

interface CentralAttentionFiltersBarProps {
  filters: CentralAttentionFiltersState;
  onChangeFilter: <K extends keyof CentralAttentionFiltersState>(key: K, value: CentralAttentionFiltersState[K]) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalItems: number;
}

export const CentralAttentionFiltersBar: React.FC<CentralAttentionFiltersBarProps> = ({
  filters,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalItems
}) => {
  const hasActiveFilters = Boolean(
    filters.severidade !== 'TODAS' ||
    filters.origem !== 'TODAS' ||
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

        {/* 1. Severidade */}
        <select
          value={filters.severidade}
          onChange={(e) => onChangeFilter('severidade', e.target.value as any)}
          data-testid="central-filter-severity"
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
          <option value="TODAS">Todas as Severidades</option>
          <option value="CRITICA">🚨 Crítica</option>
          <option value="URGENTE">⚠️ Urgente</option>
          <option value="ATENCAO">ℹ️ Atenção</option>
          <option value="INFO">📋 Info</option>
        </select>

        {/* 2. Origem / Categoria */}
        <select
          value={filters.origem}
          onChange={(e) => onChangeFilter('origem', e.target.value as any)}
          data-testid="central-filter-origin"
          style={{
            maxWidth: '200px',
            minWidth: '150px',
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
          <option value="TODAS">Todas as Origens</option>
          <option value="CONTRATO">Contratos & Prazos</option>
          <option value="PAGAMENTO">Pagamentos & CGOFI</option>
          <option value="ATA">Atas & Saldos</option>
          <option value="REAJUSTE">Radars de Reajuste</option>
          <option value="TAREFA">Tarefas do Plano</option>
        </select>

        {/* 3. Busca Textual */}
        <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '360px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por contrato, ata, descrição..."
            value={filters.busca}
            onChange={(e) => onChangeFilter('busca', e.target.value)}
            data-testid="central-filter-search"
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
            data-testid="central-reset-filters-btn"
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

      {/* Contagem de Situações */}
      <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {hasActiveFilters
          ? `Exibindo ${totalFiltered} de ${totalItems} situações`
          : `${totalItems} ${totalItems === 1 ? 'situação' : 'situações'}`}
      </div>
    </div>
  );
};
