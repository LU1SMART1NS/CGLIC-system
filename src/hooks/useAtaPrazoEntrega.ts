import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { confirmarPrazoDaAta, fetchPrazoDaAta, type PrazoDaAta } from '../services/ataPrazoEntregaService';
import { FISCALIZACAO_CONTRATOS_KEY, FISCALIZACAO_ENTREGAS_KEY } from './useFiscalizacao';

const chave = (ataKey: string) => ['ata-prazo-entrega', ataKey] as const;

/** Prazo de entrega da ata (migration 301): sugestão do TR e o prazo confirmado. */
export function usePrazoDaAta(ataKey: string, enabled = true) {
  return useQuery<PrazoDaAta | null, Error>({
    queryKey: chave(ataKey),
    queryFn: () => fetchPrazoDaAta(ataKey),
    enabled: enabled && Boolean(ataKey),
    staleTime: 5 * 60 * 1000
  });
}

/** Confirma (ou corrige) o prazo da ata; os contratos da ata e os itens da Fiscalização recarregam. */
export function useConfirmarPrazoDaAta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: confirmarPrazoDaAta,
    onSuccess: (_r, input) => {
      void qc.invalidateQueries({ queryKey: chave(input.ataKey) });
      void qc.invalidateQueries({ queryKey: FISCALIZACAO_CONTRATOS_KEY });
      void qc.invalidateQueries({ queryKey: FISCALIZACAO_ENTREGAS_KEY });
    }
  });
}
