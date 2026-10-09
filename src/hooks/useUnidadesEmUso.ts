import { useQuery } from '@tanstack/react-query';
import { fetchUnidadesEmUso } from '../services/unitService';

/**
 * Unidades internas em uso (só se desativam). Fica sob ['internal-departments'] para ser recarregada junto com o
 * catálogo quando uma unidade é salva, excluída ou desativada.
 */
export function useUnidadesEmUso() {
  return useQuery<Set<string>, Error>({
    queryKey: ['internal-departments', 'em-uso'],
    queryFn: fetchUnidadesEmUso
  });
}
