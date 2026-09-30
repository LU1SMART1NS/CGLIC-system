import { useMemo } from 'react';
import type { ContractDashboardRecord, ContractTaskPlan } from '../types';
import { useContractPaymentFollowUp } from './useContractPaymentFollowUp';
import { buildContractActionQueue, type ContractActionQueue } from '../services/contractActionQueueService';
import { useReminderDismissals } from './useReminderDismissals';
import { getContractManagementKey } from '../services/contractManagementService';

const EMPTY_QUEUE: ContractActionQueue = {
  items: [],
  counts: { CRITICA: 0, URGENTE: 0, ATENCAO: 0, INFO: 0 },
  tarefasSemPrazo: 0,
  dispensados: []
};

export function useContractActionQueue(
  contract: ContractDashboardRecord | null | undefined,
  plan: ContractTaskPlan | null
): { queue: ContractActionQueue; contractKey: string; isLoading: boolean } {
  const contractKey = contract ? contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano) : '';
  const { cycles, isLoading } = useContractPaymentFollowUp(contractKey);
  const { dismissedIds } = useReminderDismissals('CONTRATO', contractKey);

  const queue = useMemo(
    () => (contract ? buildContractActionQueue({ contract, contractKey, plan, paymentCycles: cycles, dismissedReminderIds: dismissedIds }) : EMPTY_QUEUE),
    [contract, contractKey, plan, cycles, dismissedIds]
  );

  return { queue, contractKey, isLoading };
}
