import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchArpItems } from '../services/api';
import { fetchAtasWithAllocationsSet, fetchAtasWithEmpenhosSet } from '../services/dbCacheService';
import { runFullSync, checkAndTriggerAutoSync, getLastSyncMetadata } from '../services/syncService';
import { getArpVigenciaStatus } from '../services/temporalEngineService';
import { classifyPrazo } from '../components/carteira/carteiraPrazo';
import { buildAtaSaldoStats } from '../components/atas/ataSaldoStats';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { buildAtaKey, getAtaSourceQueryOptions, useAllAtaItemSaldos } from './useAta';
import { useAllAtaManagers } from './useAtaManagers';
import { useAssignedManagementScope } from './useAssignedManagementScope';
import type { ArpRecord, ArpItemRecord, FilterParams, SyncMetadata } from '../types';

/** Janela de vigência consultada na sincronização com Compras.gov.br / PNCP. */
const SYNC_PARAMS: FilterParams = {
  dataVigenciaInicialMin: '2024-01-01',
  dataVigenciaInicialMax: '2028-08-21',
  codigoUnidadeGerenciadora: UASGS_CGLIC[1],
  numeroAtaRegistroPreco: ''
};

const EMPENHOS_SET_KEY = ['atas-with-empenhos-set'] as const;
const ALLOCATIONS_SET_KEY = ['atas-with-allocations-set'] as const;

export type SyncProgress = { step: string; percent: number; current?: number; total?: number };

/**
 * Faixa de prazo da Ata (mesmas faixas da Visão Geral: crítico ≤30 dias, atenção 31–90).
 * Vigência vem do motor temporal canônico (temporalEngineService.getArpVigenciaStatus);
 * `isCanceladaPncp` continua sendo um critério adicional de encerramento (fonte PNCP).
 */
export function getArpPrazo(arp: ArpRecord) {
  const dias = getArpVigenciaStatus(arp.dataVigenciaFinal)?.diasRestantes ?? null;
  const faixa = classifyPrazo(dias, Boolean(arp.isCanceladaPncp));
  return { dias, faixa };
}

/**
 * Carteira de Atas das UASGs da CGLIC, no escopo do usuário: atas e itens (mesmo cache da Ata 360),
 * gestor e consumo de saldo por ata, atas com empenho/alocação e a sincronização com as fontes oficiais.
 * Fonte única para a Carteira de Atas e para quem precisar dos mesmos números.
 */
