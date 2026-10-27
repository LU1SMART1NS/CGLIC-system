import { useQuery } from '@tanstack/react-query';
import { fetchTermosDeProrrogacao } from '../services/termosProrrogacaoService';

/** Termos aditivos de prorrogação da ata (migration 222); só lê quando `enabled` (o aviso está aberto). */
export function useTermosDeProrrogacao(numeroAta: string, uasg: string, enabled = true) {
  return useQuery({
    queryKey: ['termos-prorrogacao', numeroAta, uasg],
    queryFn: () => fetchTermosDeProrrogacao(numeroAta, uasg),
    enabled: enabled && Boolean(numeroAta && uasg),
    staleTime: 30 * 60 * 1000
  });
}
