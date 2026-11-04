import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  desfazerInclusaoNaFonte,
  fetchNotasForaDoContrato,
  marcarInclusaoNaFonte,
  type NotaForaDoContrato
} from '../services/notasForaDoContratoService';

/** Fila Vínculos › Notas fora do contrato (e o número no menu). */
export const NOTAS_FORA_DO_CONTRATO_KEY = ['notas-fora-do-contrato'] as const;

export function useNotasForaDoContrato(enabled = true) {
  return useQuery<NotaForaDoContrato[], Error>({
    queryKey: NOTAS_FORA_DO_CONTRATO_KEY,
    queryFn: fetchNotasForaDoContrato,
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });
}

/** Marcar "Vou incluir no Contratos.gov.br" e desfazer a marca. A lista é relida depois de cada uma. */
export function useAcoesInclusaoNaFonte() {
  const queryClient = useQueryClient();
  const aoTerminar = () => queryClient.invalidateQueries({ queryKey: NOTAS_FORA_DO_CONTRATO_KEY });
  const marcar = useMutation({ mutationFn: marcarInclusaoNaFonte, retry: 0, onSettled: aoTerminar });
  const desfazer = useMutation({ mutationFn: desfazerInclusaoNaFonte, retry: 0, onSettled: aoTerminar });
  return { marcar, desfazer };
}
