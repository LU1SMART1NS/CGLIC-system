import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchArpItems } from '../services/api';
import { fetchAtasWithEmpenhosSet, fetchAtasWithAllocationsSet, fetchArpsWithItemsFromDb } from '../services/dbCacheService';
import { runFullSync, checkAndTriggerAutoSync, getLastSyncMetadata } from '../services/syncService';
import { groupArpsAndItems } from '../utils/ataGrouping';
import { ArpPortfolioHeader } from './atas/ArpPortfolioHeader';
import { ArpPortfolioSummary, type ArpVigenciaFilterOption } from './atas/ArpPortfolioSummary';
import { ArpPortfolioFilters, type ArpPortfolioFilterState } from './atas/ArpPortfolioFilters';
import { ArpPortfolioList } from './atas/ArpPortfolioList';
import { ErrorState } from '../design-system/components/ErrorState';
import type { ArpRecord, ArpItemRecord, FilterParams, SyncMetadata } from '../types';

interface ArpSearchProps {
  onSelectArp: (arp: ArpRecord) => void;
  onSelectItem?: (arp: ArpRecord, item: ArpItemRecord) => void;
  onArpsLoaded?: (arps: ArpRecord[], itemsByAta?: Record<string, ArpItemRecord[]>) => void;
}

function checkArpExpiration(arp: ArpRecord) {
  const today = new Date();
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(today.getDate() + 90);

  const vigenciaFinalDate = arp.dataVigenciaFinal ? new Date(arp.dataVigenciaFinal) : undefined;
  const isExpired = Boolean(arp.isCanceladaPncp || (vigenciaFinalDate && vigenciaFinalDate < today));
  const isExpiringSoon = !isExpired && Boolean(vigenciaFinalDate && vigenciaFinalDate <= ninetyDaysFromNow);

  return { isExpired, isExpiringSoon };
}

