import { useQuery } from '@tanstack/react-query';
import { fetchDepartments, type InternalDepartment } from '../services/unitService';

/**
 * Constrói as opções canônicas de query para o catálogo de departamentos internos.
 *
 * Query Key Canônica: ['internal-departments']
 * Escopo: Catálogo global de departamentos oficiais (SENASP/MJSP).
 */
export function getDepartmentsQueryOptions() {
  return {
    queryKey: ['internal-departments'] as const,
    queryFn: async (): Promise<InternalDepartment[]> => {
      return fetchDepartments();
    },
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta de Departamentos Internos.
 *
 * Arquitetura:
 * UI / Component -> useDepartments() -> fetchDepartments() -> Supabase (internal_departments) / PostgreSQL
 */
export function useDepartments() {
  return useQuery<InternalDepartment[], Error>(getDepartmentsQueryOptions());
}
