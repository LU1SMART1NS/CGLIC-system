import React from 'react';
import { Search, X } from 'lucide-react';
import { carteiraSelect } from '../../carteira/carteiraStyles';
import type { ContractStatusFilterOption } from './ContractsPortfolioSummary';

export interface ContractsPortfolioFilterState {
  status: ContractStatusFilterOption;
  pendencia: 'TODOS' | 'COM_PENDENCIA';
  /** Nome do gestor ('TODOS' = sem filtro; '__SEM_GESTOR__' = contratos sem gestor atribuído). */
  gestor: string;
  busca: string;
}

export const SEM_GESTOR = '__SEM_GESTOR__';

export const DEFAULT_CONTRACTS_FILTERS: ContractsPortfolioFilterState = {
  status: 'VIGENTES',
  pendencia: 'TODOS',
  gestor: 'TODOS',
  busca: ''
};

interface ContractsPortfolioFiltersProps {
  filters: ContractsPortfolioFilterState;
  gestores: string[];
  onChangeFilter: <K extends keyof ContractsPortfolioFilterState>(key: K, value: ContractsPortfolioFilterState[K]) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalContracts: number;
}

export const ContractsPortfolioFilters: React.FC<ContractsPortfolioFiltersProps> = ({
  filters,
  gestores,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalContracts
}) => {
  const hasActiveFilters = Boolean(
    filters.status !== DEFAULT_CONTRACTS_FILTERS.status ||
    filters.pendencia !== 'TODOS' ||
    filters.gestor !== 'TODOS' ||
    filters.busca.trim().length > 0
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', flex: 1 }}>
        <div style={{ position: 'relative', minWidth: '260px', flex: 1, maxWidth: '400px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por contrato, fornecedor, CNPJ..."
            value={filters.busca}
            onChange={(e) => onChangeFilter('busca', e.target.value)}
            data-testid="contracts-filter-search"
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
          value={filters.status}
          onChange={(e) => onChangeFilter('status', e.target.value as ContractStatusFilterOption)}
          data-testid="contracts-filter-status"
          style={carteiraSelect}
        >
          <option value="TODOS">Todas as Situações</option>
          <option value="VIGENTES">Vigentes</option>
          <option value="CRITICO">Crítico (≤30 dias)</option>
          <option value="ATENCAO">Atenção (31–90 dias)</option>
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

        <select
          value={filters.gestor}
          onChange={(e) => onChangeFilter('gestor', e.target.value)}
          data-testid="contracts-filter-gestor"
          style={carteiraSelect}
        >
          <option value="TODOS">Todos os Gestores</option>
          <option value={SEM_GESTOR}>Sem gestor</option>
          {gestores.map((nome) => (
            <option key={nome} value={nome}>{nome}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            data-testid="contracts-reset-filters-btn"
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
        {hasActiveFilters || totalFiltered !== totalContracts
          ? `Exibindo ${totalFiltered} de ${totalContracts} contratos`
          : `${totalContracts} ${totalContracts === 1 ? 'contrato' : 'contratos'}`}
      </div>
    </div>
  );
};
