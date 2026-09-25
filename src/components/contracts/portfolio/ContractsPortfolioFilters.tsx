import React from 'react';
import { Search, Filter, X } from 'lucide-react';
import type { ContractStatusFilterOption } from './ContractsPortfolioSummary';

export interface ContractsPortfolioFilterState {
  status: ContractStatusFilterOption;
  tipoInstrumento: string;
  busca: string;
}

interface ContractsPortfolioFiltersProps {
  filters: ContractsPortfolioFilterState;
  onChangeFilter: <K extends keyof ContractsPortfolioFilterState>(key: K, value: ContractsPortfolioFilterState[K]) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalContracts: number;
}

export const ContractsPortfolioFilters: React.FC<ContractsPortfolioFiltersProps> = ({
  filters,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalContracts
}) => {
  const hasActiveFilters = Boolean(
    filters.status !== 'TODOS' ||
    filters.tipoInstrumento !== 'TODOS' ||
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

        {/* 1. Situação Contratual */}
        <select
          value={filters.status}
          onChange={(e) => onChangeFilter('status', e.target.value as any)}
          data-testid="contracts-filter-status"
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
          <option value="TODOS">Todas as Situações</option>
          <option value="VIGENTE">Vigentes</option>
          <option value="A_VENCER_60D">A Vencer (≤60d)</option>
          <option value="EXPIRADO">Expirados / Encerrados</option>
        </select>

        {/* 2. Tipo de Instrumento */}
        <select
          value={filters.tipoInstrumento}
          onChange={(e) => onChangeFilter('tipoInstrumento', e.target.value)}
          data-testid="contracts-filter-type"
          style={{
            maxWidth: '190px',
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
          <option value="TODOS">Todos os Instrumentos</option>
          <option value="CONTRATO">Contrato</option>
          <option value="TERMO_ADITIVO">Termo Aditivo</option>
          <option value="APOSTILAMENTO">Apostilamento</option>
          <option value="CARTA_CONTRATO">Carta Contrato</option>
        </select>

        {/* 3. Busca Textual */}
        <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '360px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por contrato, fornecedor, CNPJ..."
            value={filters.busca}
            onChange={(e) => onChangeFilter('busca', e.target.value)}
            data-testid="contracts-filter-search"
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
            data-testid="contracts-reset-filters-btn"
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
          ? `Exibindo ${totalFiltered} de ${totalContracts} contratos`
          : `${totalContracts} ${totalContracts === 1 ? 'contrato' : 'contratos'}`}
      </div>
    </div>
  );
};
