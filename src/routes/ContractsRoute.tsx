import React, { useState, useMemo, useCallback } from 'react';
import { useContractsDashboard } from '../hooks/useContractsDashboard';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import { useAllContractManagers } from '../hooks/useAllContractManagers';
import { useManagementDashboard } from '../hooks/useManagementDashboard';
import { useArpItemContractLinks } from '../hooks/useAtaManagers';
import { canAssignManager } from '../components/carteira/ManagerAssign';
import { useAuth } from '../context/AuthContext';
import { ContractsPortfolioHeader } from '../components/contracts/portfolio/ContractsPortfolioHeader';
import { ContractsPortfolioSummary } from '../components/contracts/portfolio/ContractsPortfolioSummary';
import {
  ContractsPortfolioFilters,
  DEFAULT_CONTRACTS_FILTERS,
  SEM_GESTOR,
  type ContractsPortfolioFilterState
} from '../components/contracts/portfolio/ContractsPortfolioFilters';
import {
  ContractsPortfolioTable,
  type ContractPortfolioRow
} from '../components/contracts/portfolio/ContractsPortfolioTable';
import { classifyPrazo, comparePrazo, matchesStatusFilter } from '../components/carteira/carteiraPrazo';
import { ErrorState } from '../design-system/components/ErrorState';
import { SkeletonLoader } from '../design-system/components/SkeletonLoader';
import { getContractDaysRemaining } from '../services/dashboardService';
import type { DashboardAttentionItem } from '../types/managementDashboard';

/** UASGs consolidadas nesta tela — mesmo escopo já usado na Visão Geral (/instrumentos), para que os dois painéis reportem os mesmos números de carteira de contratos. */
const UASGS: string[] = ['200330', '200331'];

export const ContractsRoute: React.FC = () => {
  const dash200330 = useContractsDashboard(UASGS[0]);
  const dash200331 = useContractsDashboard(UASGS[1]);

  const allContracts = useMemo(
    () => [...(dash200330.data || []), ...(dash200331.data || [])],
    [dash200330.data, dash200331.data]
  );
  const isLoading = dash200330.isLoading || dash200331.isLoading;
  const isFetching = dash200330.isFetching || dash200331.isFetching;
  const hasAnyData = allContracts.length > 0;
  const error = (dash200330.error || dash200331.error) as Error | null;
  const dataUpdatedAt = Math.max(dash200330.dataUpdatedAt || 0, dash200331.dataUpdatedAt || 0) || undefined;
  const refresh = useCallback(() => {
    dash200330.refresh();
    dash200331.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { role } = useAuth();
  const scope200330 = useAssignedManagementScope(UASGS[0]);
  const scope200331 = useAssignedManagementScope(UASGS[1]);
  const isLoadingManagers = scope200330.isLoading || scope200331.isLoading;
  const assignedContractKeys = useMemo(() => {
    if (!scope200330.contractKeys && !scope200331.contractKeys) return undefined;
    return [...(scope200330.contractKeys || []), ...(scope200331.contractKeys || [])];
  }, [scope200330.contractKeys, scope200331.contractKeys]);

  const contracts = useMemo(() => {
    if (!assignedContractKeys) return allContracts;
    const scopedKeys = new Set(assignedContractKeys);
    return allContracts.filter((contract) => scopedKeys.has(contract.id));
  }, [allContracts, assignedContractKeys]);

  // Gestor (nome) e pendências (Funil Único de Atenção) por contrato — mesmas
  // consultas da Visão Geral (mesmos parâmetros, logo mesmo cache do React Query).
  const managers200330 = useAllContractManagers(UASGS[0]);
  const managers200331 = useAllContractManagers(UASGS[1]);
  const mgmt200330 = useManagementDashboard({
    uasg: UASGS[0],
    assignedContractKeys: scope200330.contractKeys,
    assignedAtaKeys: scope200330.ataKeys
  });
  const mgmt200331 = useManagementDashboard({
    uasg: UASGS[1],
    assignedContractKeys: scope200331.contractKeys,
    assignedAtaKeys: scope200331.ataKeys
  });

  const gestorByContractKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const managers of [managers200330.data, managers200331.data]) {
      for (const [key, manager] of Object.entries(managers || {})) {
        if (manager?.gestorNome) map.set(key, manager.gestorNome);
      }
    }
    return map;
  }, [managers200330.data, managers200331.data]);

  const pendenciasByContractKey = useMemo(() => {
    const map = new Map<string, DashboardAttentionItem[]>();
    for (const mgmt of [mgmt200330, mgmt200331]) {
      for (const item of mgmt.readModel?.attention?.items || []) {
        if (!item.contractKey) continue;
        const list = map.get(item.contractKey) || [];
        list.push(item);
        map.set(item.contractKey, list);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mgmt200330.readModel, mgmt200331.readModel]);

  const [filterState, setFilterState] = useState<ContractsPortfolioFilterState>(DEFAULT_CONTRACTS_FILTERS);

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

  const handleSelectStatus = useCallback((status: ContractsPortfolioFilterState['status']) => {
    setFilterState((prev) => ({ ...prev, status }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilterState(DEFAULT_CONTRACTS_FILTERS);
  }, []);

  // Atribuição de gestor na própria carteira (admin e gestor), com propagação
  // Ata ↔ contratos vinculados — ver managerAssignmentService.
  const canAssign = canAssignManager(role);
  const { data: links = [] } = useArpItemContractLinks(canAssign);
  const contractsByKey = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);
  const assignContext = useMemo(() => ({ links, contractsByKey }), [links, contractsByKey]);


  // Contratos enriquecidos com prazo, gestor e pendências (base única para cards, filtros e tabela).
  const allRows = useMemo<ContractPortfolioRow[]>(() => {
    return contracts.map((contract) => {
      const contractKey = contract.id || `${contract.uasg || '200331'}-${contract.numero}-${contract.ano}`;
      const diasRestantes = getContractDaysRemaining(contract.dataVigenciaFim);
      const faixa = classifyPrazo(diasRestantes, contract.statusVigencia === 'Expirado');
      return {
        contract,
        contractKey,
        diasRestantes,
        faixa,
        gestorNome: gestorByContractKey.get(contractKey),
        pendencias: pendenciasByContractKey.get(contractKey) || []
      };
    });
  }, [contracts, gestorByContractKey, pendenciasByContractKey]);

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

  const gestoresDisponiveis = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.gestorNome).filter((n): n is string => Boolean(n)))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [allRows]
  );

  const filteredRows = useMemo(() => {
    const query = filterState.busca.trim().toLowerCase();
    const queryDigits = query.replace(/\D/g, '');

    return allRows
      .filter(({ contract, faixa, gestorNome, pendencias }) => {
        if (!matchesStatusFilter(faixa, filterState.status)) return false;
        if (filterState.pendencia === 'COM_PENDENCIA' && pendencias.length === 0) return false;
        if (filterState.gestor === SEM_GESTOR && gestorNome) return false;
        if (filterState.gestor !== 'TODOS' && filterState.gestor !== SEM_GESTOR && gestorNome !== filterState.gestor) return false;

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
  }, [allRows, filterState]);


  if (error && !hasAnyData) {
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

  // Os cards só aparecem com todos os dados carregados: evita mostrar totais
  // parciais (ex.: "1 vigente") enquanto a segunda UASG ainda está chegando.
  const isBusy = isLoading || (role === 'gestor' && isLoadingManagers);

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
    </div>
  );
};
