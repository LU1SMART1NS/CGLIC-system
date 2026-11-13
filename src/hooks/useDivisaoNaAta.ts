import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { A_CONFERIR, fetchDivisoesNaAta, marcarDivisaoDaAta, type DivisaoNaAta, type SituacaoDivisao } from '../services/divisaoNaAtaService';

export const DIVISAO_NA_ATA_KEY = ['divisao-na-ata'] as const;
export const ROTULO_DIVISAO_NA_ATA = 'divisão das atas entre as unidades';

/** Marcação da divisão por ata. Enquanto não carrega (ou se falhar), toda ata fica "a conferir": cobrada como antes. */
export function useDivisoesNaAta({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({ queryKey: DIVISAO_NA_ATA_KEY, queryFn: fetchDivisoesNaAta, staleTime: 5 * 60_000, enabled });
  const mapa = query.data instanceof Map ? query.data : undefined;
  const de = useCallback((ataKey: string): DivisaoNaAta => mapa?.get(ataKey) ?? A_CONFERIR, [mapa]);
  return { de, query, mapa };
}

export function useMarcarDivisaoDaAta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { numeroAta: string; uasg: string; situacao: Exclude<SituacaoDivisao, 'A_CONFERIR'> | null }) => marcarDivisaoDaAta(v.numeroAta, v.uasg, v.situacao),
    onSuccess: () => qc.invalidateQueries({ queryKey: DIVISAO_NA_ATA_KEY })
  });
}
