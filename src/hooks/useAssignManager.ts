import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  assignManagerWithPropagation,
  type ManagerAssignmentResult,
  type ManagerTarget
} from '../services/managerAssignmentService';
import type { ArpItemContractLinkPair } from '../services/arpContractLinkService';
import type { ContractDashboardRecord } from '../types';

export interface AssignManagerInput {
  targets: ManagerTarget[];
  gestorNome: string;
  gestorUserId?: string | null;
  links: ArpItemContractLinkPair[];
  contractsByKey?: Map<string, ContractDashboardRecord>;
}

/** Recarrega todos os mapas de gestor (Atas e contratos) e o escopo derivado deles. */
export function invalidateManagerQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['all-ata-managers'] });
  queryClient.invalidateQueries({ queryKey: ['ata-manager'] });
  queryClient.invalidateQueries({ queryKey: ['all-contract-managers'] });
  queryClient.invalidateQueries({ queryKey: ['contract-manager'] });
}

/** Atribui gestor com propagação Ata ↔ contratos vinculados (managerAssignmentService). */
export function useAssignManager() {
  const queryClient = useQueryClient();

  return useMutation<ManagerAssignmentResult, Error, AssignManagerInput>({
    mutationFn: (input) => assignManagerWithPropagation(input),
    retry: 0,
    onSettled: () => invalidateManagerQueries(queryClient)
  });
}
