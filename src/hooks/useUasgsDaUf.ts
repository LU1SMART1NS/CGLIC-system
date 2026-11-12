import { useQuery } from '@tanstack/react-query';
import { fetchUasgsDaUf } from '../services/api';

/** UASGs ativas da UF, lidas uma vez e guardadas enquanto o sistema estiver aberto (o cadastro muda pouco). */
export function useUasgsDaUf(uf: string) {
  return useQuery({
    queryKey: ['uasgs-da-uf', uf],
    queryFn: () => fetchUasgsDaUf(uf),
    enabled: /^[A-Z]{2}$/.test(uf),
    staleTime: Infinity,
    gcTime: 4 * 60 * 60 * 1000,
    retry: 0
  });
}
