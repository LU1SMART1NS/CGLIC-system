import React, { useMemo, useCallback } from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { useArpItemContractLinks } from '../hooks/useAtaManagers';
import { useContractsPortfolio } from '../hooks/useContractsPortfolio';
import { canAssignManager } from '../components/carteira/ManagerAssign';
import { useAuth } from '../context/AuthContext';
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
    error,
    dataUpdatedAt,
    refresh
  } = useContractsPortfolio();
  const { role } = useAuth();

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

  // KPIs dos cards, sobre toda a carteira visível ao usuário (independentes dos filtros).
  const summaryMetrics = useMemo(() => {
    let vigentes = 0;
    let criticos = 0;
    let atencao = 0;
    let historico = 0;
    let valorVigenteTotal = 0;
    let valorCritico = 0;
    let valorAtencao = 0;
    for (const { contract, faixa } of allRows) {
      if (faixa === 'EXPIRADO') {
        historico++;
        continue;
      }
      if (faixa === 'SEM_DATA') continue;
      vigentes++;
      const valor = contract.valorGlobal || contract.valorInicial || 0;
      valorVigenteTotal += valor;
      if (faixa === 'CRITICO') {
        criticos++;
        valorCritico += valor;
      } else if (faixa === 'ATENCAO') {
        atencao++;
        valorAtencao += valor;
      }
    }
    return { vigentes, criticos, atencao, historico, valorVigenteTotal, valorCritico, valorAtencao };
  }, [allRows]);

  const gestoresDisponiveis = useMemo(() => listGestores(allRows.map((r) => r.gestorNome)), [allRows]);

  const filteredRows = useMemo(() => {
    const query = filterState.busca.trim().toLowerCase();
    const queryDigits = query.replace(/\D/g, '');

    return allRows
      .filter(({ contract, faixa, gestorNome, pendencias }) => {
        if (!matchesStatusFilter(faixa, filterState.status)) return false;
        if (filterState.pendencia === 'COM_PENDENCIA' && pendencias.length === 0) return false;
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
  }, [allRows, filterState, showGestorFilter]);


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
          <ContractsPortfolioSummary
            vigentes={summaryMetrics.vigentes}
            criticos={summaryMetrics.criticos}
            atencao={summaryMetrics.atencao}
            historico={summaryMetrics.historico}
            totalContratos={allRows.length}
            valorVigenteTotal={summaryMetrics.valorVigenteTotal}
            valorCritico={summaryMetrics.valorCritico}
            valorAtencao={summaryMetrics.valorAtencao}
            activeStatus={filterState.status}
            onSelectStatus={handleSelectStatus}
          />

          <ContractsPortfolioFilters
            filters={filterState}
            gestores={gestoresDisponiveis}
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
          />
        </>
      )}
    </PageContainer>
  );
};
