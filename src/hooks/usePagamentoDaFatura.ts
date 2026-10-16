import { useQuery } from '@tanstack/react-query';
import { fetchPagamentoDaFatura, type PagamentoDaFatura } from '../services/pagamentoDaFaturaService';

/** OB que pagou a fatura, lida só quando a conferência da linha está aberta. */
export function usePagamentoDaFatura(idFatura: number, contractKey: string) {
  return useQuery<PagamentoDaFatura | null, Error>({
    queryKey: ['pagamento-da-fatura', idFatura, contractKey],
    queryFn: () => fetchPagamentoDaFatura(idFatura, contractKey),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0
  });
}
