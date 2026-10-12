import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  conferirQuantidadesEmpenho,
  desfazerDistribuicaoEmpenho,
  fetchDistribuicoesDoContrato,
  informarQuantidadeEmpenhoItem,
  vincularEmpenhoAosItens,
  type DistribuicaoDoEmpenho
} from '../services/distribuicaoEmpenhoService';

export const DISTRIBUICAO_EMPENHOS_KEY = (contractKey: string) => ['contrato-empenho-distribuicao', contractKey] as const;

/** Vínculo de cada NE do contrato aos itens (view das migrations 94 e 104). */
export function useDistribuicoesEmpenhoContrato(contractKey: string) {
  return useQuery<DistribuicaoDoEmpenho[], Error>({
    queryKey: DISTRIBUICAO_EMPENHOS_KEY(contractKey),
    queryFn: () => fetchDistribuicoesDoContrato(contractKey),
    enabled: Boolean(contractKey),
    staleTime: 60 * 1000
  });
}

/**
 * Vincular aos itens, desfazer, informar a quantidade de um item e conferir as quantidades. Atualiza a aba, a fila e
 * o empenhado por item (ata e carteira). Sem contrato (tela do item, com vários contratos), o histórico de cada um
 * fica para a próxima leitura.
 */
export function useAcoesDistribuicaoEmpenho(contractKey?: string) {
  const queryClient = useQueryClient();
  const aoTerminar = () => {
    // O prefixo cobre o contrato, a fila do menu Vinculação e a coluna da carteira de Empenhos.
    queryClient.invalidateQueries({ queryKey: ['contrato-empenho-distribuicao'] });
    queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    if (contractKey) queryClient.invalidateQueries({ queryKey: ['contract-events', contractKey] });
  };
  const vincular = useMutation({
    mutationFn: (p: Parameters<typeof vincularEmpenhoAosItens>[0]) => vincularEmpenhoAosItens(p),
    retry: 0,
    onSettled: aoTerminar
  });
  const desfazer = useMutation({
    mutationFn: (contratoEmpenhoId: string) => desfazerDistribuicaoEmpenho(contratoEmpenhoId),
    retry: 0,
    onSettled: aoTerminar
  });
  const informar = useMutation({
    mutationFn: (p: Parameters<typeof informarQuantidadeEmpenhoItem>[0]) => informarQuantidadeEmpenhoItem(p),
    retry: 0,
    onSettled: aoTerminar
  });
  const conferir = useMutation({
    mutationFn: (contratoEmpenhoId: string) => conferirQuantidadesEmpenho(contratoEmpenhoId),
    retry: 0,
    onSettled: aoTerminar
  });
  return { vincular, desfazer, informar, conferir };
}
