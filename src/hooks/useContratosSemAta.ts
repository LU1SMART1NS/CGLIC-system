import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmarContratoSemAta,
  desfazerContratoSemAta,
  fetchContratosSemAta,
  fetchMarcasSemAtaDesfeitas,
  type ContratoSemAtaConfirmacao,
  type MarcaSemAtaDesfeita
} from '../services/contratoSemAtaService';

export const CONTRATOS_SEM_ATA_KEY = ['contratos-sem-ata'] as const;
/** Começa com a mesma chave: invalidar CONTRATOS_SEM_ATA_KEY relê as marcas desfeitas junto. */
export const MARCAS_SEM_ATA_DESFEITAS_KEY = ['contratos-sem-ata', 'desfeitas'] as const;

/** Contratos que o coordenador confirmou que não têm ata, por chave do contrato. */
export function useContratosSemAta({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<Record<string, ContratoSemAtaConfirmacao>, Error>({
    queryKey: CONTRATOS_SEM_ATA_KEY,
    queryFn: fetchContratosSemAta,
    enabled,
    staleTime: 5 * 60 * 1000
  });
}

/** Marcas "não pertence a ata" desfeitas: o contrato volta à fila de Vínculos até nova decisão (migration 152). */
export function useMarcasSemAtaDesfeitas({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<Record<string, MarcaSemAtaDesfeita>, Error>({
    queryKey: MARCAS_SEM_ATA_DESFEITAS_KEY,
    queryFn: fetchMarcasSemAtaDesfeitas,
    enabled,
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
