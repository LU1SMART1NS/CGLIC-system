import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchArpsWithItemsFromDb, fetchAtaWithItemsFromDb } from '../services/dbCacheService';
import { sementeDaCarteira } from './sementeDaCarteira';
import { COLUNAS_SALDO_CARTEIRA, fetchArpItemSaldosFromDb } from '../services/dashboardService';
import { fetchArpItemContractLinksByAta, enrichContractLinks } from '../services/arpContractLinkService';
import { useContratosPorChave } from './useContratosPorChave';
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
 * Atas (+ itens) de uma UASG no banco local. Query única por UASG, compartilhada entre a
 * Ata 360 (useAta) e a Carteira de Atas (useAtasPortfolio).
 */
export function getAtaSourceQueryOptions(uasg: string) {
  const cleanUasg = (uasg || '').trim();
  return {
    queryKey: ['ata-detail-source', cleanUasg] as const,
    queryFn: () => fetchArpsWithItemsFromDb(cleanUasg),
    enabled: Boolean(cleanUasg),
    staleTime: 5 * 60 * 1000
  };
}

/** Número da ata dentro da chave ("00059/2025-200331" → "00059/2025"). */
export function numeroDaAtaKey(ataKey?: string): string {
  return (ataKey || '').trim().replace(/-\d{6}$/, '');
}

type FonteDasAtas = Awaited<ReturnType<typeof fetchArpsWithItemsFromDb>>;

/** A ata da chave numa lista de atas (pela chave número-UASG ou só pelo número), na mesma regra de sempre. */
function acharAta(arps: readonly ArpRecord[], ataKey?: string): ArpRecord | null {
  const normalizedTarget = (ataKey || '').trim().toUpperCase();
  return (
    arps.find((a) => {
      const key = buildAtaKey(a.numeroAtaRegistroPreco, a.codigoUnidadeGerenciadora);
      return key.toUpperCase() === normalizedTarget || a.numeroAtaRegistroPreco.toUpperCase() === normalizedTarget;
    }) || null
  );
}

/**
 * Consulta de uma ata só (+ itens), sob o prefixo ['ata-detail-source', uasg]: quem invalida as atas da UASG
 * invalida também esta.
 */
export function getAtaUnicaQueryOptions(ataKey: string, uasg: string) {
  const cleanUasg = (uasg || '').trim();
  const numeroAta = numeroDaAtaKey(ataKey);
  return {
    queryKey: ['ata-detail-source', cleanUasg, 'ata', numeroAta] as const,
    queryFn: () => fetchAtaWithItemsFromDb(numeroAta, cleanUasg),
    enabled: Boolean(numeroAta && cleanUasg),
    staleTime: 5 * 60 * 1000
  };
}

/**
 * Hook canônico para recuperar uma única Ata (+ seus itens) por ataKey (`${numeroAta}-${uasg}`). Lê só essa ata do
 * banco (antes lia todas as atas da UASG com todos os itens). Quem vem da Carteira de Atas, de Itens ou do Início já
 * tem a lista ['ata-detail-source', uasg] no navegador: a ata sai dela, sem pedido.
 */
