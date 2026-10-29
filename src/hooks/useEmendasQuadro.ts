import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAVE_EMENDAS } from './useEmendas';
import { fetchPrecosDosItens, salvarDadosItemEmenda, type PrecoDoItem } from '../services/emendasQuadroService';

/** Preço de hoje e data do reajuste de cada item da CAEP (migration 246). */
export function usePrecosDosItens(opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'precos-dos-itens'], queryFn: fetchPrecosDosItens, staleTime: 10 * 60_000, enabled: opts.enabled ?? true });
}

/**
 * Preços para a emenda: o de hoje da ata (desde 29/10/2026, sem projeção), com a data do reajuste de cada item. Enquanto
 * carrega ou se a leitura falhar, as telas usam o preço da lista de itens e não esmaecem nada (semPrevisao avisa a
 * falha; o banco confere o reajuste de qualquer jeito).
 */
export function usePrecosParaEmenda(): { precos: Map<string, PrecoDoItem> | undefined; semPrevisao: boolean } {
  const { data: precos, isError } = usePrecosDosItens();
  return { precos, semPrevisao: isError };
}

/** Nome na ata assinada e GND do item; recarrega os itens da CAEP (o nome e o GND vêm na mesma view). */
export function useSalvarDadosItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salvarDadosItemEmenda,
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'itens-caep'] })
  });
}
