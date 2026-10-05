import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmarContratoSemAta,
  desfazerContratoSemAta,
  fetchContratosSemAta,
  type ContratoSemAtaConfirmacao
} from '../services/contratoSemAtaService';

export const CONTRATOS_SEM_ATA_KEY = ['contratos-sem-ata'] as const;

/** Contratos que o coordenador confirmou que não têm ata, por chave do contrato. */
export function useContratosSemAta() {
  return useQuery<Record<string, ContratoSemAtaConfirmacao>, Error>({
    queryKey: CONTRATOS_SEM_ATA_KEY,
    queryFn: fetchContratosSemAta,
    staleTime: 5 * 60 * 1000
  });
}

export function useConfirmarContratoSemAta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: confirmarContratoSemAta,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONTRATOS_SEM_ATA_KEY })
  });
}

export function useDesfazerContratoSemAta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: desfazerContratoSemAta,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONTRATOS_SEM_ATA_KEY })
  });
}
