import { useQuery } from '@tanstack/react-query';
import { fetchProcessosSei } from '../services/seiService';
import type { ProcessoSei } from '../types';

/**
 * Constrói as opções canônicas de query para a consulta de Processos SEI.
 *
 * Query Key Canônica: ['processos-sei']
 * Escopo: Catálogo institucional de processos administrativos SEI.
 */
export function getProcessosSeiQueryOptions() {
  return {
    queryKey: ['processos-sei'] as const,
    queryFn: async (): Promise<ProcessoSei[]> => {
      return fetchProcessosSei();
    },
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de Processos SEI.
 *
 * Arquitetura:
 * UI / Component -> useProcessosSei() -> fetchProcessosSei() -> Supabase (processos_sei) / PostgreSQL
 */
export function useProcessosSei() {
  return useQuery<ProcessoSei[], Error>(getProcessosSeiQueryOptions());
}
