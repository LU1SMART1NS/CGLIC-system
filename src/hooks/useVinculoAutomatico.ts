import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMotivosVinculoManual,
  fetchUltimaExecucaoVinculo,
  rodarVinculoAutomatico,
  type ExecucaoVinculoAutomatico,
  type MotivoVinculoManual,
  type ResumoVinculoAutomatico
} from '../services/vinculoAutomaticoService';

/** Motivo de cada contrato que o sistema deixou para a equipe. */
export function useMotivosVinculoManual(enabled = true) {
  return useQuery<Map<string, MotivoVinculoManual>, Error>({
    queryKey: ['vinculo-automatico', 'motivos'],
    queryFn: fetchMotivosVinculoManual,
    enabled,
    staleTime: 5 * 60 * 1000
  });
}

/** Última execução gravada do vínculo automático. */
export function useUltimaExecucaoVinculo(enabled = true) {
  return useQuery<ExecucaoVinculoAutomatico | null, Error>({
    queryKey: ['vinculo-automatico', 'ultima'],
    queryFn: fetchUltimaExecucaoVinculo,
    enabled,
    staleTime: 5 * 60 * 1000
  });
}

/** Simular (não grava) ou vincular agora. Depois de gravar, recarrega tudo que mostra vínculos. */
export function useRodarVinculoAutomatico() {
  const queryClient = useQueryClient();
  return useMutation<ResumoVinculoAutomatico, Error, { simular: boolean }>({
    mutationFn: ({ simular }) => rodarVinculoAutomatico(simular),
    onSuccess: (resumo) => {
      if (resumo.simulacao) return;
      for (const key of ['vinculo-automatico', 'all-arp-item-contract-links', 'ata-linked-contracts', 'item-contract-links', 'ata-item-saldos']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
  });
}
