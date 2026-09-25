import { Filter, X, LayoutDashboard } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import type {
  ManagementDashboardFilters,
  ManagementDashboardAvailableFilters
} from '../../types/managementDashboard';

interface HomeHeaderAndFiltersProps {
  filters: ManagementDashboardFilters;
  availableFilters?: ManagementDashboardAvailableFilters;
  onFilterChange: (newFilters: Partial<ManagementDashboardFilters>) => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | string | number | null;
}

export const HomeHeaderAndFilters: React.FC<HomeHeaderAndFiltersProps> = ({
  filters,
  availableFilters,
  onFilterChange,
  onResetFilters,
  onRefresh,
  isRefreshing = false,
  lastUpdated
}) => {
  const hasActiveFilters = Boolean(
    filters.contractKey || filters.numeroAta || (filters.statusContrato && filters.statusContrato !== 'TODOS')
  );

  return (
        <header style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <PageHeader 
        title="Visão Geral"
        subtitle="Acompanhe a situação da sua unidade e os principais pontos de atenção."
        icon={<LayoutDashboard size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            lastUpdated={lastUpdated}
            dataTestId="home-refresh-btn"
            tooltipTitle="Recarregar dados da Visão Geral"
          />
        }
      />

      {/* Linha Inferior: Barra de Contexto / Filtros Compactos e Alinhados */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.65rem',
        padding: '0.55rem 0.85rem',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        fontSize: '0.8rem'
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
          <Filter size={13} /> Contexto:
        </div>

        {/* Filtro: Contrato com largura controlada */}
        <select
          value={filters.contractKey || ''}
          onChange={(e) => onFilterChange({ contractKey: e.target.value || undefined })}
          data-testid="home-filter-contract"
          style={{
            maxWidth: '260px',
            minWidth: '170px',
            padding: '0.35rem 0.6rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: '0.78rem',
            color: '#0f172a',
            fontWeight: 600,
            cursor: 'pointer',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            overflow: 'hidden'
          }}
        >
          <option value="">Todos os Contratos</option>
          {availableFilters?.contracts.map((c) => {
            const rawLabel = c.sublabel ? `${c.label} (${c.sublabel})` : c.label;
            const displayLabel = rawLabel.length > 45 ? `${rawLabel.slice(0, 42)}...` : rawLabel;
            return (
              <option key={c.key} value={c.key} title={rawLabel}>
                {displayLabel}
              </option>
            );
          })}
        </select>

        {/* Filtro: Ata com largura controlada */}
        <select
          value={filters.numeroAta || ''}
          onChange={(e) => onFilterChange({ numeroAta: e.target.value || undefined })}
          data-testid="home-filter-ata"
          style={{
            maxWidth: '190px',
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
          <option value="">Todas as Atas</option>
          {availableFilters?.atas.map((a) => (
            <option key={a.key} value={a.key}>
              Ata {a.label}
            </option>
          ))}
        </select>

        {/* Filtro: Situação com largura controlada */}
        <select
          value={filters.statusContrato || 'TODOS'}
          onChange={(e) => onFilterChange({ statusContrato: e.target.value as ManagementDashboardFilters['statusContrato'] })}
          data-testid="home-filter-status"
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
          <option value="ATIVO">Vigentes / Ativos</option>
          <option value="EM_PRORROGACAO">Em Prorrogação</option>
          <option value="ENCERRADO">Encerrados</option>
        </select>

        {/* Limpar Filtros */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            data-testid="home-reset-filters-btn"
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
    </header>
  );
};
