import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveContractManagerRpc, type ContractManagerInput } from '../adapters/contractManagementRpcAdapter';
import type { RpcContractManagerResult, AppMutationError } from '../types/rpc';
import { getContractManagementKey } from '../services/contractManagementService';

/**
 * Hook canônico do React Query para atribuir/atualizar o Gestor de um contrato.
 *
 * Arquitetura:
 * UI -> useSaveContractManager() -> saveContractManagerRpc() -> save_contract_manager_atomic()
 */
export function useSaveContractManager() {
  const queryClient = useQueryClient();

  return useMutation<RpcContractManagerResult, AppMutationError | Error, ContractManagerInput>({
    mutationFn: async (input: ContractManagerInput) => {
      return saveContractManagerRpc(input);
    },
    retry: 0,
    onSuccess: (_data, variables) => {
      const contractKey = getContractManagementKey(variables.uasg, variables.numero, variables.ano);
      queryClient.invalidateQueries({ queryKey: ['contract-manager', contractKey] });
    }
  });
}
