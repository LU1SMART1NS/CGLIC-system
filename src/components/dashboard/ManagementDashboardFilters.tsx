import React from 'react';
import {
  Filter,
  RotateCcw,
  FileText,
  Boxes,
  Building2,
  X,
  Layers
} from 'lucide-react';
import type {
  ManagementDashboardFilters as FiltersType,
  ManagementDashboardAvailableFilters
} from '../../types/managementDashboard';

export interface ManagementDashboardFiltersProps {
  filters: FiltersType;
  availableFilters?: ManagementDashboardAvailableFilters;
  onFilterChange: (filters: FiltersType) => void;
  onResetFilters: () => void;
  isLoading?: boolean;
}

/**
 * Barra de Filtros Globais e Contexto do Dashboard Gerencial (SaldoARP 3.0 — Fase 8-I)
 * 
 * Princípios Fundamentais:
 * 1. Componente puramente visual de controle de estado de filtros;
 * 2. Indicação explícita e inequívoca do contexto visual filtrado;
 * 3. População dinâmica das opções a partir das entidades disponíveis no Read Model;
 * 4. Botão de reset rápido para retorno imediato à visão global.
 */
export const ManagementDashboardFilters: React.FC<ManagementDashboardFiltersProps> = ({
  filters,
  availableFilters,
  onFilterChange,
  onResetFilters,
  isLoading = false
}) => {
  const contracts = availableFilters?.contracts || [];
  const atas = availableFilters?.atas || [];

  const hasActiveFilters = Boolean(
    (filters.contractKey && filters.contractKey !== '') ||
    (filters.numeroAta && filters.numeroAta !== '') ||
    (filters.statusContrato && filters.statusContrato !== 'TODOS') ||
    (filters.uasg && filters.uasg !== '200331')
  );

  const activeContractObj = contracts.find((c) => c.key === filters.contractKey);
  const activeAtaObj = atas.find((a) => a.key === filters.numeroAta);

  const handleUasgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({
      ...filters,
      uasg: e.target.value.trim() || '200331'
    });
  };

  const handleContractChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onFilterChange({
      ...filters,
      contractKey: val !== '' ? val : undefined
    });
  };

  const handleAtaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onFilterChange({
      ...filters,
      numeroAta: val !== '' ? val : undefined
    });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as FiltersType['statusContrato'];
    onFilterChange({
      ...filters,
      statusContrato: val
    });
  };

  const handleRemoveFilter = (key: keyof FiltersType) => {
    const next = { ...filters };
    if (key === 'uasg') {
      next.uasg = '200331';
    } else {
      delete next[key];
    }
    onFilterChange(next);
  };

  return (
    <section
      data-testid="management-dashboard-filters"
      aria-label="Filtros globais do Dashboard Gerencial"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        marginBottom: '1.5rem'
      }}
    >
      {/* Barra de Controles de Filtro */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={20} color="#6366f1" aria-hidden="true" />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
            Filtros do Dashboard
          </h3>
        </div>

        {/* Grupo de Controles */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.75rem',
            flex: 1,
            justifyContent: 'flex-end'
          }}
        >
          {/* Filtro UASG */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Building2 size={16} color="#64748b" aria-hidden="true" />
            <label htmlFor="filter-uasg" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
              UASG:
            </label>
            <input
              id="filter-uasg"
              data-testid="filter-input-uasg"
              type="text"
              value={filters.uasg || '200331'}
              onChange={handleUasgChange}
              disabled={isLoading}
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#0f172a',
                width: '90px'
              }}
            />
          </div>

          {/* Filtro Contrato */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <FileText size={16} color="#64748b" aria-hidden="true" />
            <label htmlFor="filter-contract" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
              Contrato:
            </label>
            <select
              id="filter-contract"
              data-testid="filter-select-contract"
              value={filters.contractKey || ''}
              onChange={handleContractChange}
              disabled={isLoading}
              style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                maxWidth: '220px'
              }}
            >
              <option value="">Todos os Contratos</option>
              {contracts.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Ata */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Boxes size={16} color="#64748b" aria-hidden="true" />
            <label htmlFor="filter-ata" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
              Ata (ARP):
            </label>
            <select
              id="filter-ata"
              data-testid="filter-select-ata"
              value={filters.numeroAta || ''}
              onChange={handleAtaChange}
              disabled={isLoading}
              style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                maxWidth: '180px'
              }}
            >
              <option value="">Todas as Atas</option>
              {atas.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Situação Contratual */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Layers size={16} color="#64748b" aria-hidden="true" />
            <label htmlFor="filter-status" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
              Situação:
            </label>
            <select
              id="filter-status"
              data-testid="filter-select-status"
              value={filters.statusContrato || 'TODOS'}
              onChange={handleStatusChange}
              disabled={isLoading}
              style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a'
              }}
            >
              <option value="TODOS">Todas</option>
              <option value="ATIVO">Ativos</option>
              <option value="ENCERRADO">Encerrados</option>
              <option value="EM_PRORROGACAO">Em Prorrogação</option>
            </select>
          </div>

          {/* Botão Limpar Filtros */}
          {hasActiveFilters && (
            <button
              type="button"
              data-testid="filter-btn-reset"
              onClick={onResetFilters}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#b91c1c',
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de Contexto Ativo */}
      {hasActiveFilters && (
        <div
          data-testid="filter-active-context-banner"
          style={{
            marginTop: '1rem',
            padding: '0.6rem 0.85rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.75rem'
          }}
        >
          <span style={{ fontWeight: 700, color: '#334155' }}>
            Contexto Ativo:
          </span>

          {filters.uasg && filters.uasg !== '200331' && (
            <span
              data-testid="chip-filter-uasg"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: '#e0e7ff',
                color: '#3730a3',
                fontWeight: 600
              }}
            >
              <span>UASG: {filters.uasg}</span>
              <button
                type="button"
                aria-label="Remover filtro UASG"
                onClick={() => handleRemoveFilter('uasg')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: '#3730a3' }}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          )}

          {filters.contractKey && (
            <span
              data-testid="chip-filter-contract"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: '#e0f2fe',
                color: '#0369a1',
                fontWeight: 600
              }}
            >
              <span>{activeContractObj?.label || `Contrato: ${filters.contractKey}`}</span>
              <button
                type="button"
                aria-label="Remover filtro Contrato"
                onClick={() => handleRemoveFilter('contractKey')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: '#0369a1' }}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          )}

          {filters.numeroAta && (
            <span
              data-testid="chip-filter-ata"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: '#ede9fe',
                color: '#5b21b6',
                fontWeight: 600
              }}
            >
              <span>{activeAtaObj?.label || `Ata: ${filters.numeroAta}`}</span>
              <button
                type="button"
                aria-label="Remover filtro Ata"
                onClick={() => handleRemoveFilter('numeroAta')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: '#5b21b6' }}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          )}

          {filters.statusContrato && filters.statusContrato !== 'TODOS' && (
            <span
              data-testid="chip-filter-status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: '#fef3c7',
                color: '#92400e',
                fontWeight: 600
              }}
            >
              <span>Situação: {filters.statusContrato}</span>
              <button
                type="button"
                aria-label="Remover filtro Situação"
                onClick={() => handleRemoveFilter('statusContrato')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: '#92400e' }}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
      )}
    </section>
  );
};
