import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  desfazerCorrecaoDaNota,
  fetchConferenciasDaNota,
  marcarCorrecaoDaNota,
  type ConferenciaDaNota
} from '../services/conferenciaNotaService';

/** Segmento "Conferir no Contratos.gov.br" da fila Empenhos aos itens. Fica sob a chave da distribuição, que as ações invalidam. */
export const CONFERENCIA_NOTA_KEY = ['contrato-empenho-distribuicao', 'conferencia-nota'] as const;

export function useConferenciasDaNota(enabled = true) {
  return useQuery<ConferenciaDaNota[], Error>({
    queryKey: CONFERENCIA_NOTA_KEY,
    queryFn: fetchConferenciasDaNota,
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });
}

/** Marcar "Vou corrigir" e desfazer a marca. A lista é relida depois de cada uma. */
export function useAcoesCorrecaoDaNota() {
  const queryClient = useQueryClient();
  const aoTerminar = () => queryClient.invalidateQueries({ queryKey: CONFERENCIA_NOTA_KEY });
  const marcar = useMutation({ mutationFn: marcarCorrecaoDaNota, retry: 0, onSettled: aoTerminar });
  const desfazer = useMutation({ mutationFn: desfazerCorrecaoDaNota, retry: 0, onSettled: aoTerminar });
  return { marcar, desfazer };
}
