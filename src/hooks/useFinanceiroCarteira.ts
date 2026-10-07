import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { useAtualizacaoNoServidor } from './useAtualizacaoNoServidor';
import { podeForcarAtualizacao, useSituacaoSincronizacao } from './useSituacaoSincronizacao';
import {
  fetchCiclosEmAberto,
  fetchEmpenhosCarteira,
  fetchFaturasCarteira,
  fetchLigacoesCicloFatura,
  montarPagamentosCarteira
} from '../services/financeiroCarteiraService';

/** Chaves do cache das abas do Financeiro (as faturas servem às duas). */
export const FINANCEIRO_QUERY_KEYS = {
  faturas: ['financeiro-faturas'] as const,
  empenhos: ['financeiro-empenhos'] as const,
  ciclos: ['financeiro-ciclos-em-aberto'] as const,
  ligacoes: ['financeiro-faturas-em-ciclo'] as const
};

const OPCOES = { staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false } as const;

/** Relê do banco as listas do Financeiro (depois de uma sincronização de empenhos, faturas ou OB). */
export async function invalidarFinanceiro(queryClient: QueryClient): Promise<void> {
  await Promise.all(Object.values(FINANCEIRO_QUERY_KEYS).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useFaturasCarteira() {
  return useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.faturas, queryFn: fetchFaturasCarteira, ...OPCOES });
}

/** Empenhos dos contratos, com o pago somado pelas faturas com OB. */
export function useEmpenhosCarteira() {
  const faturas = useFaturasCarteira();
  const empenhos = useQuery({
    queryKey: [...FINANCEIRO_QUERY_KEYS.empenhos, faturas.dataUpdatedAt],
    queryFn: () => fetchEmpenhosCarteira(faturas.data ?? []),
    enabled: Boolean(faturas.data),
    ...OPCOES
  });
  return {
    rows: empenhos.data ?? [],
    isLoading: faturas.isLoading || empenhos.isLoading,
    isFetching: faturas.isFetching || empenhos.isFetching,
    error: (faturas.error || empenhos.error) as Error | null,
    refetch: () => Promise.all([faturas.refetch(), empenhos.refetch()])
  };
}

/** Ciclos de pagamento em aberto e todas as faturas, cada um na sua linha. */
export function usePagamentosCarteira() {
  const faturas = useFaturasCarteira();
  const ciclos = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.ciclos, queryFn: fetchCiclosEmAberto, ...OPCOES });
  const ligacoes = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.ligacoes, queryFn: fetchLigacoesCicloFatura, ...OPCOES });
  const rows = useMemo(
    () => montarPagamentosCarteira(ciclos.data ?? [], faturas.data ?? [], ligacoes.data ?? []),
    [ciclos.data, faturas.data, ligacoes.data]
  );
  return {
    rows,
    isLoading: faturas.isLoading || ciclos.isLoading,
    isFetching: faturas.isFetching || ciclos.isFetching || ligacoes.isFetching,
    error: (faturas.error || ciclos.error) as Error | null,
    refetch: () => Promise.all([faturas.refetch(), ciclos.refetch(), ligacoes.refetch()])
  };
}

function relerFinanceiro(queryClient: QueryClient) {
  void invalidarFinanceiro(queryClient);
}

/**
 * "Atualizar" da aba Pagamentos (mesmo desenho das carteiras): o coordenador pede ao servidor as faturas e depois
 * as ordens bancárias das NPs; os demais perfis veem só "Atualizado às", da última busca de OB.
 */
export function useSincronizacaoPagamentos() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const faturas = useSituacaoSincronizacao('faturas', relerFinanceiro);
  const ordens = useSituacaoSincronizacao('ordens_bancarias', relerFinanceiro);
  const atualizarNoServidor = useAtualizacaoNoServidor();
  const [isAtualizando, setIsAtualizando] = useState(false);
  const podeForcar = podeForcarAtualizacao(role);

  const atualizar = useCallback(async () => {
    setIsAtualizando(true);
    try {
      if (podeForcar) {
        const { erro } = await atualizarNoServidor('faturas', UASGS_CGLIC);
        if (!erro) await atualizarNoServidor('ordens_bancarias', UASGS_CGLIC);
      }
      await invalidarFinanceiro(queryClient);
    } finally {
      setIsAtualizando(false);
    }
  }, [podeForcar, queryClient, atualizarNoServidor]);

  return {
    podeForcar,
    atualizar,
    sincronizando: isAtualizando || faturas.sincronizando || ordens.sincronizando,
    ultimoSucessoEm: ordens.ultimoSucessoEm ?? faturas.ultimoSucessoEm
  };
}