export const ArpSearch: React.FC<ArpSearchProps> = ({
  onSelectArp,
  onSelectItem,
  onArpsLoaded
}) => {
  const [params] = useState<FilterParams>({
    dataVigenciaInicialMin: '2024-01-01',
    dataVigenciaInicialMax: '2028-08-21',
    codigoUnidadeGerenciadora: '200331',
    numeroAtaRegistroPreco: ''
  });

  const [filterState, setFilterState] = useState<ArpPortfolioFilterState>({
    statusVigencia: 'TODAS',
    filtroAlocacao: 'TODAS',
    filtroEmpenho: 'TODAS',
    busca: ''
  });

  const [arps, setArps] = useState<ArpRecord[]>([]);
  const [itemsByAta, setItemsByAta] = useState<Record<string, ArpItemRecord[]>>({});
  const [itemsLoadingByAta, setItemsLoadingByAta] = useState<Record<string, boolean>>({});
  const [empenhosDbSet, setEmpenhosDbSet] = useState<Set<string>>(new Set());
  const [allocationsDbSet, setAllocationsDbSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync state
  const [syncInfo, setSyncInfo] = useState<SyncMetadata>(getLastSyncMetadata());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ step: string; percent: number; current?: number; total?: number } | null>(null);

  useEffect(() => {
    if (onArpsLoaded && arps.length > 0) {
      onArpsLoaded(arps, itemsByAta);
    }
  }, [arps, itemsByAta, onArpsLoaded]);

  const loadDbSets = async () => {
    try {
      const [empSet, allocSet] = await Promise.all([
        fetchAtasWithEmpenhosSet(),
        fetchAtasWithAllocationsSet()
      ]);
      setEmpenhosDbSet(empSet);
      setAllocationsDbSet(allocSet);
    } catch (e) {
      console.warn('Erro ao carregar conjuntos do DB', e);
    }
  };

  const loadFromDatabase = useCallback(async (uasgToLoad?: string): Promise<boolean> => {
    const targetUasg = uasgToLoad || params.codigoUnidadeGerenciadora || '200331';
    setLoading(true);
    setError(null);

    try {
      const dbResult = await fetchArpsWithItemsFromDb(targetUasg);
      if (dbResult.arps && dbResult.arps.length > 0) {
        setArps(dbResult.arps);
        setItemsByAta(dbResult.itemsByAta || {});
        setSyncInfo(dbResult.syncInfo);
        setLoading(false);
        return true;
      }
    } catch (e) {
      console.warn('Erro ao consultar banco local:', e);
    }
    setLoading(false);
    return false;
  }, [params.codigoUnidadeGerenciadora]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncProgress({ step: 'Iniciando sincronização...', percent: 5 });

    try {
      const result = await runFullSync(params, (p) => setSyncProgress(p));
      if (result.success) {
        if (result.arps && result.arps.length > 0) {
          setArps(result.arps);
          setItemsByAta(result.itemsByAta || {});
        }
        setSyncInfo(getLastSyncMetadata());
        await loadDbSets();
      } else {
        setError(result.error || 'Erro durante sincronização');
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao sincronizar com APIs governamentais');
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function init() {
      await loadDbSets();
      const hasCached = await loadFromDatabase();
      if (!hasCached && isMounted) {
        checkAndTriggerAutoSync(params.codigoUnidadeGerenciadora || '200331', () => {
          if (isMounted) loadFromDatabase();
        });
      }
    }

    init();
    return () => {
      isMounted = false;
    };
  }, [loadFromDatabase, params]);

  // Carrega itens sob demanda
  const loadItemsForArp = useCallback(async (arp: ArpRecord) => {
    const ataKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
    if (itemsByAta[ataKey] || itemsLoadingByAta[ataKey]) {
      return;
    }

    setItemsLoadingByAta(prev => ({ ...prev, [ataKey]: true }));
    try {
      const data = await fetchArpItems(
        arp.dataVigenciaInicial,
        arp.codigoUnidadeGerenciadora,
        arp.numeroAtaRegistroPreco,
        arp
      );
      if (data && data.resultado) {
        setItemsByAta(prev => ({ ...prev, [ataKey]: data.resultado }));
      }
    } catch (err) {
      console.warn(`Erro ao carregar itens da Ata ${arp.numeroAtaRegistroPreco}:`, err);
    } finally {
      setItemsLoadingByAta(prev => ({ ...prev, [ataKey]: false }));
    }
  }, [itemsByAta, itemsLoadingByAta]);

  const loadItemsForArps = useCallback((arpsToLoad: ArpRecord[]) => {
    arpsToLoad.forEach(arp => {
      const ataKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
      if (!itemsByAta[ataKey] && !itemsLoadingByAta[ataKey]) {
        loadItemsForArp(arp);
      }
    });
  }, [itemsByAta, itemsLoadingByAta, loadItemsForArp]);

  const handleFilterChange = useCallback(
    <K extends keyof ArpPortfolioFilterState>(key: K, value: ArpPortfolioFilterState[K]) => {
      setFilterState(prev => ({
        ...prev,
        [key]: value
      }));
    },
    []
  );

  const handleSelectStatus = useCallback((status: ArpVigenciaFilterOption) => {
    setFilterState(prev => ({
      ...prev,
      statusVigencia: status
    }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilterState({
      statusVigencia: 'TODAS',
      filtroAlocacao: 'TODAS',
      filtroEmpenho: 'TODAS',
      busca: ''
    });
  }, []);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    let total = 0;
    let vigentes = 0;
    let aVencer90d = 0;
    let expiradas = 0;

    for (const arp of arps) {
      total++;
      const { isExpired, isExpiringSoon } = checkArpExpiration(arp);
      if (isExpired) {
        expiradas++;
      } else if (isExpiringSoon) {
        aVencer90d++;
        vigentes++; // Próximas do vencimento ainda são vigentes
      } else {
        vigentes++;
      }
    }

    return {
      total,
      vigentes,
      aVencer90d,
      expiradas
    };
  }, [arps]);

  // Filtragem determinística de Atas
  const filteredArps = useMemo(() => {
    return arps.filter(arp => {
      const { isExpired, isExpiringSoon } = checkArpExpiration(arp);

      // 1. Filtro de Vigência
      if (filterState.statusVigencia === 'VIGENTE' && isExpired) return false;
      if (filterState.statusVigencia === 'A_VENCER_90D' && !isExpiringSoon) return false;
      if (filterState.statusVigencia === 'EXPIRADA' && !isExpired) return false;

      // 2. Filtro de Alocação
      const cleanAta = (arp.numeroAtaRegistroPreco || '').replace(/^0+/, '');
      const hasAlloc = allocationsDbSet.has(arp.numeroAtaRegistroPreco) || allocationsDbSet.has(cleanAta);
      if (filterState.filtroAlocacao === 'SIM' && !hasAlloc) return false;
      if (filterState.filtroAlocacao === 'NAO' && hasAlloc) return false;

      // 3. Filtro de Empenho
      const hasEmp = empenhosDbSet.has(arp.numeroAtaRegistroPreco) || empenhosDbSet.has(cleanAta);
      if (filterState.filtroEmpenho === 'SIM' && !hasEmp) return false;
      if (filterState.filtroEmpenho === 'NAO' && hasEmp) return false;

      // 4. Busca Textual
      if (filterState.busca.trim().length > 0) {
        const query = filterState.busca.trim().toLowerCase();
        const numAta = (arp.numeroAtaRegistroPreco || '').toLowerCase();
        const objeto = (arp.objeto || '').toLowerCase();
        const ataKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
        const items = itemsByAta[ataKey] || [];

        const matchesQuery =
          numAta.includes(query) ||
          objeto.includes(query) ||
          items.some(item =>
            (item.nomeRazaoSocialFornecedor || '').toLowerCase().includes(query) ||
            (item.niFornecedor || '').includes(query.replace(/\D/g, '')) ||
            (item.descricaoItem || '').toLowerCase().includes(query)
          );

        if (!matchesQuery) return false;
      }

      return true;
    }).sort((a, b) => {
      // Ordenação decrescente: ano/número
      const partsA = a.numeroAtaRegistroPreco.split('/');
      const partsB = b.numeroAtaRegistroPreco.split('/');
      if (partsA.length === 2 && partsB.length === 2) {
        const numA = parseInt(partsA[0], 10);
        const yearA = parseInt(partsA[1], 10);
        const numB = parseInt(partsB[0], 10);
        const yearB = parseInt(partsB[1], 10);
        if (yearA !== yearB) return yearB - yearA;
        return numB - numA;
      }
      return b.numeroAtaRegistroPreco.localeCompare(a.numeroAtaRegistroPreco);
    });
  }, [arps, filterState, allocationsDbSet, empenhosDbSet, itemsByAta]);

  // Carregar itens para as atas filtradas
  useEffect(() => {
    if (filteredArps.length > 0) {
      loadItemsForArps(filteredArps.slice(0, 15));
    }
  }, [filteredArps, loadItemsForArps]);

  // Agrupamento de cards
  const groupedCards = useMemo(() => {
    return groupArpsAndItems(filteredArps, itemsByAta);
  }, [filteredArps, itemsByAta]);

  if (error && arps.length === 0) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
        <ErrorState
          title="Erro ao carregar Atas de Registro de Preços"
          message={error}
          onRetry={() => loadFromDatabase()}
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
      <ArpPortfolioHeader
        syncInfo={syncInfo}
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        onTriggerSync={handleTriggerSync}
      />

      <ArpPortfolioSummary
        totalAtas={summaryMetrics.total}
        vigentes={summaryMetrics.vigentes}
        aVencer90d={summaryMetrics.aVencer90d}
        expiradas={summaryMetrics.expiradas}
        activeStatus={filterState.statusVigencia}
        onSelectStatus={handleSelectStatus}
      />

      <ArpPortfolioFilters
        filters={filterState}
        onChangeFilter={handleFilterChange}
        onResetFilters={handleResetFilters}
        totalFiltered={filteredArps.length}
        totalAtas={arps.length}
      />

      <ArpPortfolioList
        cards={groupedCards}
        totalAtas={arps.length}
        isLoading={loading}
        itemsLoadingByAta={itemsLoadingByAta}
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
    </div>
  );
};
