import { useQuery } from '@tanstack/react-query';
import { fetchItemEmpenhoVinculos } from '../services/itemEmpenhoVinculoService';
import type { ItemEmpenhoVinculo } from '../types/itemEmpenhoVinculo';

/**
 * Empenhos do item que vieram dos contratos vinculados.
 * Query Key Canônica: ['item-empenho-vinculos', canonicalItemKey]
 */
export function useItemEmpenhoVinculos(canonicalItemKey?: string) {
  const key = (canonicalItemKey || '').trim();
  return useQuery<ItemEmpenhoVinculo[], Error>({
    queryKey: ['item-empenho-vinculos', key] as const,
    queryFn: () => fetchItemEmpenhoVinculos(key),
    enabled: Boolean(key),
    staleTime: 60 * 1000
  });
}
