import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchReajusteDaAta,
  fetchResumoReajusteAtas,
  informarReajusteAta,
  informarTermoConformidade,
  REAJUSTE_VAZIO,
  type ReajusteDaAta,
  type ResumoReajusteAta
} from '../services/reajusteAtasService';

export const REAJUSTE_DA_ATA_KEY = (numeroAta: string, uasg: string) => ['reajuste-da-ata', numeroAta, uasg] as const;
export const RESUMO_REAJUSTE_ATAS_KEY = ['reajuste-atas-resumo'] as const;
export const ROTULO_REAJUSTE_ATAS = 'reajuste das atas';

/** Ciclos, projeção por item e reajustes publicados de uma ata da SENASP (migrations 158 e 159). */
export function useReajusteDaAta(numeroAta: string | undefined, uasg: string | undefined, opts: { enabled?: boolean } = {}) {
  const query = useQuery<ReajusteDaAta, Error>({
    queryKey: REAJUSTE_DA_ATA_KEY(numeroAta ?? '', uasg ?? ''),
    queryFn: () => fetchReajusteDaAta(numeroAta as string, uasg as string),
    enabled: Boolean(numeroAta && uasg) && opts.enabled !== false,
    staleTime: 5 * 60 * 1000
  });
  return { ...query, data: query.data ?? REAJUSTE_VAZIO, consulta: query };
}

/** Uma linha por ata vigente com parâmetros de reajuste (Início). */
export function useResumoReajusteAtas(opts: { enabled?: boolean } = {}) {
  const query = useQuery<ResumoReajusteAta[], Error>({
    queryKey: RESUMO_REAJUSTE_ATAS_KEY,
    queryFn: fetchResumoReajusteAtas,
    enabled: opts.enabled !== false,
    staleTime: 5 * 60 * 1000
  });
  return { ...query, data: query.data ?? [], consulta: query };
}

/** Gestor da ata ou coordenador: informar o Termo de Conformidade e o percentual de um reajuste. */
export function useAcoesReajuste(numeroAta: string, uasg: string) {
  const queryClient = useQueryClient();
  const aoTerminar = () => {
    queryClient.invalidateQueries({ queryKey: REAJUSTE_DA_ATA_KEY(numeroAta, uasg) });
    queryClient.invalidateQueries({ queryKey: RESUMO_REAJUSTE_ATAS_KEY });
    queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
  };
  const informarTermo = useMutation({
    mutationFn: informarTermoConformidade,
    retry: 0,
    onSettled: aoTerminar
  });
  const informarPercentual = useMutation({
    mutationFn: informarReajusteAta,
    retry: 0,
    onSettled: aoTerminar
  });
  return { informarTermo, informarPercentual };
}
