import { useQuery } from '@tanstack/react-query';
import { fetchArpsWithItemsFromDb } from '../services/dbCacheService';
import { fetchArpItemSaldosFromDb } from '../services/dashboardService';
import { fetchArpItemContractLinksByAta, enrichContractLinks } from '../services/arpContractLinkService';
import { useContractsDashboard } from './useContractsDashboard';
import type { ArpRecord, ArpItemRecord } from '../types';
import type { EnrichedArpItemContract } from '../types/arpContractLinks';

/** Chave canônica de Ata usada em todo o sistema (arpKey, itemsByAta, funil de atenção). */
export function buildAtaKey(numeroAta: string, uasg: string): string {
  return `${numeroAta}-${uasg}`;
}

/** Endereço da Ata 360 (opcionalmente numa aba). */
export function buildAtaPath(numeroAta: string, uasg: string, aba?: string): string {
  return `/atas/detalhe/${encodeURIComponent(buildAtaKey(numeroAta, uasg))}${aba ? `?aba=${aba}` : ''}`;
}

/** Endereço próprio do detalhe (saldo) de um item da Ata — compartilhável e resistente a recarregar a página. */
export function buildAtaItemPath(numeroAta: string, uasg: string, numeroItem: string | number): string {
  return `/atas/detalhe/${encodeURIComponent(buildAtaKey(numeroAta, uasg))}/itens/${encodeURIComponent(String(numeroItem))}`;
}

/** UASG embutida na chave da Ata ("00059/2025-200331" → "200331"). */
export function uasgFromAtaKey(ataKey?: string): string | undefined {
  return /-(\d{6})$/.exec((ataKey || '').trim())?.[1];
}

/**
 * Hook canônico para recuperar uma única Ata (+ seus itens) por ataKey
 * (`${numeroAta}-${uasg}`), no mesmo espírito de useContract.ts: reaproveita
 * uma única query cacheada por UASG em vez de disparar uma consulta por Ata.
 */
export function useAta(ataKey?: string, uasg?: string) {
  const cleanUasg = (uasg || '').trim();

  const query = useQuery({
    queryKey: ['ata-detail-source', cleanUasg] as const,
    queryFn: () => fetchArpsWithItemsFromDb(cleanUasg),
    enabled: Boolean(ataKey && cleanUasg),
    staleTime: 5 * 60 * 1000
  });

  const normalizedTarget = (ataKey || '').trim().toUpperCase();
  const arp: ArpRecord | null =
    (query.data?.arps || []).find((a) => {
      const key = buildAtaKey(a.numeroAtaRegistroPreco, a.codigoUnidadeGerenciadora);
      return key.toUpperCase() === normalizedTarget || a.numeroAtaRegistroPreco.toUpperCase() === normalizedTarget;
    }) || null;

  const itens: ArpItemRecord[] = arp
    ? query.data?.itemsByAta[buildAtaKey(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora)] || []
    : [];

  return {
    arp,
    itens,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch
  };
}

/** Saldo físico (homologado/consumido/percentual) dos itens de UMA Ata, via v_arp_item_saldo_detalhado. */
/** Saldos por item de todas as Atas da UASG (mesmo cache de useAtaItemSaldos). */
export function useAllAtaItemSaldos(uasg?: string) {
  const cleanUasg = (uasg || '').trim();

  return useQuery({
    queryKey: ['ata-item-saldos', cleanUasg] as const,
    queryFn: () => fetchArpItemSaldosFromDb(cleanUasg),
    enabled: Boolean(cleanUasg),
    staleTime: 5 * 60 * 1000
  });
}

export function useAtaItemSaldos(numeroAta?: string, uasg?: string) {
  const cleanUasg = (uasg || '').trim();

  const query = useQuery({
    queryKey: ['ata-item-saldos', cleanUasg] as const,
    queryFn: () => fetchArpItemSaldosFromDb(cleanUasg),
    enabled: Boolean(numeroAta && cleanUasg),
    staleTime: 5 * 60 * 1000
  });

  const saldos = (query.data || []).filter(
    (i: any) => (i.numero_ata || i.numeroAta) === numeroAta
  );

  return { saldos, isLoading: query.isLoading };
}

/** Contratos oficiais vinculados a qualquer item de uma Ata (arp_item_contract_links), já enriquecidos. */
export function useAtaLinkedContracts(numeroAta?: string, uasg?: string) {
  const cleanUasg = (uasg || '').trim();

  const linksQuery = useQuery({
    queryKey: ['ata-linked-contracts', numeroAta, cleanUasg] as const,
    queryFn: () => fetchArpItemContractLinksByAta(numeroAta as string, cleanUasg),
    enabled: Boolean(numeroAta && cleanUasg)
  });

  const { data: contracts = [] } = useContractsDashboard(cleanUasg);

  const linkedContracts: EnrichedArpItemContract[] = enrichContractLinks(linksQuery.data || [], contracts);

  return { linkedContracts, isLoading: linksQuery.isLoading };
}
