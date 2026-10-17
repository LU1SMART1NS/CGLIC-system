import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllAllocationsGlobal } from '../services/allocationService';
import { fetchCarteiraItemEmpenhos, fetchCarteiraItemLinks } from '../services/carteiraItensService';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { ROTULO_SALDO_ITENS, getArpPrazo } from './useAtasPortfolio';
import type { LeituraDaTela } from '../components/fonte/useLeiturasComFalha';
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

/** Rótulos das leituras da execução dos itens na faixa "não carregou". */
export const ROTULOS_CARTEIRA_ITENS = {
  alocacoes: 'alocações às unidades internas',
  vinculos: 'quantidade contratada dos itens',
  empenhos: 'empenhado dos itens',
  saldos: ROTULO_SALDO_ITENS
} as const;

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
  /** Contratos só precisam das unidades; sem atas/itens a montagem das linhas é pulada (nem o saldo é lido). */
  apenasUnidadesDeContratos?: boolean;
  /**
   * A tela não mostra o empenhado dos itens (Alocação, gaveta Alocação do Início, número do menu): não lê
   * v_arp_item_contrato_empenhado, nem espera por ela, e as linhas saem com o empenhado zerado.
   */
  semEmpenhado?: boolean;
}) {
  const { arps, itemsByAta, gestorByAta, apenasUnidadesDeContratos = false, semEmpenhado = false } = params ?? {};
  const leEmpenhado = !apenasUnidadesDeContratos && !semEmpenhado;

  const allocationsQuery = useQuery({ queryKey: CARTEIRA_ALOCACOES_KEY, queryFn: fetchAllAllocationsGlobal, staleTime: STALE });
  const linksQuery = useQuery({ queryKey: CARTEIRA_VINCULOS_KEY, queryFn: fetchCarteiraItemLinks, staleTime: STALE });
  const empenhosQuery = useQuery({
    queryKey: CARTEIRA_EMPENHOS_KEY,
    queryFn: fetchCarteiraItemEmpenhos,
    staleTime: STALE,
    enabled: leEmpenhado
  });
  // Só as unidades dos contratos não usam o saldo: sem ler as duas UASGs à toa (eram 2 das 4 leituras do saldo na Carteira de Contratos).
  const saldos200330 = useAllAtaItemSaldos(UASGS_CGLIC[0], { enabled: !apenasUnidadesDeContratos });
  const saldos200331 = useAllAtaItemSaldos(UASGS_CGLIC[1], { enabled: !apenasUnidadesDeContratos });

  const allocations = allocationsQuery.data;
  const links = linksQuery.data;
  // Sem o empenhado, nem o que outra tela pôs no cache entra: a mesma tela mostra sempre a mesma coisa.
  const empenhos = leEmpenhado ? empenhosQuery.data : undefined;
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

  // Sem o saldo, a situação da qtd. da ata assinada e o consumo de cada item ficam desconhecidos: a tela avisa
  // em vez de mostrar os filtros de "Qtd. assinada" zerados.
  const saldosComErro = !apenasUnidadesDeContratos && (saldos200330.isError || saldos200331.isError);
  const { refetch: relerSaldosA } = saldos200330;
  const { refetch: relerSaldosB } = saldos200331;
  const recarregarSaldos = useCallback(() => {
    void relerSaldosA();
    void relerSaldosB();
  }, [relerSaldosA, relerSaldosB]);

  // Sem as alocações (só do banco), o alocado de cada item e as unidades ficam desconhecidos: a tela avisa.
  const alocacoesComErro = allocationsQuery.isError;
  const { refetch: relerAlocacoes } = allocationsQuery;
  const recarregarAlocacoes = useCallback(() => {
    void relerAlocacoes();
  }, [relerAlocacoes]);

  /**
   * Leituras da execução dos itens, para a faixa "não carregou": sem elas o alocado, o contratado e o empenhado
   * apareciam zerados, como se fosse verdade.
   */
  const leituras: LeituraDaTela[] = [
    { rotulo: ROTULOS_CARTEIRA_ITENS.alocacoes, query: allocationsQuery },
    { rotulo: ROTULOS_CARTEIRA_ITENS.vinculos, query: linksQuery },
    ...(leEmpenhado ? [{ rotulo: ROTULOS_CARTEIRA_ITENS.empenhos, query: empenhosQuery }] : []),
    ...(apenasUnidadesDeContratos
      ? []
      : [
          { rotulo: ROTULOS_CARTEIRA_ITENS.saldos, query: saldos200330 },
          { rotulo: ROTULOS_CARTEIRA_ITENS.saldos, query: saldos200331 }
        ])
  ];

  return {
    rows,
    leituras,
    resumoPorAta,
    unidades,
    unidadesDoContrato,
    /** A leitura do saldo dos itens falhou: a situação da ata assinada não é confiável. */
    saldosComErro,
    /** Saldo sendo lido de novo (depois de "Tentar de novo"). */
    recarregandoSaldos: saldos200330.isFetching || saldos200331.isFetching,
    recarregarSaldos,
    /** A leitura das alocações às unidades internas falhou: alocado e unidades não são confiáveis. */
    alocacoesComErro,
    recarregandoAlocacoes: allocationsQuery.isFetching,
    recarregarAlocacoes,
    isLoading:
      allocationsQuery.isPending ||
      linksQuery.isPending ||
      (leEmpenhado && empenhosQuery.isPending) ||
      (!apenasUnidadesDeContratos && (saldos200330.isPending || saldos200331.isPending))
  };
}
