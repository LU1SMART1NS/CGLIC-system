import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchArpItems } from '../services/api';
import { fetchAtasWithEmpenhosSet, fetchAtasWithAllocationsSet, fetchArpsWithItemsFromDb } from '../services/dbCacheService';
import { runFullSync, checkAndTriggerAutoSync, getLastSyncMetadata } from '../services/syncService';
import { groupArpsAndItems } from '../utils/ataGrouping';
import { ArpPortfolioHeader } from './atas/ArpPortfolioHeader';
import { ArpPortfolioSummary, type ArpVigenciaFilterOption } from './atas/ArpPortfolioSummary';
import { buildAtaSaldoStats } from './atas/ataSaldoStats';
import { classifyPrazo, matchesStatusFilter, comparePrazo } from './carteira/carteiraPrazo';
import { useAllAtaItemSaldos } from '../hooks/useAta';
import { useAllAtaManagers, useArpItemContractLinks } from '../hooks/useAtaManagers';
import { useAuth } from '../context/AuthContext';
import { canAssignManager } from './carteira/ManagerAssign';
import { ArpPortfolioFilters, DEFAULT_ARP_FILTERS, type ArpPortfolioFilterState } from './atas/ArpPortfolioFilters';
import { ArpPortfolioList } from './atas/ArpPortfolioList';
import { ErrorState } from '../design-system/components/ErrorState';
import { getArpVigenciaStatus } from '../services/temporalEngineService';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import type { ArpRecord, ArpItemRecord, FilterParams, SyncMetadata } from '../types';

interface ArpSearchProps {
  onSelectArp: (arp: ArpRecord) => void;
  onSelectItem?: (arp: ArpRecord, item: ArpItemRecord) => void;
  onArpsLoaded?: (arps: ArpRecord[], itemsByAta?: Record<string, ArpItemRecord[]>) => void;
}

/**
 * Faixa de prazo da Ata (mesmas faixas da Visão Geral: crítico ≤30 dias, atenção 31–90).
 * Vigência vem do motor temporal canônico (temporalEngineService.getArpVigenciaStatus);
 * `isCanceladaPncp` continua sendo um critério adicional de encerramento (fonte PNCP).
 */
function getArpPrazo(arp: ArpRecord) {
  const dias = getArpVigenciaStatus(arp.dataVigenciaFinal)?.diasRestantes ?? null;
  const faixa = classifyPrazo(dias, Boolean(arp.isCanceladaPncp));
  return { dias, faixa };
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

  const [filterState, setFilterState] = useState<ArpPortfolioFilterState>(DEFAULT_ARP_FILTERS);

  const [arps, setArps] = useState<ArpRecord[]>([]);

  // Perfil "gestor" tem escopo ASSIGNED em Atas (ata_managers, migration
  // 20260929000038): sem isso, esta tela mostrava TODAS as Atas para
  // qualquer "gestor", independente do que lhe foi atribuído.
  const { ataKeys: assignedAtaKeys } = useAssignedManagementScope();
  const scopedArps = useMemo(() => {
    if (!assignedAtaKeys) return arps;
    const scope = new Set(assignedAtaKeys);
    return arps.filter((a) => scope.has(a.numeroAtaRegistroPreco));
  }, [arps, assignedAtaKeys]);

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
    if (onArpsLoaded && scopedArps.length > 0) {
      onArpsLoaded(scopedArps, itemsByAta);
    }
  }, [scopedArps, itemsByAta, onArpsLoaded]);

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
    setFilterState(DEFAULT_ARP_FILTERS);
  }, []);

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

      // 4. Busca Textual
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
  }, [scopedArps, filterState, allocationsDbSet, empenhosDbSet, itemsByAta]);

  // Carregar itens para as atas filtradas
  useEffect(() => {
    if (filteredArps.length > 0) {
      loadItemsForArps(filteredArps.slice(0, 15));
    }
  }, [filteredArps, loadItemsForArps]);

  // Consumo de saldo por item e gestor por ata (mesmas fontes do detalhe da Ata e da Visão Geral).
  const { data: saldosData } = useAllAtaItemSaldos(params.codigoUnidadeGerenciadora);
  const saldoStatsByAta = useMemo(() => buildAtaSaldoStats(saldosData || []), [saldosData]);
  const { data: ataManagers } = useAllAtaManagers();
  const gestorByAta = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [ataKey, manager] of Object.entries(ataManagers || {})) {
      if (manager?.gestorNome) map[ataKey] = manager.gestorNome;
    }
    return map;
  }, [ataManagers]);

  // Atribuição de gestor na própria carteira (admin e gestor), com propagação
  // Ata ↔ contratos vinculados — ver managerAssignmentService.
  const { role } = useAuth();
  const canAssign = canAssignManager(role);
  const { data: links = [] } = useArpItemContractLinks(canAssign);
  const assignContext = useMemo(() => ({ links }), [links]);


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
        isLoading={loading}
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
    </div>
  );
};
