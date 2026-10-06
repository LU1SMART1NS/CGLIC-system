import { useQuery } from '@tanstack/react-query';
import { fetchItensDoContrato, type ItensDoContrato } from '../services/itensContratoService';

/**
 * Itens do contrato gravados no banco, com os vínculos à ata. Query Key: ['itens-contrato', contractKey].
 * A sincronização em segundo plano invalida ['itens-contrato'] quando grava itens novos.
 */
export function useItensDoContrato(contractKey: string, enabled: boolean = true) {
  return useQuery<ItensDoContrato, Error>({
    queryKey: ['itens-contrato', contractKey] as const,
    queryFn: () => fetchItensDoContrato(contractKey),
    enabled: Boolean(enabled && contractKey),
    staleTime: 5 * 60 * 1000
  });
}
