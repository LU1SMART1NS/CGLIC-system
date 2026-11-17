import { useQuery } from '@tanstack/react-query';
import { fetchTarefasAbertasPorInstrumento } from '../services/tarefasAbertasService';

export const TAREFAS_ABERTAS_KEY = ['tarefas-abertas-por-instrumento'] as const;

/**
 * Fila de cada ata e contrato para a carga da Distribuição. Enquanto carrega (ou se falhar), a carga fica só pela
 * complexidade, como antes, em vez de uma conta pela metade.
 */
export function useTarefasAbertas() {
  return useQuery<Record<string, number>, Error>({
    queryKey: TAREFAS_ABERTAS_KEY,
    queryFn: () => fetchTarefasAbertasPorInstrumento(),
    staleTime: 2 * 60 * 1000
  });
}
