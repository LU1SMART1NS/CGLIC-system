import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllAllocationsGlobal } from '../services/allocationService';
import { fetchCarteiraItemEmpenhos, fetchCarteiraItemLinks } from '../services/carteiraItensService';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { getArpPrazo } from './useAtasPortfolio';
import { useAllAtaItemSaldos } from './useAta';
import {
  buildCarteiraItemRows,
  listarUnidades,
  resumirAtas,
  unidadesPorContrato,
  type CarteiraItemRow
} from '../utils/carteiraItens';
import type { ArpItemRecord, ArpRecord } from '../types';

const STALE = 2 * 60 * 1000;

/** Chaves de cache que uma mudança de alocação ou de vínculo precisa invalidar. */
export const CARTEIRA_ALOCACOES_KEY = ['carteira-alocacoes'] as const;
export const CARTEIRA_VINCULOS_KEY = ['carteira-vinculos-itens'] as const;
/** Sob o prefixo do vínculo das notas aos itens: vincular ou desfazer relê o empenhado da carteira. */
export const CARTEIRA_EMPENHOS_KEY = ['contrato-empenho-distribuicao', 'carteira-itens'] as const;

/**
 * Dados de execução por item da carteira: alocação por unidade interna, quantidade contratada e empenhada.
 * Recebe as atas e itens já carregados (de `useAtasPortfolio`) para não repetir a sincronização nem as consultas.
 * Alimenta a aba Itens e os filtros de alocação, empenho e unidade das abas Atas e Contratos.
 */
export function useCarteiraItens(params?: {
  arps?: ArpRecord[];
  itemsByAta?: Record<string, ArpItemRecord[]>;
  gestorByAta?: Record<string, string>;
  /** Contratos só precisam das unidades; sem atas/itens a montagem das linhas é pulada. */
  apenasUnidadesDeContratos?: boolean;
}) {
  const { arps, itemsByAta, gestorByAta, apenasUnidadesDeContratos = false } = params ?? {};

  const allocationsQuery = useQuery({ queryKey: CARTEIRA_ALOCACOES_KEY, queryFn: fetchAllAllocationsGlobal, staleTime: STALE });
  const linksQuery = useQuery({ queryKey: CARTEIRA_VINCULOS_KEY, queryFn: fetchCarteiraItemLinks, staleTime: STALE });
  const empenhosQuery = useQuery({
    queryKey: CARTEIRA_EMPENHOS_KEY,
    queryFn: fetchCarteiraItemEmpenhos,
    staleTime: STALE,
    enabled: !apenasUnidadesDeContratos
  });
  const saldos200330 = useAllAtaItemSaldos(UASGS_CGLIC[0]);
  const saldos200331 = useAllAtaItemSaldos(UASGS_CGLIC[1]);

  const allocations = allocationsQuery.data;
  const links = linksQuery.data;
  const empenhos = empenhosQuery.data;
  const saldosA = saldos200330.data;
  const saldosB = saldos200331.data;

  const rows = useMemo<CarteiraItemRow[]>(() => {
    if (apenasUnidadesDeContratos || !arps || !itemsByAta) return [];
    return buildCarteiraItemRows({
      arps,
      itemsByAta,
      gestorByAta: gestorByAta ?? {},
      saldos: [...(saldosA || []), ...(saldosB || [])],
      allocations: allocations ?? [],
      links: links ?? [],
      empenhos: empenhos ?? [],
      prazoOf: getArpPrazo
    });
  }, [apenasUnidadesDeContratos, arps, itemsByAta, gestorByAta, saldosA, saldosB, allocations, links, empenhos]);

  const resumoPorAta = useMemo(() => resumirAtas(rows), [rows]);
  const unidades = useMemo(() => listarUnidades(allocations ?? []), [allocations]);
  const unidadesDoContrato = useMemo(
    () => unidadesPorContrato(links ?? [], allocations ?? []),
    [links, allocations]
  );

  return {
    rows,
    resumoPorAta,
    unidades,
    unidadesDoContrato,
    isLoading:
      allocationsQuery.isPending ||
      linksQuery.isPending ||
      (!apenasUnidadesDeContratos && (empenhosQuery.isPending || saldos200330.isPending || saldos200331.isPending))
  };
}
