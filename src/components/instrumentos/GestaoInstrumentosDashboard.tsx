import React, { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import { GestaoInstrumentosHeader } from './GestaoInstrumentosHeader';
import { GestaoInstrumentosSummaryCards } from './GestaoInstrumentosSummaryCards';
import { CentralAttentionFiltersBar, type CentralAttentionFiltersState } from '../prazos/CentralAttentionFiltersBar';
import { CentralAttentionQueue } from '../prazos/CentralAttentionQueue';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import type { DashboardAttentionCategory, DashboardAttentionSeverity } from '../../types/managementDashboard';

/**
 * Painel Unificado de Gestão e Monitoramento — Lei 14.133.
 *
 * Consolida a antiga "Visão Geral" (/) e "Central de Atenção" (/prazos) numa única
 * camada de apresentação sobre o mesmo Read Model do `useManagementDashboard`
 * (Funil Único de Atenção). Nenhuma nova query, RPC ou regra de negócio é criada aqui.
 */
export const GestaoInstrumentosDashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSeverity = (searchParams.get('severity') as DashboardAttentionSeverity) || 'TODAS';
  const initialCategory = (searchParams.get('categoria') as DashboardAttentionCategory) || null;

  const [filters, setFilters] = useState<CentralAttentionFiltersState>({
    severidade: ['CRITICA', 'URGENTE', 'ATENCAO', 'INFO'].includes(initialSeverity) ? initialSeverity : 'TODAS',
    origem: 'TODAS',
    busca: ''
  });

  const [quickCategory, setQuickCategory] = useState<DashboardAttentionCategory | null>(
    ['TAREFA_ATRASADA', 'TAREFA_PROXIMA', 'PAGAMENTO_CRITICO', 'REAJUSTE_RADAR', 'ATA_CRITICA', 'PRORROGACAO_PROXIMA'].includes(
      initialCategory as string
    )
      ? initialCategory
      : null
  );

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

  // Contadores reais dos 4 cards superiores (KPIs executivos + saldo físico de ARP)
  const summaryCounts = useMemo(() => {
    const vigenciaCriticaCount = allItems.filter((item) => item.category === 'PRORROGACAO_PROXIMA').length;
    return {
      contratosAtivos: readModel?.executive?.contratosAtivos ?? 0,
      totalContratos: readModel?.executive?.totalContratos ?? 0,
      valorVigenteTotal: readModel?.executive?.valorVigenteTotal ?? 0,
      taxaPagamentoPercentual: readModel?.financial?.taxaPagamentoPercentual ?? 0,
      vigenciaCriticaCount,
      saldoCriticoCount: readModel?.attention?.atasCriticasCount ?? 0
    };
  }, [readModel, allItems]);

  const handleSelectCategory = useCallback((category: DashboardAttentionCategory | null) => {
    setQuickCategory(category);
    if (category) {
      searchParams.set('categoria', category);
    } else {
      searchParams.delete('categoria');
    }
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Filtragem determinística: 1) atalho dos cards superiores, 2) filtros operacionais da fila
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (quickCategory && item.category !== quickCategory) {
        return false;
      }

      if (filters.severidade !== 'TODAS' && item.severity !== filters.severidade) {
        return false;
      }

      if (filters.origem !== 'TODAS') {
        if (filters.origem === 'CONTRATO' && !(item.category === 'PRORROGACAO_PROXIMA' || item.contractKey)) return false;
        if (filters.origem === 'PAGAMENTO' && item.category !== 'PAGAMENTO_CRITICO') return false;
        if (filters.origem === 'ATA' && item.category !== 'ATA_CRITICA') return false;
        if (filters.origem === 'REAJUSTE' && item.category !== 'REAJUSTE_RADAR') return false;
        if (filters.origem === 'TAREFA' && !(item.category === 'TAREFA_ATRASADA' || item.category === 'TAREFA_PROXIMA')) return false;
      }

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
  }, [allItems, filters, quickCategory]);

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

  const handleResetFilters = useCallback(() => {
    setFilters({
      severidade: 'TODAS',
      origem: 'TODAS',
      busca: ''
    });
    setQuickCategory(null);
    searchParams.delete('severity');
    searchParams.delete('categoria');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  if (isError && !readModel) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
        <ErrorState
          title="Erro ao carregar a Gestão de Instrumentos"
          message={error?.message || 'Não foi possível consolidar a carteira de ARPs e contratos.'}
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
      {/* 1. Cabeçalho Consolidado */}
      <GestaoInstrumentosHeader
        uasg={readModel?.uasg}
        onRefresh={() => refetch()}
        isRefreshing={isLoading || isFetching}
        lastUpdated={dataUpdatedAt}
      />

      {/* 2. Cards de Visão Geral (KPIs & Alertas) — atalhos que filtram a fila abaixo */}
      <GestaoInstrumentosSummaryCards
        counts={summaryCounts}
        activeCategory={quickCategory}
        onSelectCategory={handleSelectCategory}
      />

      {/* 3. Filtros e Busca */}
      <CentralAttentionFiltersBar
        filters={filters}
        onChangeFilter={handleChangeFilter}
        onResetFilters={handleResetFilters}
        totalFiltered={filteredItems.length}
        totalItems={allItems.length}
      />

      {/* 4. Fila Operacional Única de Ações Imediatas */}
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
