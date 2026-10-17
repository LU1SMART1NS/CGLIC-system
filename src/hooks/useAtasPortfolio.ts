import { useCallback, useMemo, useState } from 'react';
import { useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
import { ROTULO_GESTORES_ATAS, useAssignedManagementScope } from './useAssignedManagementScope';
import { naoCarregou, type LeituraDaTela } from '../components/fonte/useLeiturasComFalha';
import type { ArpRecord, ArpItemRecord, SyncMetadata } from '../types';
import { carteiraDaAta, chaveGestaoDaArp } from '../utils/ataIdentidade';

/** Relê do banco tudo o que a sincronização das atas pode ter mudado (inclusive o cache da Ata 360). */
export async function invalidarDadosDeAtas(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ata-detail-source'] }),
    queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] }),
    queryClient.invalidateQueries({ queryKey: ['management-dashboard'] }),
    queryClient.invalidateQueries({ queryKey: chaveStatusSincronizacao(RECURSO_ATAS) })
  ]);
}

function relerAtas(queryClient: QueryClient) {
  void invalidarDadosDeAtas(queryClient);
}

/** Rótulo do saldo dos itens na faixa: o mesmo do Início (lerFonte), para juntar numa linha. */
export const ROTULO_SALDO_ITENS = 'saldo dos itens';
export const ROTULO_ITENS_NAS_FONTES = 'itens das atas';

export type SyncProgress = { step: string; percent: number; current?: number; total?: number };

/**
 * Faixa de prazo da Ata (mesmas faixas do Início: crítico ≤30 dias, atenção 31–90).
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
 * gestor e consumo de saldo por ata e a sincronização com as fontes oficiais.
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
    // Perfil sem escopo (keys indefinidas nas duas carteiras) vê tudo. Gestor: só as atas da carteira atribuídas
    // a ele, pela chave de gestão (atas de outros órgãos repetem números de atas da CGLIC, migration 106).
    const escopado = scope200330.ataKeys !== undefined || scope200331.ataKeys !== undefined;
    return arps.filter((a) => {
      if (!escopado) return true;
      const keys = scopeByUasg[carteiraDaAta(a)];
      return Boolean(keys?.includes(chaveGestaoDaArp(a)));
    });
  }, [arps, scope200330.ataKeys, scope200331.ataKeys]);

  // Os itens vêm só do banco: quem os grava é a sincronização do servidor (de hora em hora). Antes, até 15 atas sem
  // itens no banco disparavam chamadas ao Compras.gov.br e ao PNCP pelo navegador a cada troca de filtro.
  const itemsByAta = dbItemsByAta;

  // Atas da carteira ainda sem itens no banco: a faixa diz quais, em vez de a carteira mostrá-las vazias, caladas.
  const atasSemItensNoBanco = useMemo(
    () =>
      isLoading
        ? []
        : scopedArps
            .filter((a) => !dbItemsByAta[buildAtaKey(a.numeroAtaRegistroPreco, a.codigoUnidadeGerenciadora)]?.length)
            .map((a) => a.numeroAtaRegistroPreco),
    [isLoading, scopedArps, dbItemsByAta]
  );
  const leituraDosItensNasFontes: LeituraDaTela | null =
    atasSemItensNoBanco.length > 0
      ? {
          rotulo: ROTULO_ITENS_NAS_FONTES,
          query: {
            data: undefined,
            isError: true,
            error: new Error(
              `${atasSemItensNoBanco.length === 1 ? 'a ata' : `${atasSemItensNoBanco.length} atas`} ${atasSemItensNoBanco
                .slice(0, 5)
                .join(', ')}${atasSemItensNoBanco.length > 5 ? '…' : ''} ainda sem itens no banco; a sincronização do servidor traz os itens de hora em hora`
            ),
            // "Tentar novamente" relê as atas do banco (não chama as fontes oficiais).
            refetch: () => invalidarDadosDeAtas(queryClient)
          }
        }
      : null;

  // Gestor por ata (mesma fonte do detalhe da Ata e do Início), indexado pela chave de gestão (chaveGestaoDaArp).
  const ataManagersQuery = useAllAtaManagers();
  const { data: ataManagers } = ataManagersQuery;
  const gestorByAta = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [ataKey, manager] of Object.entries(ataManagers || {})) {
      if (manager?.gestorNome) map[ataKey] = manager.gestorNome;
    }
    return map;
  }, [ataManagers]);

  // Consumo de saldo por item (mesma fonte do detalhe da Ata e do Início).
  // Atas vencidas, canceladas ou sem data não geram alerta de saldo (mesma regra do Início).
  const saldos200330Query = useAllAtaItemSaldos(UASGS_CGLIC[0]);
  const saldos200331Query = useAllAtaItemSaldos(UASGS_CGLIC[1]);
  const { data: saldos200330 } = saldos200330Query;
  const { data: saldos200331 } = saldos200331Query;
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

  /**
   * Leituras das atas, dos gestores e do recorte do perfil gestor, para a faixa "não carregou": sem elas a carteira
   * dizia "0 atas" ou "Ata não encontrada" e o gestor via a carteira vazia, como se fosse verdade.
   */
  const leiturasDasAtas: LeituraDaTela[] = [
    ...sources.map((query, i) => ({ rotulo: `atas da UASG ${UASGS_CGLIC[i]}`, query })),
    { rotulo: ROTULO_GESTORES_ATAS, query: ataManagersQuery },
    ...(scope200330.leituras ?? []),
    ...(scope200331.leituras ?? [])
  ];
  /** Saldo dos itens (consumo e situação da ata assinada), para a faixa. */
  const leiturasDosSaldos: LeituraDaTela[] = [
    { rotulo: ROTULO_SALDO_ITENS, query: saldos200330Query },
    { rotulo: ROTULO_SALDO_ITENS, query: saldos200331Query }
  ];
  /**
   * As atas de alguma UASG (ou, no perfil gestor, o recorte dele) falharam sem leitura anterior: a lista vazia não é
   * "nenhuma ata", é "não carregou".
   */
  const atasNaoCarregaram =
    sources.some((q) => naoCarregou(q)) || [...(scope200330.leituras ?? []), ...(scope200331.leituras ?? [])].some((l) => naoCarregou(l.query));

  return {
    /** Todas as atas carregadas (sem o escopo do gestor). */
    arps,
    leiturasDasAtas,
    leiturasDosSaldos,
    /** Atas da carteira ainda sem itens no banco (só na Carteira de Atas); null quando nenhuma. */
    leituraDosItensNasFontes,
    atasNaoCarregaram,
    /** Atas no escopo do usuário. */
    scopedArps,
    isLoading,
    scopeLoading,
    itemsByAta,
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
