import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { useAtualizacaoNoServidor } from './useAtualizacaoNoServidor';
import { podeForcarAtualizacao, useSituacaoSincronizacao } from './useSituacaoSincronizacao';
import {
  aplicarConferenciaTesouro,
  fetchCiclosEmAberto,
  fetchConferenciaTesouro,
  fetchEmpenhosCarteira,
  fetchFaturasCarteira,
  fetchLigacoesCicloFatura,
  montarPagamentosCarteira
} from '../services/financeiroCarteiraService';
import type { LeituraDaTela } from '../components/fonte/useLeiturasComFalha';

/** Chaves do cache das abas do Financeiro (as faturas servem às duas). */
export const FINANCEIRO_QUERY_KEYS = {
  faturas: ['financeiro-faturas'] as const,
  tesouro: ['financeiro-faturas-conferencia-tesouro'] as const,
  empenhos: ['financeiro-empenhos'] as const,
  ciclos: ['financeiro-ciclos-em-aberto'] as const,
  ligacoes: ['financeiro-faturas-em-ciclo'] as const
};

/** Rótulos das leituras do Financeiro na faixa "não carregou". */
export const ROTULOS_FINANCEIRO = {
  faturas: 'faturas',
  tesouro: 'conferência das faturas pelo Tesouro',
  empenhos: 'empenhos',
  ciclos: 'ciclos de pagamento',
  ligacoes: 'faturas ligadas aos ciclos'
} as const;

const OPCOES = { staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false } as const;

/** Relê do banco as listas do Financeiro (depois de uma sincronização de empenhos, faturas ou OB). */
export async function invalidarFinanceiro(queryClient: QueryClient): Promise<void> {
  await Promise.all(Object.values(FINANCEIRO_QUERY_KEYS).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/**
 * Faturas de todos os contratos, com o aviso do Tesouro das que estão a conferir. São duas leituras: se a do Tesouro
 * falhar, as faturas saem sem o aviso e `tesouro` fica em erro (a tela avisa em vez de zerar os contadores).
 */
export function useFaturasCarteira(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const faturas = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.faturas, queryFn: fetchFaturasCarteira, enabled, ...OPCOES });
  const tesouro = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.tesouro, queryFn: fetchConferenciaTesouro, enabled, ...OPCOES });
  const data = useMemo(() => (faturas.data ? aplicarConferenciaTesouro(faturas.data, tesouro.data) : undefined), [faturas.data, tesouro.data]);
  return { ...faturas, data, tesouro };
}

/** As duas leituras das faturas (lista e aviso do Tesouro), para a faixa "não carregou". */
export function leiturasDasFaturas(faturas: ReturnType<typeof useFaturasCarteira>): LeituraDaTela[] {
  return [
    { rotulo: ROTULOS_FINANCEIRO.faturas, query: faturas },
    { rotulo: ROTULOS_FINANCEIRO.tesouro, query: faturas.tesouro }
  ];
}

/**
 * Empenhos dos contratos, com o pago somado pelas faturas com OB. Se as faturas falharem, os empenhos carregam assim
 * mesmo (o pago pelo Tesouro não depende delas) e a falha das faturas vai para a faixa.
 */
export function useEmpenhosCarteira() {
  const faturas = useFaturasCarteira();
  const empenhos = useQuery({
    queryKey: [...FINANCEIRO_QUERY_KEYS.empenhos, faturas.dataUpdatedAt],
    queryFn: () => fetchEmpenhosCarteira(faturas.data ?? []),
    enabled: faturas.data !== undefined || faturas.isError,
    ...OPCOES
  });
  return {
    rows: empenhos.data ?? [],
    isLoading: faturas.isLoading || empenhos.isLoading,
    isFetching: faturas.isFetching || empenhos.isFetching,
    error: (empenhos.error || faturas.error) as Error | null,
    refetch: () => Promise.all([faturas.refetch(), empenhos.refetch()]),
    leituras: [
      { rotulo: ROTULOS_FINANCEIRO.empenhos, query: empenhos },
      { rotulo: ROTULOS_FINANCEIRO.faturas, query: faturas }
    ] as LeituraDaTela[]
  };
}

/** Ciclos de pagamento em aberto e todas as faturas, cada um na sua linha. */
export function usePagamentosCarteira(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const faturas = useFaturasCarteira({ enabled });
  const ciclos = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.ciclos, queryFn: fetchCiclosEmAberto, enabled, ...OPCOES });
  const ligacoes = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.ligacoes, queryFn: fetchLigacoesCicloFatura, enabled, ...OPCOES });
  const rows = useMemo(
    () => montarPagamentosCarteira(ciclos.data ?? [], faturas.data ?? [], ligacoes.data ?? []),
    [ciclos.data, faturas.data, ligacoes.data]
  );
  return {
    rows,
    isLoading: faturas.isLoading || ciclos.isLoading,
    isFetching: faturas.isFetching || ciclos.isFetching || ligacoes.isFetching,
    error: (faturas.error || ciclos.error) as Error | null,
    refetch: () => Promise.all([faturas.refetch(), ciclos.refetch(), ligacoes.refetch()]),
    leituras: [
      ...leiturasDasFaturas(faturas),
      { rotulo: ROTULOS_FINANCEIRO.ciclos, query: ciclos },
      { rotulo: ROTULOS_FINANCEIRO.ligacoes, query: ligacoes }
    ] as LeituraDaTela[]
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
