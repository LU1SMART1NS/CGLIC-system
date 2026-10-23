import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAVE_EMENDAS } from './useEmendas';
import { fetchPrecosPrevistos, salvarDadosItemEmenda } from '../services/emendasQuadroService';

/** Preço de hoje e previsto (reajuste) de cada item da CAEP, para o quadro da reserva (migration 165). */
export function usePrecosPrevistos() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'precos-previstos'], queryFn: fetchPrecosPrevistos, staleTime: 10 * 60_000 });
}

/** Nome curto e GND do item; recarrega os itens da CAEP (o nome e o GND vêm na mesma view). */
export function useSalvarDadosItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salvarDadosItemEmenda,
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'itens-caep'] })
  });
}
