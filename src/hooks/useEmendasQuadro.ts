import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAVE_EMENDAS, hojeEmBrasilia } from './useEmendas';
import { useMemo } from 'react';
import { fetchIpcaDozeMeses, fetchPrecosPrevistos, salvarDadosItemEmenda, type IpcaDozeMeses, type PrecoPrevisto } from '../services/emendasQuadroService';
import { aplicarPrazoDoEmpenho } from '../utils/emendasQuadro';

/** Preço de hoje e previsto (reajuste) de cada item da CAEP, para o quadro da reserva (migration 165). */
export function usePrecosPrevistos() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'precos-previstos'], queryFn: fetchPrecosPrevistos, staleTime: 10 * 60_000 });
}

/** IPCA dos últimos 12 meses: a folga dos itens sem base de reajuste no quadro. */
export function useIpcaDozeMeses() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'ipca-12-meses'], queryFn: fetchIpcaDozeMeses, staleTime: 60 * 60_000 });
}

/**
 * Preços para a emenda, os mesmos do quadro do parlamentar: o previsto pelo reajuste da ata até o empenho provável e,
 * sem base de reajuste, a folga do IPCA. Enquanto carrega ou se a leitura falhar, as telas usam o preço de hoje
 * (semPrevisao avisa a falha).
 */
export function usePrecosParaEmenda(): { precos: Map<string, PrecoPrevisto> | undefined; ipca: IpcaDozeMeses | null | undefined; semPrevisao: boolean } {
  const { data: precos, isError } = usePrecosPrevistos();
  const { data: ipca } = useIpcaDozeMeses();
  const hoje = hojeEmBrasilia();
  const ajustados = useMemo(() => (precos ? aplicarPrazoDoEmpenho(precos, hoje, ipca) : undefined), [precos, hoje, ipca]);
  return { precos: ajustados, ipca, semPrevisao: isError };
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
