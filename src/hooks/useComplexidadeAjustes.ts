import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchComplexidadeAjustes,
  removerComplexidadeAjuste,
  salvarComplexidadeAjuste,
  type ComplexidadeAjuste
} from '../services/complexidadeAjusteService';

export const COMPLEXIDADE_AJUSTES_KEY = ['complexidade-ajustes'] as const;

/** Ajustes manuais de complexidade, indexados por "TIPO:chave". */
export function useComplexidadeAjustes() {
  return useQuery<Record<string, ComplexidadeAjuste>, Error>({
    queryKey: COMPLEXIDADE_AJUSTES_KEY,
    queryFn: fetchComplexidadeAjustes,
    staleTime: 5 * 60 * 1000
  });
}

export function useSalvarComplexidadeAjuste() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: salvarComplexidadeAjuste,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: COMPLEXIDADE_AJUSTES_KEY })
  });
}

export function useRemoverComplexidadeAjuste() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removerComplexidadeAjuste,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: COMPLEXIDADE_AJUSTES_KEY })
  });
}