export function useAta(ataKey?: string, uasg?: string) {
  const cleanUasg = (uasg || '').trim();
  const queryClient = useQueryClient();

  const query = useQuery<FonteDasAtas>({
    ...getAtaUnicaQueryOptions(ataKey || '', cleanUasg),
    enabled: Boolean(ataKey && cleanUasg && numeroDaAtaKey(ataKey)),
    ...sementeDaCarteira<FonteDasAtas, FonteDasAtas>(queryClient, getAtaSourceQueryOptions(cleanUasg).queryKey, (lista) => {
      const achada = acharAta(lista.arps, ataKey);
      if (!achada) return undefined;
      const chave = buildAtaKey(achada.numeroAtaRegistroPreco, achada.codigoUnidadeGerenciadora);
      return {
        arps: [achada],
        itemsByAta: lista.itemsByAta[chave] ? { [chave]: lista.itemsByAta[chave] } : {},
        syncInfo: lista.syncInfo
      };
    })
  });

  const arp: ArpRecord | null = acharAta(query.data?.arps || [], ataKey);

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

/**
 * Saldos por item de todas as Atas da UASG, só com as colunas das carteiras (COLUNAS_SALDO_CARTEIRA).
 * Fica sob o prefixo 'ata-item-saldos': quem invalida o saldo invalida também este cache.
 * Se a leitura falhar, a consulta fica em erro (isError) em vez de devolver uma lista vazia.
 */
export function getCarteiraSaldosQueryOptions(uasg?: string) {
  const cleanUasg = (uasg || '').trim();
  return {
    queryKey: ['ata-item-saldos', cleanUasg, 'carteira'] as const,
    queryFn: () => fetchArpItemSaldosFromDb(cleanUasg, COLUNAS_SALDO_CARTEIRA),
    enabled: Boolean(cleanUasg),
    staleTime: 5 * 60 * 1000
  };
}

export function useAllAtaItemSaldos(uasg?: string, { enabled = true }: { enabled?: boolean } = {}) {
  const opcoes = getCarteiraSaldosQueryOptions(uasg);
  return useQuery({ ...opcoes, enabled: opcoes.enabled && enabled });
}

/** Saldo físico (homologado/consumido/percentual) dos itens de UMA Ata, via v_arp_item_saldo_detalhado (todas as colunas). */
export function useAtaItemSaldos(numeroAta?: string, uasg?: string) {
  const cleanUasg = (uasg || '').trim();

  const query = useQuery({
    queryKey: ['ata-item-saldos', cleanUasg] as const,
    queryFn: () => fetchArpItemSaldosFromDb(cleanUasg),
    enabled: Boolean(numeroAta && cleanUasg),
    staleTime: 5 * 60 * 1000
  });

  // A consulta da carteira traz também atas de outros órgãos de mesmo número (migration 106): filtra pela UASG.
  const saldos = (query.data || []).filter(
    (i: any) => (i.numero_ata || i.numeroAta) === numeroAta && String(i.codigo_uasg || i.codigoUasg || cleanUasg) === cleanUasg
  );

  return { saldos, isLoading: query.isLoading, /** Para a faixa "não carregou": sem ele, o consumo sai 0% e o saldo cheio. */ consulta: query };
}

/** Contratos oficiais vinculados a qualquer item de uma Ata (arp_item_contract_links), já enriquecidos. */
export function useAtaLinkedContracts(numeroAta?: string, uasg?: string, uasgCarteira?: string) {
  const cleanUasg = (uasg || '').trim();
  // Contratos da carteira da CGLIC: nas atas de outros órgãos, a UASG da ata não tem contratos da SENASP.
  const carteira = (uasgCarteira || uasg || '').trim();

  const linksQuery = useQuery({
    queryKey: ['ata-linked-contracts', numeroAta, cleanUasg] as const,
    queryFn: () => fetchArpItemContractLinksByAta(numeroAta as string, cleanUasg),
    enabled: Boolean(numeroAta && cleanUasg)
  });

  // Só os contratos vinculados (antes, a carteira inteira de contratos da UASG para enriquecer uns poucos vínculos).
  const chavesVinculadas = useMemo(() => (linksQuery.data ? linksQuery.data.map((l) => l.contractKey) : undefined), [linksQuery.data]);
  const contractsQuery = useContratosPorChave(carteira, chavesVinculadas);
  const { data: contracts = [] } = contractsQuery;

  const linkedContracts: EnrichedArpItemContract[] = enrichContractLinks(linksQuery.data || [], contracts);

  return {
    linkedContracts,
    isLoading: linksQuery.isLoading,
    /** Os vínculos e os contratos, para a faixa "não carregou" (sem eles, "nenhum contrato vinculado" seria falso). */
    leituras: [
      { rotulo: 'contratos vinculados à ata', query: linksQuery },
      { rotulo: `contratos da UASG ${carteira}`, query: contractsQuery }
    ]
  };
}
