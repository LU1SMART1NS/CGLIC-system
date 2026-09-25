import React, { useState, useMemo, useCallback } from 'react';
import { useContractsDashboard } from '../hooks/useContractsDashboard';
import { ContractsPortfolioHeader } from '../components/contracts/portfolio/ContractsPortfolioHeader';
import {
  ContractsPortfolioSummary,
  type ContractStatusFilterOption
} from '../components/contracts/portfolio/ContractsPortfolioSummary';
import {
  ContractsPortfolioFilters,
  type ContractsPortfolioFilterState
} from '../components/contracts/portfolio/ContractsPortfolioFilters';
import { ContractsPortfolioTable } from '../components/contracts/portfolio/ContractsPortfolioTable';
import { ErrorState } from '../design-system/components/ErrorState';
import { SkeletonLoader } from '../design-system/components/SkeletonLoader';
import { getContractDaysRemaining } from '../services/dashboardService';

export const ContractsRoute: React.FC = () => {
  const {
    data: contracts = [],
    isLoading,
    isFetching,
    error,
    refresh,
    dataUpdatedAt
  } = useContractsDashboard('200331');

  const [filterState, setFilterState] = useState<ContractsPortfolioFilterState>({
    status: 'TODOS',
    tipoInstrumento: 'TODOS',
    busca: ''
  });

  const handleFilterChange = useCallback(
    <K extends keyof ContractsPortfolioFilterState>(
      key: K,
      value: ContractsPortfolioFilterState[K]
    ) => {
      setFilterState((prev) => ({
        ...prev,
        [key]: value
      }));
    },
    []
  );

  const handleSelectStatus = useCallback((status: ContractStatusFilterOption) => {
    setFilterState((prev) => ({
      ...prev,
      status
    }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilterState({
      status: 'TODOS',
      tipoInstrumento: 'TODOS',
      busca: ''
    });
  }, []);

  // KPIs de Resumo calculados sobre todos os contratos carregados
  const summaryMetrics = useMemo(() => {
    let total = 0;
    let vigentes = 0;
    let aVencer60d = 0;
    let expirados = 0;

    for (const contract of contracts) {
      total++;
      const diasRestantes = getContractDaysRemaining(contract.dataVigenciaFim);
      const isVig = contract.statusVigencia === 'Vigente';
      const isExp = contract.statusVigencia === 'Expirado' || (diasRestantes !== null && diasRestantes < 0);
      const isAv60 = contract.statusVigencia === 'A Vencer (60d)' || (diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 60);

      if (isExp) {
        expirados++;
      } else if (isAv60) {
        aVencer60d++;
        vigentes++; // Contratos a vencer ainda são vigentes na carteira
      } else if (isVig) {
        vigentes++;
      } else {
        // Fallback baseado em dias restantes
        if (diasRestantes !== null && diasRestantes >= 0) {
          vigentes++;
        } else if (diasRestantes !== null && diasRestantes < 0) {
          expirados++;
        }
      }
    }

    return {
      total,
      vigentes,
      aVencer60d,
      expirados
    };
  }, [contracts]);

  // Contratos filtrados
  const filteredContracts = useMemo(() => {
    return contracts.filter((contract) => {
      const diasRestantes = getContractDaysRemaining(contract.dataVigenciaFim);
      const isExp = contract.statusVigencia === 'Expirado' || (diasRestantes !== null && diasRestantes < 0);
      const isAv60 = contract.statusVigencia === 'A Vencer (60d)' || (diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 60);
      const isVig = (contract.statusVigencia === 'Vigente' || isAv60) && !isExp;

      // 1. Filtro por Situação
      if (filterState.status === 'VIGENTE' && !isVig) {
        return false;
      }
      if (filterState.status === 'A_VENCER_60D' && !isAv60) {
        return false;
      }
      if (filterState.status === 'EXPIRADO' && !isExp) {
        return false;
      }

      // 2. Filtro por Tipo de Instrumento
      if (filterState.tipoInstrumento !== 'TODOS') {
        const tipoInstNorm = (contract.tipoInstrumento || '').toUpperCase();
        if (filterState.tipoInstrumento === 'CONTRATO') {
          if (tipoInstNorm.includes('TERMO ADITIVO') || tipoInstNorm.includes('APOSTILAMENTO') || tipoInstNorm.includes('CARTA')) {
            return false;
          }
        } else if (filterState.tipoInstrumento === 'TERMO_ADITIVO') {
          if (!tipoInstNorm.includes('TERMO ADITIVO') && !tipoInstNorm.includes('ADITIVO')) {
            return false;
          }
        } else if (filterState.tipoInstrumento === 'APOSTILAMENTO') {
          if (!tipoInstNorm.includes('APOSTILAMENTO')) {
            return false;
          }
        } else if (filterState.tipoInstrumento === 'CARTA_CONTRATO') {
          if (!tipoInstNorm.includes('CARTA')) {
            return false;
          }
        }
      }

      // 3. Filtro por Busca Textual
      if (filterState.busca.trim().length > 0) {
        const query = filterState.busca.trim().toLowerCase();
        const num = String(contract.numero || '').toLowerCase();
        const ano = String(contract.ano || '').toLowerCase();
        const numFormatado = String(contract.numeroFormatado || '').toLowerCase();
        const fornNome = String(contract.fornecedorNome || '').toLowerCase();
        const fornCnpj = String(contract.fornecedorCnpjCpf || '').toLowerCase().replace(/\D/g, '');
        const queryDigits = query.replace(/\D/g, '');
        const objeto = String(contract.objeto || '').toLowerCase();

        const matchesQuery =
          num.includes(query) ||
          ano.includes(query) ||
          numFormatado.includes(query) ||
          fornNome.includes(query) ||
          (queryDigits.length >= 3 && fornCnpj.includes(queryDigits)) ||
          objeto.includes(query);

        if (!matchesQuery) {
          return false;
        }
      }

      return true;
    });
  }, [contracts, filterState]);

  if (error && contracts.length === 0) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
        <ErrorState
          title="Erro ao carregar carteira de contratos"
          message={error.message || 'Não foi possível buscar a lista de contratos administrativos.'}
          onRetry={() => refresh()}
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
      <ContractsPortfolioHeader
        onRefresh={() => refresh()}
        isRefreshing={isFetching}
        lastUpdated={dataUpdatedAt}
      />

      {isLoading && contracts.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SkeletonLoader variant="card" height="90px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <ContractsPortfolioSummary
            total={summaryMetrics.total}
            vigentes={summaryMetrics.vigentes}
            aVencer60d={summaryMetrics.aVencer60d}
            expirados={summaryMetrics.expirados}
            activeStatus={filterState.status}
            onSelectStatus={handleSelectStatus}
          />

          <ContractsPortfolioFilters
            filters={filterState}
            onChangeFilter={handleFilterChange}
            onResetFilters={handleResetFilters}
            totalFiltered={filteredContracts.length}
            totalContracts={contracts.length}
          />

          <ContractsPortfolioTable
            contracts={filteredContracts}
            totalContracts={contracts.length}
            onResetFilters={handleResetFilters}
          />
        </>
      )}
    </div>
  );
};