export function useAtasPortfolio() {
  const queryClient = useQueryClient();

  // Uma query por UASG; falha de uma não derruba a outra.
  const sources = useQueries({ queries: UASGS_CGLIC.map((uasg) => getAtaSourceQueryOptions(uasg)) });
  const isLoading = sources.some((q) => q.isPending);
  const loadedSources = sources.map((q) => q.data).filter((d) => d && d.arps.length > 0);
  const sourcesSignature = sources.map((q) => q.dataUpdatedAt).join('|');

  const arps = useMemo<ArpRecord[]>(
    () => loadedSources.flatMap((d) => d!.arps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourcesSignature]
  );
  const dbItemsByAta = useMemo<Record<string, ArpItemRecord[]>>(
    () => Object.assign({}, ...loadedSources.map((d) => d!.itemsByAta || {})),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourcesSignature]
  );

  // Perfil "gestor" tem escopo ASSIGNED em Atas (ata_managers, migration 20260929000038).
  // O escopo é resolvido por UASG (como na Carteira de Contratos), senão as Atas herdadas
  // pelos contratos atribuídos nunca eram derivadas.
  const scope200330 = useAssignedManagementScope(UASGS_CGLIC[0]);
  const scope200331 = useAssignedManagementScope(UASGS_CGLIC[1]);
  const scopeLoading = scope200330.isLoading || scope200331.isLoading;
  const scopedArps = useMemo(() => {
    const scopeByUasg: Record<string, string[] | undefined> = {
      [UASGS_CGLIC[0]]: scope200330.ataKeys,
      [UASGS_CGLIC[1]]: scope200331.ataKeys
    };
    return arps.filter((a) => {
      const keys = scopeByUasg[a.codigoUnidadeGerenciadora];
      return !keys || keys.includes(a.numeroAtaRegistroPreco);
    });
  }, [arps, scope200330.ataKeys, scope200331.ataKeys]);

  // Itens buscados sob demanda na API para atas que vieram do banco sem itens.
  const [apiItemsByAta, setApiItemsByAta] = useState<Record<string, ArpItemRecord[]>>({});
  const [itemsLoadingByAta, setItemsLoadingByAta] = useState<Record<string, boolean>>({});
  const itemsByAta = useMemo(() => ({ ...apiItemsByAta, ...dbItemsByAta }), [apiItemsByAta, dbItemsByAta]);

  const loadItemsForArp = useCallback(async (arp: ArpRecord) => {
    const ataKey = buildAtaKey(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora);
    if (itemsByAta[ataKey] || itemsLoadingByAta[ataKey]) return;

    setItemsLoadingByAta((prev) => ({ ...prev, [ataKey]: true }));
    try {
      const data = await fetchArpItems(arp.dataVigenciaInicial, arp.codigoUnidadeGerenciadora, arp.numeroAtaRegistroPreco, arp);
      if (data && data.resultado) {
        setApiItemsByAta((prev) => ({ ...prev, [ataKey]: data.resultado }));
      }
    } catch (err) {
      console.warn(`Erro ao carregar itens da Ata ${arp.numeroAtaRegistroPreco}:`, err);
    } finally {
      setItemsLoadingByAta((prev) => ({ ...prev, [ataKey]: false }));
    }
  }, [itemsByAta, itemsLoadingByAta]);

  const loadItemsForArps = useCallback((arpsToLoad: ArpRecord[]) => {
    arpsToLoad.forEach((arp) => {
      const ataKey = buildAtaKey(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora);
      if (!itemsByAta[ataKey] && !itemsLoadingByAta[ataKey]) loadItemsForArp(arp);
    });
  }, [itemsByAta, itemsLoadingByAta, loadItemsForArp]);

  // Atas com empenho / com alocação interna (filtros da carteira).
  const empenhosQuery = useQuery({ queryKey: EMPENHOS_SET_KEY, queryFn: fetchAtasWithEmpenhosSet, staleTime: 5 * 60 * 1000 });
  const allocationsQuery = useQuery({ queryKey: ALLOCATIONS_SET_KEY, queryFn: fetchAtasWithAllocationsSet, staleTime: 5 * 60 * 1000 });
  const emptySet = useMemo(() => new Set<string>(), []);
  const empenhosDbSet = empenhosQuery.data ?? emptySet;
  const allocationsDbSet = allocationsQuery.data ?? emptySet;

  // Gestor por ata (mesma fonte do detalhe da Ata e da Visão Geral), indexado pelo número da ata.
  const { data: ataManagers } = useAllAtaManagers();
  const gestorByAta = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [ataKey, manager] of Object.entries(ataManagers || {})) {
      if (manager?.gestorNome) map[ataKey] = manager.gestorNome;
    }
    return map;
  }, [ataManagers]);

  // Consumo de saldo por item (mesma fonte do detalhe da Ata e da Visão Geral).
  // Atas vencidas, canceladas ou sem data não geram alerta de saldo (mesma regra da Visão Geral).
  const { data: saldos200330 } = useAllAtaItemSaldos(UASGS_CGLIC[0]);
  const { data: saldos200331 } = useAllAtaItemSaldos(UASGS_CGLIC[1]);
  const saldoStatsByAta = useMemo(() => {
    const encerradas = new Set(
      arps
        .filter((arp) => {
          const faixa = getArpPrazo(arp).faixa;
          return faixa === 'EXPIRADO' || faixa === 'SEM_DATA';
        })
        .map((arp) => buildAtaKey(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora))
    );
    const saldos = [...(saldos200330 || []), ...(saldos200331 || [])].filter(
      (saldo: any) => !encerradas.has(`${saldo.numero_ata || saldo.numeroAta}-${saldo.codigo_uasg || saldo.codigoUasg}`)
    );
    return buildAtaSaldoStats(saldos);
  }, [arps, saldos200330, saldos200331]);

  // Recarrega do banco tudo o que a sincronização pode ter mudado (inclusive o cache da Ata 360).
  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ata-detail-source'] }),
      queryClient.invalidateQueries({ queryKey: EMPENHOS_SET_KEY }),
      queryClient.invalidateQueries({ queryKey: ALLOCATIONS_SET_KEY })
    ]);
  }, [queryClient]);

  // Sincronização com as fontes oficiais.
  const [syncOverride, setSyncOverride] = useState<SyncMetadata | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncInfo: SyncMetadata = syncOverride ?? loadedSources[0]?.syncInfo ?? getLastSyncMetadata();

  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncProgress({ step: 'Iniciando sincronização...', percent: 5 });
    try {
      let firstError: string | undefined;
      for (const uasg of UASGS_CGLIC) {
        const result = await runFullSync({ ...SYNC_PARAMS, codigoUnidadeGerenciadora: uasg }, (p) => setSyncProgress(p));
        if (!result.success) firstError ||= result.error || 'Erro durante sincronização';
      }
      await reload();
      setSyncOverride(getLastSyncMetadata());
      if (firstError) setSyncError(firstError);
    } catch (err: any) {
      setSyncError(err.message || 'Falha ao sincronizar com APIs governamentais');
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [reload]);

  // Banco vazio na primeira carga: dispara a sincronização automática (se a última passou do intervalo).
  const autoSyncChecked = useRef(false);
  useEffect(() => {
    if (isLoading || autoSyncChecked.current) return;
    autoSyncChecked.current = true;
    if (arps.length > 0) return;
    for (const uasg of UASGS_CGLIC) {
      checkAndTriggerAutoSync(uasg, () => {
        queryClient.invalidateQueries({ queryKey: getAtaSourceQueryOptions(uasg).queryKey });
      });
    }
  }, [isLoading, arps.length, queryClient]);

  return {
    /** Todas as atas carregadas (sem o escopo do gestor). */
    arps,
    /** Atas no escopo do usuário. */
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
  };
}
