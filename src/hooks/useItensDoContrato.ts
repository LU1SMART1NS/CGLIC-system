import { useQuery } from '@tanstack/react-query';
import { fetchItensDoContrato, fetchNumerosDosItensDosContratos, type ItensDoContrato } from '../services/itensContratoService';

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

/**
 * Números dos itens de vários contratos (vínculo parcial na Central). Query Key: ['itens-contrato', 'numeros', ...chaves],
 * dentro de ['itens-contrato'] para a sincronização invalidar junto.
 */
export function useNumerosDosItensDosContratos(contractKeys: string[]) {
  return useQuery<Map<string, number[]>, Error>({
    queryKey: ['itens-contrato', 'numeros', ...contractKeys] as const,
    queryFn: () => fetchNumerosDosItensDosContratos(contractKeys),
    enabled: contractKeys.length > 0,
    staleTime: 5 * 60 * 1000
  });
}
