import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  desfazerDistribuicaoEmpenho,
  distribuirEmpenhoNosItens,
  fetchDistribuicoesDoContrato,
  type DistribuicaoDoEmpenho
} from '../services/distribuicaoEmpenhoService';

export const DISTRIBUICAO_EMPENHOS_KEY = (contractKey: string) => ['contrato-empenho-distribuicao', contractKey] as const;

/** Distribuição de cada NE do contrato entre os itens (view da migration 94). */
export function useDistribuicoesEmpenhoContrato(contractKey: string) {
  return useQuery<DistribuicaoDoEmpenho[], Error>({
    queryKey: DISTRIBUICAO_EMPENHOS_KEY(contractKey),
    queryFn: () => fetchDistribuicoesDoContrato(contractKey),
    enabled: Boolean(contractKey),
    staleTime: 60 * 1000
  });
}

/** Vincular aos itens e desfazer. Atualiza a aba, a fila e o empenhado por item (ata e carteira). */
export function useAcoesDistribuicaoEmpenho(contractKey: string) {
  const queryClient = useQueryClient();
  const aoTerminar = () => {
    // O prefixo cobre o contrato, a fila do menu Vinculação e a coluna da carteira de Empenhos.
    queryClient.invalidateQueries({ queryKey: ['contrato-empenho-distribuicao'] });
    queryClient.invalidateQueries({ queryKey: ['contract-events', contractKey] });
  };
  const distribuir = useMutation({
    mutationFn: (p: Parameters<typeof distribuirEmpenhoNosItens>[0]) => distribuirEmpenhoNosItens(p),
    retry: 0,
    onSettled: aoTerminar
  });
  const desfazer = useMutation({
    mutationFn: (contratoEmpenhoId: string) => desfazerDistribuicaoEmpenho(contratoEmpenhoId),
    retry: 0,
    onSettled: aoTerminar
  });
  return { distribuir, desfazer };
}
