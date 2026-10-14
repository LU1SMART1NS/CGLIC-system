import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  desfazerCorrecaoNaFonte,
  fetchEmpenhosForaDoContrato,
  marcarCorrecaoNaFonte,
  type EmpenhoForaDoContrato
} from '../services/empenhosForaDoContratoService';

/** Fila Vinculação › Empenhos ao contrato (e o número no menu). */
export const EMPENHOS_FORA_DO_CONTRATO_KEY = ['empenhos-fora-do-contrato'] as const;

export function useEmpenhosForaDoContrato(enabled = true) {
  return useQuery<EmpenhoForaDoContrato[], Error>({
    queryKey: EMPENHOS_FORA_DO_CONTRATO_KEY,
    queryFn: fetchEmpenhosForaDoContrato,
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });
}

/** Marcar "Vou corrigir no Contratos.gov.br" e desfazer a marca. A lista é relida depois de cada uma. */
export function useAcoesCorrecaoNaFonte() {
  const queryClient = useQueryClient();
  const aoTerminar = () => queryClient.invalidateQueries({ queryKey: EMPENHOS_FORA_DO_CONTRATO_KEY });
  const marcar = useMutation({ mutationFn: marcarCorrecaoNaFonte, retry: 0, onSettled: aoTerminar });
  const desfazer = useMutation({ mutationFn: desfazerCorrecaoNaFonte, retry: 0, onSettled: aoTerminar });
  return { marcar, desfazer };
}
