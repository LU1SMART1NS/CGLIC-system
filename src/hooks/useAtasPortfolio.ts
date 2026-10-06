import { useCallback, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchArpItems } from '../services/api';
import { fetchAtasWithAllocationsSet, fetchAtasWithEmpenhosSet } from '../services/dbCacheService';
import { RECURSO_ATAS } from '../services/syncService';
import { useAtualizacaoNoServidor } from './useAtualizacaoNoServidor';
import { useAuth } from '../context/AuthContext';
import { chaveStatusSincronizacao, podeForcarAtualizacao, useSituacaoSincronizacao } from './useSituacaoSincronizacao';
import { getArpVigenciaStatus } from '../services/temporalEngineService';
import { classifyPrazo } from '../components/carteira/carteiraPrazo';
import { buildAtaSaldoStats } from '../components/atas/ataSaldoStats';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { buildAtaKey, getAtaSourceQueryOptions, useAllAtaItemSaldos } from './useAta';
import { useAllAtaManagers } from './useAtaManagers';
import { useAssignedManagementScope } from './useAssignedManagementScope';
import type { ArpRecord, ArpItemRecord, SyncMetadata } from '../types';

const EMPENHOS_SET_KEY = ['atas-with-empenhos-set'] as const;
const ALLOCATIONS_SET_KEY = ['atas-with-allocations-set'] as const;

/** Relê do banco tudo o que a sincronização das atas pode ter mudado (inclusive o cache da Ata 360). */
export async function invalidarDadosDeAtas(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ata-detail-source'] }),
    queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] }),
    queryClient.invalidateQueries({ queryKey: EMPENHOS_SET_KEY }),
    queryClient.invalidateQueries({ queryKey: ALLOCATIONS_SET_KEY }),
    queryClient.invalidateQueries({ queryKey: ['management-dashboard'] }),
    queryClient.invalidateQueries({ queryKey: chaveStatusSincronizacao(RECURSO_ATAS) })
  ]);
}

function relerAtas(queryClient: QueryClient) {
  void invalidarDadosDeAtas(queryClient);
}

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
  const reload = useCallback(() => invalidarDadosDeAtas(queryClient), [queryClient]);

  // Sincronização com as fontes oficiais: o servidor faz de hora em hora (agendamento do banco), e o botão
  // só do coordenador pede a atualização forçada ao servidor e espera terminar.
  const { role } = useAuth();
  const podeForcar = podeForcarAtualizacao(role);
  const situacao = useSituacaoSincronizacao(RECURSO_ATAS, relerAtas);
  const [isAtualizando, setIsAtualizando] = useState(false);
  // O servidor não informa progresso: o cabeçalho mostra "Atualizando...".
  const syncProgress: SyncProgress | null = null;
  const atualizarNoServidor = useAtualizacaoNoServidor();
  const [syncError, setSyncError] = useState<string | null>(null);
  const isSyncing = isAtualizando || situacao.sincronizando;

  /** Data da última sincronização completa, lida do banco; antes da primeira, a gravada nas próprias atas. */
  const syncInfo: SyncMetadata = {
    ...(loadedSources[0]?.syncInfo ?? { isCachedInDb: false }),
    ultimoSyncEm: situacao.ultimoSucessoEm ?? loadedSources[0]?.syncInfo?.ultimoSyncEm,
    status: isSyncing ? 'SYNCING' : situacao.incompleta ? 'ERROR' : 'SUCCESS'
  };

  const triggerSync = useCallback(async () => {
    if (!podeForcar) {
      await reload();
      return;
    }
    setIsAtualizando(true);
    setSyncError(null);
    try {
      const { erro } = await atualizarNoServidor(RECURSO_ATAS, UASGS_CGLIC);
      await reload();
      if (erro) setSyncError(erro);
    } finally {
      setIsAtualizando(false);
    }
  }, [podeForcar, reload, atualizarNoServidor]);

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
    /** Situação da última sincronização das atas no banco (falha, fontes, horários). */
    situacaoSincronizacao: situacao,
    triggerSync,
    reload
  };
}
