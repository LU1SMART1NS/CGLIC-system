import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAvisosDistribuicao, marcarAvisosDistribuicaoLidos, type DistribuicaoAviso } from '../services/distribuicaoAvisosService';

export const AVISOS_DISTRIBUICAO_KEY = ['avisos-distribuicao'] as const;

/** Avisos não lidos de vínculos que mudaram o gestor. Só o coordenador lê; para os demais a lista vem vazia. */
export function useAvisosDistribuicao(enabled: boolean) {
  return useQuery<DistribuicaoAviso[], Error>({
    queryKey: AVISOS_DISTRIBUICAO_KEY,
    queryFn: fetchAvisosDistribuicao,
    enabled,
    staleTime: 60 * 1000
  });
}

export function useMarcarAvisosLidos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => marcarAvisosDistribuicaoLidos(ids),
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: AVISOS_DISTRIBUICAO_KEY })
  });
}
