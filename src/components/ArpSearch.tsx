import React, { useEffect, useMemo, useCallback } from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { groupArpsAndItems } from '../utils/ataGrouping';
import { ArpPortfolioHeader } from './atas/ArpPortfolioHeader';
import { ArpPortfolioSummary, type ArpVigenciaFilterOption } from './atas/ArpPortfolioSummary';
import { matchesStatusFilter, comparePrazo } from './carteira/carteiraPrazo';
import { useArpItemContractLinks } from '../hooks/useAtaManagers';
import { getArpPrazo, useAtasPortfolio } from '../hooks/useAtasPortfolio';
import { useAuth } from '../context/AuthContext';
import { canAssignManager } from './carteira/ManagerAssign';
import { ArpPortfolioFilters, ARP_FILTER_SCHEMA } from './atas/ArpPortfolioFilters';
import { useCarteiraFilters } from './carteira/carteiraFilters';
import { canFilterByGestor, listGestores, matchesGestorFilter } from './carteira/carteiraGestor';
import { SkeletonLoader } from '../design-system/components/SkeletonLoader';
import { ArpPortfolioList } from './atas/ArpPortfolioList';
import { ErrorState } from '../design-system/components/ErrorState';
import type { ArpRecord, ArpItemRecord } from '../types';

interface ArpSearchProps {
  onSelectArp: (arp: ArpRecord) => void;
  onSelectItem?: (arp: ArpRecord, item: ArpItemRecord) => void;
  onArpsLoaded?: (arps: ArpRecord[], itemsByAta?: Record<string, ArpItemRecord[]>) => void;
}

