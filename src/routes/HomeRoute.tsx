import React, { useState, useCallback } from 'react';
import { useManagementDashboard, normalizeDashboardFilters } from '../hooks/useManagementDashboard';
import { HomeHeaderAndFilters } from '../components/home/HomeHeaderAndFilters';
import { HomeExecutiveKPIs } from '../components/home/HomeExecutiveKPIs';
import { HomeAttentionNow } from '../components/home/HomeAttentionNow';
import { HomeDeadlinesPortfolio } from '../components/home/HomeDeadlinesPortfolio';
import { HomePaymentsSummary } from '../components/home/HomePaymentsSummary';
import { HomeArpBalancesSummary } from '../components/home/HomeArpBalancesSummary';
import { ErrorState } from '../design-system/components/ErrorState';
import type { ManagementDashboardFilters } from '../types/managementDashboard';

export const HomeRoute: React.FC = () => {
  const [filters, setFilters] = useState<ManagementDashboardFilters>(() =>
    normalizeDashboardFilters('200331')
  );

  const {
    readModel,
    isLoading,
    isFetching,
    dataUpdatedAt,
    isError,
    error,
    refetch
  } = useManagementDashboard(filters);

  const handleFilterChange = useCallback((newFilters: Partial<ManagementDashboardFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters
    }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters({
      uasg: '200331',
      contractKey: undefined,
      numeroAta: undefined,
      statusContrato: undefined
    });
  }, []);

  if (isError && !readModel) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
        <ErrorState
          title="Erro ao carregar dados da Visão Geral"
          message={error?.message || 'Não foi possível carregar as informações do painel gerencial.'}
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
      {/* 1. Cabeçalho Limpo & Contexto / Filtros Compactos */}
      <HomeHeaderAndFilters
        filters={filters}
        availableFilters={readModel?.availableFilters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        onRefresh={() => refetch()}
        isRefreshing={isLoading || isFetching}
        lastUpdated={dataUpdatedAt}
      />

      {/* 2. KPIs Executivos */}
      <HomeExecutiveKPIs
        executive={readModel?.executive}
        financial={readModel?.financial}
        loading={isLoading}
      />

      {/* 3. Centro da Home: Atenção Agora (Funil Único de Atenção) */}
      <HomeAttentionNow
        attention={readModel?.attention}
        loading={isLoading}
        maxItems={5}
      />

      {/* 4. Carteira & Prazos */}
      <HomeDeadlinesPortfolio
        deadlines={readModel?.deadlines}
        attention={readModel?.attention}
        loading={isLoading}
      />

      {/* 5. Pagamentos */}
      <HomePaymentsSummary
        payments={readModel?.payments}
        loading={isLoading}
      />

      {/* 6. Atas & Saldos */}
      <HomeArpBalancesSummary
        arp={readModel?.arp}
        loading={isLoading}
      />
    </div>
  );
};
