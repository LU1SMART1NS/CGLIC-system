import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  descartarAtaDoContrato,
  fetchDescartesAtaContrato,
  restaurarAtaDoContrato,
  type DescarteAtaContrato
} from '../services/contratoAtaDescarteService';

export const DESCARTES_ATA_CONTRATO_KEY = ['contrato-ata-descartes'] as const;

/** Atas descartadas por contrato ("contrato|ata" → descarte). */
export function useDescartesAtaContrato() {
  return useQuery<Record<string, DescarteAtaContrato>, Error>({
    queryKey: DESCARTES_ATA_CONTRATO_KEY,
    queryFn: fetchDescartesAtaContrato,
    staleTime: 5 * 60 * 1000
  });
}

export function useDescartarAta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: descartarAtaDoContrato,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: DESCARTES_ATA_CONTRATO_KEY })
  });
}

export function useRestaurarAta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restaurarAtaDoContrato,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: DESCARTES_ATA_CONTRATO_KEY })
  });
}
