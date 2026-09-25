import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orchestrateContractEmpenhoSync } from '../services/empenhoOrchestrationService';
import type { OrchestrationResult, ContractTarget } from '../types/empenhoSync';

export interface SyncContractEmpenhosParams {
  contratoId?: number | string;
  pncpParams?: ContractTarget['pncpParams'];
}

/**
 * Hook React Query para orquestração on-demand de sincronização de empenhos de Contrato.
 * 
 * Invariantes Invioláveis:
 * 1. O hook NÃO contém lógica contábil, de normalização ou reconciliação.
 * 2. Delega integralmente a execução para `orchestrateContractEmpenhoSync`.
 * 3. Invalida exclusivamente as query keys necessárias (M18 e detalhes do contrato).
 */
export function useSyncContractEmpenhos(contractKey: string) {
  const queryClient = useQueryClient();

  return useMutation<OrchestrationResult, Error, SyncContractEmpenhosParams | void>({
    mutationFn: async (params) => {
      const target: ContractTarget = {
        tipo: 'CONTRATO',
        contractKey,
        contratoId: params?.contratoId,
        pncpParams: params?.pncpParams
      };
      return orchestrateContractEmpenhoSync(target);
    },
    onSuccess: () => {
      // Invalidação cirúrgica de caches M18 e visões relacionadas ao Contrato
      queryClient.invalidateQueries({ queryKey: ['contract', contractKey] });
      queryClient.invalidateQueries({ queryKey: ['v_contrato_empenhos_lastro', contractKey] });
      queryClient.invalidateQueries({ queryKey: ['v_empenhos_resumo'] });
      queryClient.invalidateQueries({ queryKey: ['contract-events', contractKey] });
    }
  });
}