export const ArpSearch: React.FC<ArpSearchProps> = ({
  onSelectArp,
  onSelectItem,
  onArpsLoaded
}) => {
  // Dados da carteira (atas no escopo do usuário, itens, gestor, saldo, sincronização).
  const {
    arps,
    scopedArps,
    isLoading,
    scopeLoading,
    itemsByAta,
    itemsLoadingByAta,
    loadItemsForArp,
    loadItemsForArps,
    empenhosDbSet,
    allocationsDbSet,
    gestorByAta,
    saldoStatsByAta,
    syncInfo,
    isSyncing,
    syncProgress,
    syncError,
    triggerSync,
    reload
  } = useAtasPortfolio();

  useEffect(() => {
    if (onArpsLoaded && scopedArps.length > 0) {
      onArpsLoaded(scopedArps, itemsByAta);
    }
  }, [scopedArps, itemsByAta, onArpsLoaded]);

  // Filtros na URL (?situacao=&alocacao=&empenho=&gestor=&busca=): sobrevivem à ida ao detalhe e permitem link já filtrado.
  const { filters: filterState, setFilter: handleFilterChange, resetFilters: handleResetFilters } =
    useCarteiraFilters(ARP_FILTER_SCHEMA);

  const handleSelectStatus = useCallback(
    (status: ArpVigenciaFilterOption) => handleFilterChange('statusVigencia', status),
    [handleFilterChange]
  );

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    let vigentes = 0;
    let criticos = 0;
    let atencao = 0;
    let historico = 0;
    let valorVigenteTotal = 0;
    let valorCritico = 0;
    let valorAtencao = 0;

    for (const arp of scopedArps) {
      const { faixa } = getArpPrazo(arp);
      if (faixa === 'EXPIRADO') {
        historico++;
        continue;
      }
      if (faixa === 'SEM_DATA') continue;
      vigentes++;
      const valor = Number(arp.valorTotal) || 0;
      valorVigenteTotal += valor;
      if (faixa === 'CRITICO') {
        criticos++;
        valorCritico += valor;
      } else if (faixa === 'ATENCAO') {
        atencao++;
        valorAtencao += valor;
      }
    }

    return { total: scopedArps.length, vigentes, criticos, atencao, historico, valorVigenteTotal, valorCritico, valorAtencao };
  }, [scopedArps]);

  const gestoresDisponiveis = useMemo(
    () => listGestores(scopedArps.map((arp) => gestorByAta[arp.numeroAtaRegistroPreco])),
    [scopedArps, gestorByAta]
  );
  // O perfil "gestor" já vê só as próprias atas: sem seletor, e um ?gestor= na URL é ignorado.
  const { role } = useAuth();
  const showGestorFilter = canFilterByGestor(role);

  // Filtragem determinística de Atas
  const filteredArps = useMemo(() => {
    return scopedArps.filter(arp => {
      // 1. Filtro de Vigência
      if (!matchesStatusFilter(getArpPrazo(arp).faixa, filterState.statusVigencia)) return false;

      // 2. Filtro de Alocação
      const cleanAta = (arp.numeroAtaRegistroPreco || '').replace(/^0+/, '');
      const hasAlloc = allocationsDbSet.has(arp.numeroAtaRegistroPreco) || allocationsDbSet.has(cleanAta);
      if (filterState.filtroAlocacao === 'SIM' && !hasAlloc) return false;
      if (filterState.filtroAlocacao === 'NAO' && hasAlloc) return false;

      // 3. Filtro de Empenho
      const hasEmp = empenhosDbSet.has(arp.numeroAtaRegistroPreco) || empenhosDbSet.has(cleanAta);
      if (filterState.filtroEmpenho === 'SIM' && !hasEmp) return false;
      if (filterState.filtroEmpenho === 'NAO' && hasEmp) return false;

      // 4. Filtro de Gestor
      if (showGestorFilter && !matchesGestorFilter(gestorByAta[arp.numeroAtaRegistroPreco], filterState.gestor)) return false;

      // 5. Busca Textual
      if (filterState.busca.trim().length > 0) {
        const query = filterState.busca.trim().toLowerCase();
        const queryDigits = query.replace(/\D/g, '');
        const numAta = (arp.numeroAtaRegistroPreco || '').toLowerCase();
        const objeto = (arp.objeto || '').toLowerCase();
        const ataKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
        const items = itemsByAta[ataKey] || [];

        const matchesQuery =
          numAta.includes(query) ||
          objeto.includes(query) ||
          items.some(item =>
            (item.nomeRazaoSocialFornecedor || '').toLowerCase().includes(query) ||
            (queryDigits.length >= 3 && (item.niFornecedor || '').replace(/\D/g, '').includes(queryDigits)) ||
            (item.descricaoItem || '').toLowerCase().includes(query)
          );

        if (!matchesQuery) return false;
      }

      return true;
    }).sort((a, b) => comparePrazo(getArpPrazo(a).dias, getArpPrazo(b).dias));
  }, [scopedArps, filterState, allocationsDbSet, empenhosDbSet, itemsByAta, showGestorFilter, gestorByAta]);

  // Carregar itens para as atas filtradas
  useEffect(() => {
    if (filteredArps.length > 0) {
      loadItemsForArps(filteredArps.slice(0, 15));
    }
  }, [filteredArps, loadItemsForArps]);

  // Atribuição de gestor na própria carteira (admin e gestor), com propagação
  // Ata ↔ contratos vinculados — ver managerAssignmentService.
  const canAssign = canAssignManager(role);
  const { data: links = [] } = useArpItemContractLinks(canAssign);
  const assignContext = useMemo(() => ({ links }), [links]);


  // Agrupamento de cards
  const groupedCards = useMemo(() => {
    return groupArpsAndItems(filteredArps, itemsByAta);
  }, [filteredArps, itemsByAta]);

  if (syncError && arps.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState
          title="Erro ao carregar Atas de Registro de Preços"
          message={syncError}
          onRetry={() => reload()}
        />
      </PageContainer>
    );
  }

  // Os cards só aparecem com a carteira carregada e o escopo do gestor resolvido: antes disso
  // mostrariam totais zerados ou, para o perfil "gestor", as atas de todos.
  const isBusy = (isLoading && arps.length === 0) || scopeLoading;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ArpPortfolioHeader
        syncInfo={syncInfo}
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        onTriggerSync={role === 'gestor_saldos' ? undefined : triggerSync}
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando atas...">
          <SkeletonLoader variant="card" height="96px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
      <>
      <ArpPortfolioSummary
        totalAtas={summaryMetrics.total}
        vigentes={summaryMetrics.vigentes}
        criticos={summaryMetrics.criticos}
        atencao={summaryMetrics.atencao}
        historico={summaryMetrics.historico}
        valorVigenteTotal={summaryMetrics.valorVigenteTotal}
        valorCritico={summaryMetrics.valorCritico}
        valorAtencao={summaryMetrics.valorAtencao}
        activeStatus={filterState.statusVigencia}
        onSelectStatus={handleSelectStatus}
      />

      <ArpPortfolioFilters
        filters={filterState}
        gestores={gestoresDisponiveis}
        showGestorFilter={showGestorFilter}
        onChangeFilter={handleFilterChange}
        onResetFilters={handleResetFilters}
        totalFiltered={filteredArps.length}
        totalAtas={scopedArps.length}
      />

      <ArpPortfolioList
        canAssign={canAssign}
        assignContext={assignContext}
        cards={groupedCards}
        totalAtas={scopedArps.length}
        isLoading={isLoading}
        itemsLoadingByAta={itemsLoadingByAta}
        saldoStatsByAta={saldoStatsByAta}
        gestorByAta={gestorByAta}
        busca={filterState.busca}
        onExpandAta={loadItemsForArp}
        onSelectArp={onSelectArp}
        onSelectItem={(arp, item) => {
          if (onSelectItem) {
            onSelectItem(arp, item);
          } else {
            onSelectArp(arp);
          }
        }}
        onResetFilters={handleResetFilters}
      />
      </>
      )}
    </PageContainer>
  );
};
