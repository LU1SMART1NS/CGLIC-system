import React, { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import { CentralAttentionHeader } from './CentralAttentionHeader';
import { CentralAttentionSummaryCards } from './CentralAttentionSummaryCards';
import { CentralAttentionFiltersBar, type CentralAttentionFiltersState } from './CentralAttentionFiltersBar';
import { CentralAttentionQueue } from './CentralAttentionQueue';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import type { DashboardAttentionSeverity } from '../../types/managementDashboard';

export const CentralPrazosDashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSeverity = (searchParams.get('severity') as DashboardAttentionSeverity) || 'TODAS';

  const [filters, setFilters] = useState<CentralAttentionFiltersState>({
    severidade: ['CRITICA', 'URGENTE', 'ATENCAO', 'INFO'].includes(initialSeverity) ? initialSeverity : 'TODAS',
    origem: 'TODAS',
    busca: ''
  });

  const {
    readModel,
    isLoading,
    isFetching,
    dataUpdatedAt,
    isError,
    error,
    refetch
  } = useManagementDashboard({ uasg: '200331' });

  const allItems = useMemo(() => {
    return readModel?.attention?.items || [];
  }, [readModel]);

  // Contadores globais de severidade para os cards do topo
  const severityCounts = useMemo(() => {
    return {
      critica: allItems.filter((i) => i.severity === 'CRITICA').length,
      urgente: allItems.filter((i) => i.severity === 'URGENTE').length,
      atencao: allItems.filter((i) => i.severity === 'ATENCAO').length,
      info: allItems.filter((i) => i.severity === 'INFO').length
    };
  }, [allItems]);

  // Filtragem determinística em tempo de execução
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // 1. Filtro por Severidade
      if (filters.severidade !== 'TODAS' && item.severity !== filters.severidade) {
        return false;
      }

      // 2. Filtro por Origem
      if (filters.origem !== 'TODAS') {
        if (filters.origem === 'CONTRATO' && !(item.category === 'PRORROGACAO_PROXIMA' || item.contractKey)) return false;
        if (filters.origem === 'PAGAMENTO' && item.category !== 'PAGAMENTO_CRITICO') return false;
        if (filters.origem === 'ATA' && item.category !== 'ATA_CRITICA') return false;
        if (filters.origem === 'REAJUSTE' && item.category !== 'REAJUSTE_RADAR') return false;
        if (filters.origem === 'TAREFA' && !(item.category === 'TAREFA_ATRASADA' || item.category === 'TAREFA_PROXIMA')) return false;
      }

      // 3. Busca textual
      if (filters.busca.trim()) {
        const query = filters.busca.toLowerCase().trim();
        const matchTitle = item.title?.toLowerCase().includes(query);
        const matchDesc = item.description?.toLowerCase().includes(query);
        const matchContract = item.numeroContrato?.toLowerCase().includes(query) || item.contractKey?.toLowerCase().includes(query);
        const matchAta = item.numeroAta?.toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchContract && !matchAta) {
          return false;
        }
      }

      return true;
    });
  }, [allItems, filters]);

  const handleChangeFilter = useCallback(<K extends keyof CentralAttentionFiltersState>(
    key: K,
    value: CentralAttentionFiltersState[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value
    }));

    if (key === 'severidade') {
      if (value === 'TODAS') {
        searchParams.delete('severity');
      } else {
        searchParams.set('severity', value as string);
      }
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSelectSeverity = useCallback((severity: DashboardAttentionSeverity | 'TODAS') => {
    handleChangeFilter('severidade', severity);
  }, [handleChangeFilter]);

  const handleResetFilters = useCallback(() => {
    setFilters({
      severidade: 'TODAS',
      origem: 'TODAS',
      busca: ''
    });
    searchParams.delete('severity');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  if (isError && !readModel) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
        <ErrorState
          title="Erro ao carregar a Central de Atenção"
          message={error?.message || 'Não foi possível consolidar as situações de atenção do sistema.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '1600px',
      margin: '0 auto',
      padding: '1.5rem 2rem 3rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>
      {/* 1. Cabeçalho Limpo */}
      <CentralAttentionHeader
        onRefresh={() => refetch()}
        isRefreshing={isLoading || isFetching}
        lastUpdated={dataUpdatedAt}
      />

      {/* 2. Resumo Superior: 4 Cards de Severidade */}
      <CentralAttentionSummaryCards
        counts={severityCounts}
        activeSeverity={filters.severidade}
        onSelectSeverity={handleSelectSeverity}
      />

      {/* 3. Barra de Filtros Compactos */}
      <CentralAttentionFiltersBar
        filters={filters}
        onChangeFilter={handleChangeFilter}
        onResetFilters={handleResetFilters}
        totalFiltered={filteredItems.length}
        totalItems={allItems.length}
      />

      {/* 4. Fila Operacional de Atenção */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <SkeletonLoader variant="card" height="96px" />
          <SkeletonLoader variant="card" height="96px" />
          <SkeletonLoader variant="card" height="96px" />
          <SkeletonLoader variant="card" height="96px" />
        </div>
      ) : (
        <CentralAttentionQueue
          items={filteredItems}
          totalItems={allItems.length}
          onResetFilters={handleResetFilters}
        />
      )}
    </div>
  );
};
