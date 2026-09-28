import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAtaManager,
  fetchAllAtaManagers,
  saveAtaManagerRpc,
  type AtaManagerInput
} from '../services/ataManagerService';
import { fetchAllArpItemContractLinks, type ArpItemContractLinkPair } from '../services/arpContractLinkService';
import type { AtaManager } from '../types';
import type { RpcAtaManagerResult, AppMutationError } from '../types/rpc';

/**
 * Hook canônico do React Query para consulta do Gestor de uma Ata específica.
 * Query Key Canônica: ['ata-manager', ataKey]
 */
export function useAtaManager(ataKey: string) {
  return useQuery<AtaManager | null, Error>({
    queryKey: ['ata-manager', ataKey] as const,
    queryFn: async () => fetchAtaManager(ataKey),
    enabled: Boolean(ataKey),
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Hook canônico do React Query para o mapa completo de Gestores de Ata,
 * indexado por ata_key. Usado tanto pelo escopo do perfil "gestor"
 * (useAssignedManagementScope) quanto pelo seletor de gestor na tela de Atas.
 */
export function useAllAtaManagers() {
  return useQuery<Record<string, AtaManager>, Error>({
    queryKey: ['all-ata-managers'] as const,
    queryFn: async () => fetchAllAtaManagers(),
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Hook canônico do React Query para os vínculos item↔contrato
 * (public.arp_item_contract_links), reduzidos ao par {ataKey, contractKey} —
 * usado só para resolver o escopo do perfil "gestor" em
 * useAssignedManagementScope.ts.
 */
export function useArpItemContractLinks(enabled: boolean = true) {
  return useQuery<ArpItemContractLinkPair[], Error>({
    queryKey: ['all-arp-item-contract-links'] as const,
    queryFn: fetchAllArpItemContractLinks,
    enabled,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Hook canônico do React Query para atribuir/atualizar o Gestor de uma Ata.
 *
 * Arquitetura:
 * UI -> useSaveAtaManager() -> saveAtaManagerRpc() -> save_ata_manager_atomic()
 */
export function useSaveAtaManager() {
  const queryClient = useQueryClient();

  return useMutation<RpcAtaManagerResult, AppMutationError | Error, AtaManagerInput>({
    mutationFn: async (input: AtaManagerInput) => saveAtaManagerRpc(input),
    retry: 0,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ata-manager', variables.ataKey] });
      queryClient.invalidateQueries({ queryKey: ['all-ata-managers'] });
    }
  });
}
