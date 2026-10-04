import React, { useMemo, useCallback } from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { useArpItemContractLinks } from '../hooks/useAtaManagers';
import { useContractsPortfolio } from '../hooks/useContractsPortfolio';
import { canAssignManager } from '../components/carteira/ManagerAssign';
import { useAuth } from '../context/AuthContext';
import { useCarteiraItens } from '../hooks/useCarteiraItens';
import { TODAS_UNIDADES } from '../components/carteira/CarteiraExecucaoSelects';
import { ContractsPartialNotice } from '../components/carteira/ContractsPartialNotice';
import { ContractsPortfolioHeader } from '../components/contracts/portfolio/ContractsPortfolioHeader';
import { ContractsPortfolioSummary } from '../components/contracts/portfolio/ContractsPortfolioSummary';
import {
  ContractsPortfolioFilters,
  CONTRACTS_FILTER_SCHEMA,
  type ContractsPortfolioFilterState
} from '../components/contracts/portfolio/ContractsPortfolioFilters';
import { useCarteiraFilters } from '../components/carteira/carteiraFilters';
import { canFilterByGestor, listGestores, matchesGestorFilter } from '../components/carteira/carteiraGestor';
import { ContractsPortfolioTable } from '../components/contracts/portfolio/ContractsPortfolioTable';
import { comparePrazo, matchesStatusFilter } from '../components/carteira/carteiraPrazo';
import { ErrorState } from '../design-system/components/ErrorState';
import { SkeletonLoader } from '../design-system/components/SkeletonLoader';

export const ContractsRoute: React.FC = () => {
  // Dados da carteira (contratos no escopo do usuário, com prazo, gestor e pendências).
  const {
    rows: allRows,
    contractsByKey,
    hasAnyData,
    isLoading,
    isLoadingScope: isLoadingManagers,
    isFetching,
    isPartial,
    error,
    dataUpdatedAt,
    refresh
  } = useContractsPortfolio();
  const { role } = useAuth();
  // Unidades internas de cada contrato: as que receberam alocação de algum item vinculado a ele.
  const { unidades, unidadesDoContrato } = useCarteiraItens({ apenasUnidadesDeContratos: true });

  // Filtros na URL (?situacao=&pendencia=&gestor=&busca=): sobrevivem à ida ao detalhe e permitem link já filtrado.
  const { filters: filterState, setFilter: handleFilterChange, resetFilters: handleResetFilters } =
    useCarteiraFilters(CONTRACTS_FILTER_SCHEMA);

  const handleSelectStatus = useCallback(
    (status: ContractsPortfolioFilterState['status']) => handleFilterChange('status', status),
    [handleFilterChange]
  );
  // O perfil "gestor" já vê só os próprios contratos: sem seletor, e um ?gestor= na URL é ignorado.
  const showGestorFilter = canFilterByGestor(role);

  // Atribuição de gestor na própria carteira (admin e gestor), com propagação
  // Ata ↔ contratos vinculados — ver managerAssignmentService.
  const canAssign = canAssignManager(role);
  const { data: links = [] } = useArpItemContractLinks(canAssign);
  const assignContext = useMemo(() => ({ links, contractsByKey }), [links, contractsByKey]);

  // Contagens dos segmentos de situação e valor vigente, sobre toda a carteira visível (independentes dos filtros).
  const summaryMetrics = useMemo(() => {
    let vigentes = 0;
    let criticos = 0;
    let atencao = 0;
    let historico = 0;
    let valorVigenteTotal = 0;
    for (const { contract, faixa } of allRows) {
      if (faixa === 'EXPIRADO') historico++;
      else if (faixa !== 'SEM_DATA') {
        vigentes++;
        valorVigenteTotal += contract.valorGlobal || contract.valorInicial || 0;
        if (faixa === 'CRITICO') criticos++;
        else if (faixa === 'ATENCAO') atencao++;
      }
    }
    return { vigentes, criticos, atencao, historico, valorVigenteTotal };
  }, [allRows]);

  const gestoresDisponiveis = useMemo(() => listGestores(allRows.map((r) => r.gestorNome)), [allRows]);

  const filteredRows = useMemo(() => {
    const query = filterState.busca.trim().toLowerCase();
    const queryDigits = query.replace(/\D/g, '');

    return allRows
      .filter(({ contract, contractKey, faixa, gestorNome, pendencias }) => {
        if (!matchesStatusFilter(faixa, filterState.status)) return false;
        if (filterState.pendencia === 'COM_PENDENCIA' && pendencias.length === 0) return false;
        if (filterState.unidade !== TODAS_UNIDADES && !unidadesDoContrato.get(contractKey)?.has(filterState.unidade)) return false;
        if (showGestorFilter && !matchesGestorFilter(gestorNome, filterState.gestor)) return false;

        if (query) {
          const fornCnpj = String(contract.fornecedorCnpjCpf || '').replace(/\D/g, '');
          const matchesQuery =
            String(contract.numero || '').toLowerCase().includes(query) ||
            String(contract.ano || '').toLowerCase().includes(query) ||
            String(contract.numeroFormatado || '').toLowerCase().includes(query) ||
            String(contract.fornecedorNome || '').toLowerCase().includes(query) ||
            (queryDigits.length >= 3 && fornCnpj.includes(queryDigits)) ||
            String(contract.objeto || '').toLowerCase().includes(query);
          if (!matchesQuery) return false;
        }
        return true;
      })
      .sort((a, b) => comparePrazo(a.diasRestantes, b.diasRestantes));
  }, [allRows, filterState, showGestorFilter, unidadesDoContrato]);


  if (error && !hasAnyData) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState
          title="Erro ao carregar carteira de contratos"
          message={error.message || 'Não foi possível buscar a lista de contratos administrativos.'}
          onRetry={() => refresh()}
        />
      </PageContainer>
    );
  }

  // Os cards só aparecem com todos os dados carregados: evita mostrar totais
  // parciais (ex.: "1 vigente") enquanto a segunda UASG ainda está chegando.
  const isBusy = isLoading || (role === 'gestor' && isLoadingManagers);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ContractsPortfolioHeader
        onRefresh={() => refresh()}
        isRefreshing={isFetching}
        lastUpdated={dataUpdatedAt}
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SkeletonLoader variant="card" height="96px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          {isPartial && <ContractsPartialNotice onRetry={() => refresh()} isRetrying={isFetching} />}

          <ContractsPortfolioSummary
            vigentes={summaryMetrics.vigentes}
            criticos={summaryMetrics.criticos}
            atencao={summaryMetrics.atencao}
            historico={summaryMetrics.historico}
            totalContratos={allRows.length}
            valorVigenteTotal={summaryMetrics.valorVigenteTotal}
            activeStatus={filterState.status}
            onSelectStatus={handleSelectStatus}
          />

          <ContractsPortfolioFilters
            filters={filterState}
            gestores={gestoresDisponiveis}
            unidades={unidades}
            comPendencia={allRows.filter((r) => r.pendencias.length > 0 && matchesStatusFilter(r.faixa, filterState.status)).length}
            showGestorFilter={showGestorFilter}
            onChangeFilter={handleFilterChange}
            onResetFilters={handleResetFilters}
            totalFiltered={filteredRows.length}
            totalContracts={allRows.length}
          />

          <ContractsPortfolioTable
            rows={filteredRows}
            totalContracts={allRows.length}
            onResetFilters={handleResetFilters}
            canAssign={canAssign}
            assignContext={assignContext}
            onFilter={handleFilterChange}
          />
        </>
      )}
    </PageContainer>
  );
};
