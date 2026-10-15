import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchGestorNiveis, fetchGestorNivelHistorico, salvarGestorNivel, type NivelHistorico } from '../services/gestorNivelService';
import type { NivelRegistrado } from '../components/atas/distribuicao/nivelGestor';

export const GESTOR_NIVEIS_KEY = ['gestor-niveis'] as const;

/** Nível de cada servidor, por user_id (migration 140). */
export function useGestorNiveis() {
  return useQuery<Record<string, NivelRegistrado>, Error>({
    queryKey: GESTOR_NIVEIS_KEY,
    queryFn: fetchGestorNiveis,
    staleTime: 5 * 60 * 1000
  });
}

export function useGestorNivelHistorico(userId: string | null) {
  return useQuery<NivelHistorico[], Error>({
    queryKey: [...GESTOR_NIVEIS_KEY, 'historico', userId] as const,
    queryFn: () => fetchGestorNivelHistorico(userId as string),
    enabled: !!userId
  });
}

export function useSalvarGestorNivel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: salvarGestorNivel,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: GESTOR_NIVEIS_KEY })
  });
}
