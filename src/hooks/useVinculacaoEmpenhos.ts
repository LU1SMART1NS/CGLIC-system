import { useQuery } from '@tanstack/react-query';
import {
  fetchDistribuicoesParaVincular,
  fetchSituacaoDistribuicaoPorEmpenho,
  type DistribuicaoDoEmpenho,
  type SituacaoDistribuicaoEmpenho
} from '../services/distribuicaoEmpenhoService';
import { fetchContratosComEmpenhosConsultados } from '../services/contratoEmpenhosSincronizacaoService';

/** Chaves de cache das filas de empenho do menu Vinculação; "contrato-empenho-distribuicao" as invalida junto com as do contrato. */
export const VINCULACAO_EMPENHOS_ITENS_KEY = ['contrato-empenho-distribuicao', 'fila'] as const;
export const SITUACAO_DISTRIBUICAO_EMPENHOS_KEY = ['contrato-empenho-distribuicao', 'por-empenho'] as const;
export const CONTRATOS_EMPENHOS_CONSULTADOS_KEY = ['contrato-empenhos-sincronizacao', 'consultados'] as const;

const OPCOES = { staleTime: 60 * 1000, refetchOnWindowFocus: false } as const;

/** Notas a vincular aos itens (todos os contratos) e as vinculadas pela equipe nos últimos dias. */
export function useEmpenhosParaVincularAosItens(enabled = true) {
  return useQuery<DistribuicaoDoEmpenho[], Error>({ queryKey: VINCULACAO_EMPENHOS_ITENS_KEY, queryFn: fetchDistribuicoesParaVincular, enabled, ...OPCOES });
}

/** Situação da divisão por item de cada NE, por id do empenho (coluna "Itens" da carteira de Empenhos). */
export function useSituacaoDistribuicaoPorEmpenho(enabled = true) {
  return useQuery<Map<string, SituacaoDistribuicaoEmpenho>, Error>({
    queryKey: SITUACAO_DISTRIBUICAO_EMPENHOS_KEY,
    queryFn: async () => new Map((await fetchSituacaoDistribuicaoPorEmpenho()).map((s) => [s.empenhoId, s])),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

/** Contratos cujos empenhos já foram consultados com sucesso: só neles vale acusar NE citada pela fatura sem vínculo. */
export function useContratosComEmpenhosConsultados(enabled = true) {
  return useQuery<Set<string>, Error>({ queryKey: CONTRATOS_EMPENHOS_CONSULTADOS_KEY, queryFn: fetchContratosComEmpenhosConsultados, enabled, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false });
}
