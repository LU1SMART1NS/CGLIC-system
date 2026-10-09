import React, { useEffect, useMemo, useCallback } from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { groupArpsAndItems } from '../utils/ataGrouping';
import { ArpPortfolioHeader } from './atas/ArpPortfolioHeader';
import { ArpPortfolioSummary, type ArpVigenciaFilterOption } from './atas/ArpPortfolioSummary';
import { matchesStatusFilter, comparePrazo } from './carteira/carteiraPrazo';
import { getArpPrazo, useAtasPortfolio } from '../hooks/useAtasPortfolio';
import { useAuth } from '../context/AuthContext';
import { useCarteiraItens } from '../hooks/useCarteiraItens';
import { passaFiltroNivel, type NivelAtendimento } from '../utils/itemAtendimento';
import { TODAS_UNIDADES } from './carteira/CarteiraExecucaoSelects';
import { canAssignManager } from './carteira/ManagerAssign';
import { ArpPortfolioFilters, ARP_FILTER_SCHEMA } from './atas/ArpPortfolioFilters';
import { useCarteiraFilters } from './carteira/carteiraFilters';
import { canFilterByGestor, listGestores, matchesGestorFilter } from './carteira/carteiraGestor';
import { SkeletonLoader } from '../design-system/components/SkeletonLoader';
import { ArpPortfolioList } from './atas/ArpPortfolioList';
import { ErrorState } from '../design-system/components/ErrorState';
import { SincronizacaoFalhaNotice } from './carteira/SincronizacaoFalhaNotice';
import type { ArpRecord, ArpItemRecord } from '../types';
import { chaveGestaoDaArp } from '../utils/ataIdentidade';

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
    gestorByAta,
    saldoStatsByAta,
    syncInfo,
    isSyncing,
    syncProgress,
    syncError,
    situacaoSincronizacao,
    triggerSync,
    reload
  } = useAtasPortfolio();

  // Alocação, empenho e unidades de cada ata, somados dos itens (filtros e colunas da carteira).
  const { resumoPorAta, unidades } = useCarteiraItens({ arps: scopedArps, itemsByAta, gestorByAta });

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

  // Contagens dos segmentos de situação (sobre toda a carteira visível, independentes dos filtros).
  const summaryMetrics = useMemo(() => {
    let vigentes = 0;
    let criticos = 0;
    let atencao = 0;
    let historico = 0;
    for (const arp of scopedArps) {
      const { faixa } = getArpPrazo(arp);
      if (faixa === 'EXPIRADO') historico++;
      else if (faixa !== 'SEM_DATA') {
        vigentes++;
        if (faixa === 'CRITICO') criticos++;
        else if (faixa === 'ATENCAO') atencao++;
      }
    }
    return { total: scopedArps.length, vigentes, criticos, atencao, historico };
  }, [scopedArps]);

  // Quantas atas da situação escolhida cairiam em cada nível de alocação / empenho (contagem no menu do filtro).
  const nivelCounts = useMemo(() => {
    const alocacao: Partial<Record<NivelAtendimento, number>> = {};
    const empenho: Partial<Record<NivelAtendimento, number>> = {};
    for (const arp of scopedArps) {
      if (!matchesStatusFilter(getArpPrazo(arp).faixa, filterState.statusVigencia)) continue;
      const execucao = resumoPorAta.get(`${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`);
      if (execucao?.nivelAlocacao) alocacao[execucao.nivelAlocacao] = (alocacao[execucao.nivelAlocacao] ?? 0) + 1;
      if (execucao?.nivelEmpenho) empenho[execucao.nivelEmpenho] = (empenho[execucao.nivelEmpenho] ?? 0) + 1;
    }
    return { alocacao, empenho };
  }, [scopedArps, resumoPorAta, filterState.statusVigencia]);

  const gestoresDisponiveis = useMemo(
    () => listGestores(scopedArps.map((arp) => gestorByAta[chaveGestaoDaArp(arp)])),
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

      // 2. Alocação interna, empenho e unidade: resumidos dos itens da ata (ver useCarteiraItens).
      const execucao = resumoPorAta.get(`${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`);
      if (!passaFiltroNivel(execucao?.nivelAlocacao ?? null, filterState.filtroAlocacao)) return false;

      // 3. Empenho
      if (!passaFiltroNivel(execucao?.nivelEmpenho ?? null, filterState.filtroEmpenho)) return false;
      if (filterState.unidade !== TODAS_UNIDADES && !execucao?.unidades.has(filterState.unidade)) return false;

      // 4. Filtro de Gestor
      if (showGestorFilter && !matchesGestorFilter(gestorByAta[chaveGestaoDaArp(arp)], filterState.gestor)) return false;

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
  }, [scopedArps, filterState, resumoPorAta, itemsByAta, showGestorFilter, gestorByAta]);

  // Carregar itens para as atas filtradas
  useEffect(() => {
    if (filteredArps.length > 0) {
      loadItemsForArps(filteredArps.slice(0, 15));
    }
  }, [filteredArps, loadItemsForArps]);

  // A atribuição de gestor é só na Central de Distribuição; aqui o coordenador tem o atalho até lá.
  const canAssign = canAssignManager(role);

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
        // A sincronização das atas consulta as APIs do governo: só o coordenador dispara.
        onTriggerSync={role === 'admin' ? triggerSync : undefined}
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando atas...">
          <SkeletonLoader variant="card" height="96px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
      <>
      {situacaoSincronizacao.incompleta && !isSyncing && (
        <SincronizacaoFalhaNotice
          assunto="das atas"
          mensagem={situacaoSincronizacao.mensagemFalha}
          fontesComFalha={situacaoSincronizacao.fontesComFalha}
          falhaEm={situacaoSincronizacao.falhaEm}
          ultimoSucessoEm={situacaoSincronizacao.ultimoSucessoEm}
          onRetry={role === 'admin' ? () => void triggerSync() : undefined}
          isRetrying={isSyncing}
        />
      )}

      <ArpPortfolioSummary
        totalAtas={summaryMetrics.total}
        vigentes={summaryMetrics.vigentes}
        criticos={summaryMetrics.criticos}
        atencao={summaryMetrics.atencao}
        historico={summaryMetrics.historico}
        activeStatus={filterState.statusVigencia}
        onSelectStatus={handleSelectStatus}
      />

      <ArpPortfolioFilters
        filters={filterState}
        gestores={gestoresDisponiveis}
        unidades={unidades}
        alocacaoCounts={nivelCounts.alocacao}
        empenhoCounts={nivelCounts.empenho}
        showGestorFilter={showGestorFilter}
        onChangeFilter={handleFilterChange}
        onResetFilters={handleResetFilters}
        totalFiltered={filteredArps.length}
        totalAtas={scopedArps.length}
      />

      <ArpPortfolioList
        canAssign={canAssign}
        onFilter={handleFilterChange}
        cards={groupedCards}
        totalAtas={scopedArps.length}
        isLoading={isLoading}
        itemsLoadingByAta={itemsLoadingByAta}
        saldoStatsByAta={saldoStatsByAta}
        execucaoPorAta={resumoPorAta}
        unidades={unidades}
        filters={filterState}
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
